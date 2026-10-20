# 付费采集通道：现状、候选与接入方案

> **决策快照 · 2026-10-20（P1 已于同日落地，见第 5 节标注）**。本文回答「要不要买、买哪家、怎么接、怎么算钱、怎么不踩坑」。
> 关联文档：[WERSS_DEPLOY.md](WERSS_DEPLOY.md)（自建公众号采集）、[SOURCE_GOVERNANCE_DESIGN.md](SOURCE_GOVERNANCE_DESIGN.md)（信源状态机）、[INTEGRATION_ROADMAP.md](INTEGRATION_ROADMAP.md)（三库整合路线图）、[sources.md](sources.md)（信源类型与 EveryInfra 接入细节）。

## 0. 先看结论

- **公众号**：自建 WeRSS 当前是坏的（10-13 起实际停更，详见 WERSS_DEPLOY.md「会话有效期」）。短期靠「每 3 天扫码」维持；是否改用付费接口，等扫码节奏跑稳、确认内容确实需要日更再决定。
- **小红书**：**不自建爬虫**。签名、风控、封号、版权四重风险都不该由本项目承担，只走第三方「公开内容 API」，候选 EveryInfra（同源项目 PsyHOT 已用它跑生产）。
- **人民币口径**：列表侧 EveryInfra 更便宜（约为 Dajiala 的 1/3），详情侧 Dajiala 更便宜（¥0.03 vs 约 ¥0.09）。**广撒网关键词搜索用 EveryInfra，已有公众号补全文用 Dajiala。**
- **一切付费调用必须经过 `providers/receipts.ts` 与 `budgets` 熔断**，这是项目已有的硬边界，不因为是新 provider 就绕开。

## 1. 已有的付费通道（现状，不是计划）

| 服务 | 代码位置 | 计费 | 用途 | 预算熔断 |
| --- | --- | --- | --- | --- |
| 极致了 Dajiala | `packages/backend/src/providers/dajiala.ts` | 列表 `post_history` ¥0.14/次；正文 `article_detail` ¥0.03/次 | 公众号文章列表与正文 | `dajiala` 5/min、60/h、500/day（迁移 `0022`） |
| Jina | `providers/` 内正文兜底 | 按请求 | 拿不到正文时的兜底抽取 | `jina` 5/50/300 |
| SocialData | X 搜索 | 按请求 | X（推特）来源 | `socialdata` 10/100/1000 |

实现约定（新增 provider 必须照做）：

1. 通过 `paidRequest()` 调用，服务名登记到 `budgets`；预算为 0 即停服。
2. provider 返回的真实金额（如 Dajiala 的 `cost_money`）作为 `actual` 成本落库，不用估算值。
3. 429/5xx 抛 `ProviderRejectedError(retryable=true)`；余额不足、账号失效等业务错误不重试。
4. 失败、参数错误、空结果**不产生内容**，也不应该产生"成功"记录。

## 2. EveryInfra：能力与价格（核实于 2026-10-20）

**免费额度的真实情况**：没有每月免费额度。只有"加微信领 $1 额度码"（约 720 次 search，**24 小时有效**，普通注册不送）。最低充值 $10 ≈ 7,199 次。余额长期有效。

| 口径 | 价格 | 来源 |
| --- | --- | --- |
| 官方分档 | $0.56 / $1.39 / $2.78 / $5.56 每千次；小红书落在最高档 | 官方 pricing 页 |
| Apify Actor | `search`/`user_post` $0.0028/记录；`note`/`comments`/`user_info` $0.013/次 | Apify 页面 |
| PsyHOT 生产回执 | 一次小红书 `search` = **$0.005556** | 对方仓库实测 |

失败、参数错误、空结果不计费；预留额度会自动退回；充值后其 AI 接口免费。

**我方成本估算**（汇率按 7.2，仅用于预算，不作为账单）：

| 规模 | 列表调用 | 详情调用 | 月成本估算 |
| --- | ---: | ---: | ---: |
| 最小验证：3 个关键词 + 约 10 条详情/天 | 90 次 | 300 次 | 约 **$4.4 / ¥32** |
| 照 PsyHOT 规模：15 个关键词 + 约 30 条详情/天 | 450 次 | 900 次 | 约 **$14 / ¥102** |

对照：Dajiala 覆盖 26 个公众号、每天一次 ≈ **¥109/月**（不含详情）。两边不是替代关系，是分工。

## 3. 参考实现：PsyHOT 怎么接小红书（读源码结论）

仓库 `zhangheqing11/PsyHOT`（MIT，心理学版 AIHOT 改造，与我方同源，`receipts`/`budgets` 几乎同版）。

**关键结论：没有爬虫，也不处理签名与风控。** xhs 只是 `json_list` 的一个 `adapter` 分支，全部走付费 API。

信源形状：15 条，全部 `kind=json_list`、`tier=T2`、`interval_minutes=1440`。

| 类型 | 条数 | 参数 |
| --- | ---: | --- |
| `everyinfraAction: "search"` | 10 | `keyword` + `date_range: last_7_days` + `sort: newest` |
| `everyinfraAction: "user_posts"` | 5 | `user_id`（24 位 hex）+ `limit: 20` |

代码映射（照这个顺序读最省时间）：

| 文件 | 作用 |
| --- | --- |
| `providers/everyinfra.ts`（约 163 行） | `POST /api/v1/social`，body `{platform, action, params}`；xhs 三个 action：`search` / `user_posts` / `note`；全部经 `paidRequest` |
| `sources/json-list.ts` | `adapter === "everyinfra_xhs"` 的 6 处默认字段（`results` / `title` / `text` / `url` / `id` / `author_name` / `posted_at`）；**无 `url` 的笔记直接丢弃** |
| `sources/collect.ts:148–171` | `summaryIsBody:true` 时列表摘要直接当正文，跳过详情付费；否则按需升级详情，先查 `storedTitles`，已入库 URL 不再付详情费；`BudgetExceededError` 时 `break` 而不是 `throw` |
| `events/hot.ts` | `ENGAGEMENT_WEIGHT = least(2, 1 + log(1+赞+2×藏+3×评+3×转)/4)`，`MIN_PARTICIPANTS=2` 不变 |
| `industry/selection.ts` | `HOT.engagement {scale:4, maxWeight:2}` |
| `database/migrations/0044_everyinfra_budget.sql` | `budgets ('everyinfra', 10/min, 100/h, 1000/day)` |

三个值得直接抄的教训：

1. **列表 503 时不要退回"按账号名搜索"**。原实现这么做时抓到了别的公众号内容并重复付费；修复方式是该号 1 小时后重试，并用测试断言"只允许 `account_articles` 一种 action"。我方接入必须同样加断言。
2. **预算耗尽时 `break` 不 `throw`**。保住已经付费的列表结果，用摘要入库，比整批回滚更划算。
3. **互动数只收 `number` 类型**。`"5"` 这种字符串直接丢弃，否则热度排序会被脏数据带偏。

PsyHOT 用到的范围（对全仓库检索）：微博 / 知乎 / B站 / 抖音 **0 命中**，只有 xhs 与公众号。这是**对方仓库**的覆盖面，不是 EveryInfra 的。

### 4. EveryInfra 实际覆盖哪些平台（2026-10-20 查官方能力目录）

`GET https://api.everyinfra.com/api/v1/social/catalog`（无需 key）返回 **90 个平台、413 项能力**，每项带 `required_params`、`mode`、`price_usd`。中文内容平台一个不缺：

| 平台 | 关键能力 | 单价（USD/次） |
| --- | --- | ---: |
| `xiaohongshu` 小红书 | `search`、`user_posts`、`note`、`video`、`comments`、`hashtag`、`trending` | 0.00556 |
| `wechat_oa` 公众号 | `account_articles`（历史文章）、`account_today_articles`（当日）、`article_search`、`article_detail`、`article_metrics`、`wechat_index` | 0.00556 |
| `weibo` 微博 | `search`、`profile`、`comments`、`trending` | 0.00056 |
| `zhihu` 知乎 | `search`、`content_detail`、`content_comments`、`user_articles` | 0.00056 |
| `douyin` 抖音 | `search`、`user_posts`、`video`、`trending`、**`transcript`（视频文稿）** | 0.00056 |
| `bilibili` B站 | `search`、`user_posts`、`video`、**`subtitles`（字幕）** | 0.00056 |
| `kuaishou` 快手 | `search`、`user_posts` | 0.00056 |
| `toutiao` 头条 | `article`、`user_posts` | 0.00056 |
| `douban` 豆瓣 | `search`、`group_topic` | 0.00139 |
| `web` 通用网页 | `search` | 0.00139 |

另含淘宝 / 京东 / 1688 / 闲鱼 / 拼多多系（`taobao`、`jd`、`alibaba1688`、`xianyu`、`temu`）、以及 X、TikTok、YouTube、Instagram、Reddit 等海外平台，共 90 个。

**对本站有意义的两个数字**：

- 公众号走 EveryInfra 是 **$0.00556/次**。现有 Dajiala 是 ¥0.14 列表 + ¥0.03 正文，26 个号每天一次约 ¥109/月；
  EveryInfra 的 `account_today_articles` 同样规模约 **$4.3/月（≈¥31）**，且不需要每 3 天扫码。
  差别在于覆盖率与稳定性尚未实测——这是换掉 WeRSS 的候选，不是结论。
- 微博 / 知乎 / 抖音 / B站 单价只有小红书的 **1/10**（0.00056，即 $0.56/千次）。若要做机构官微或视频号，
  成本不构成障碍，障碍是内容质量与发布规则。

**本文其余部分未改动。** 上述能力以官方 catalog 为准；价格随调价变动，实付以控制台回执为准。


## 4. 落到本仓库要改什么

| 能力 | 我方现状 | 接 EveryInfra 需要做的事 |
| --- | --- | --- |
| 付费回执与预算 | 已有 `providers/receipts.ts` + `budgets`，与对方同源 | 只加预算行（我方下一迁移编号 **0041**），不改代码 |
| provider | 无 | 新增 `providers/everyinfra.ts`，走 `paidRequest` |
| 适配层 | `sources/json-list.ts` 无 `adapter` 分支 | 增加 `everyinfra_xhs` 字段映射 |
| 详情升级 | `sources/collect.ts` 无此段 | 抄 `storedTitles` 去重 + `BudgetExceededError` break |
| 噪声过滤 | 已有 `noiseFiltered`，但 `config-keys.ts` 的 NESTED 白名单缺 `requireMarkers` / `dropMarkers` | **先补白名单**，否则配置静默不生效 |
| 事件热度 | `events/hot.ts` 是 heat-v1，无互动加权 | 可选，需迁移 + 重新校准阈值 |
| 来源治理 | 已有 sources 状态机与 provenance | 新增 platform=xhs 的 channel，provenance 明确标注"第三方 API" |

## 5. 接入顺序（每阶段独立可停）

**P1 · 只读试跑（2026-10-20 已跑，结论：按源规则分轨放行）**
- 3 个关键词 × 每天 1 次 `search`，`summaryIsBody`，不开详情。
- 已落地：`providers/everyinfra.ts`、`json-list.ts` 的 `everyinfra_xhs` 适配、`collect.ts` 的详情升级（预算耗尽 break）、`config-keys.ts` 白名单（含 `requireMarkers`/`dropMarkers`）、迁移 `0041`（预算 5/20/60）、`industry/sources.json` 三个关键词信源（**默认 `enabled: false`）。
- **实测（$1 额度，4 次调用共 $0.0222 ≈ ¥0.16）**：
  - `公益项目`：14 条里几乎全是粉丝应援、本地小活动、营销贴（生日应援、免费洗纹身、家电积分），评分 8–18；
  - `困境儿童 资助`（噪声闸收紧后）：出现「白方礼攒 35 万资助贫穷孩子」50 分、「匿名资助 13 年」40 分等好内容，但仍有约 1/3 噪声（娱乐八卦、一对一募捐引流）；
  - `事实孤儿`：6 条，仅 1–2 条有意义。
  - **结论：关键词搜索命中的是 C 端内容，不是公益行业动态；换词与收紧闸只能削峰，不能改变调性。**
- 处置（第二轮，2026-10-20 晚）：不再一刀切降级，改为**按源分轨放行**——`participation_mode: "editorial"` + `publication_rule`（迁移 `0042`）：
  - `minScore: 40` 放人物善举（分数高但形态是故事）；
  - `scoreByCategory: {project: 20, policy: 18}` 放机构动态与政策（分数低但正是本站要的）；
  - 类别轨要求标题/摘要出现机构或项目主体词（`requireMarkers`），把同为 22 分但只是本地活动推广的软文挡在外面；
  - `dropCategories: ["fundraising"]` 拦个人募捐征集。
  - 规则不过的材料在归并阶段 `filtered`：不建事件、不发卡片、不计热度。用当天的 31 条实测样本回测，放行 7 条、误入 0 条（`tests/publication-rule.test.ts`）。
  - 首轮曾短暂降级为 `hot_signal`（只作讨论证据）：它保证“往后不再建事件”，但不回收此前 editorial 期已建的 15 个事件，那批已撤回并清理。
- 验证：同一关键词采集 15 条入库，公开列表 0 条；`/api/site/pool` 全 10 页 0 条小红书链接。
- 验收改为：7 天内规则放行的条目是否都有真实机构/项目主体、是否出现误入（软文、个人求助）；误入 >20% 就收紧 `requireMarkers` 或抬 `scoreByCategory`。
- 注：首次采集的存量帖子若发布时间早于发现时间超过阈值，`isHistorical` 会直接归档（`verdict: historical`），既不建事件也不计信号——匹配统计只看 `signal` / `signal-native`。

**P2 · 机构号**
- 5 个公益机构的小红书官方号 `user_posts`，`limit: 20`。
- 账号主体必须人工核验（防高仿号）；只收原创笔记，不做评论抓取。
- 验收：每条都能对上机构官网/公众号的同一活动。

**P3 · 详情升级**
- 只对「通过预筛 + 标题点名主题」的笔记拉详情，日上限 30 条。
- 验收：同一 URL 第二次不产生付费回执。

**P4 · 互动加权（可选）**
- 只对 xhs 来源启用，`MIN_PARTICIPANTS=2` 不变，权重上限 2 倍。
- **必须先有 2 周样本再校准阈值**，不允许无样本直接开。

## 6. 合规与内容边界（硬性）

- 只取**公开内容**：不登录、不绕过签名/风控、不做账号池。
- 存摘要 + 原文链接 + 作者公开昵称；**不落全文**，`site_fulltext` 保持关闭。
- 笔记正文版权属原作者；转载保留出处，商业使用另行评估。
- 点赞、收藏、评论**只能作热度信号，不得作为事实证据**；不抓评论做用户画像。
- 第三方数据不得二次分发原始数据集；对外只发布聚合后的选题与摘要。
- 机构号优先于关键词搜索；关键词命中的个人内容默认只作「发现信号」，进正式发布流需人工确认。

## 7. 明确不做

- 不写小红书签名算法、不接打码平台、不维护账号池。
- 不因为"有免费额度"就把它写进长期依赖（$1 只有 24 小时）。
- 不用「feed 返回 200」判定采集成功（见第 8 节新鲜度待办）。
- 不在没有预算熔断的情况下接入任何付费服务。

## 8. 待办

- [x] P1 试跑（10-20）：$1 额度跑 4 次（$0.0222），关键词产出与站点议题错位 → 先用 `hot_signal` 挡住，随后改为 `publication_rule` 分轨放行（分数硬线 + 类别线 + 主体词），详见第 5 节。
- [x] 迁移 `0041`：`budgets ('everyinfra', 5, 20, 60)`——比原计划 10/100/1000 更紧，按 P1+P3 的计划量（约 35 次/天）取两倍余量，失控才断。
- [ ] 公众号侧：等 WERSS 扫码节奏跑稳后，再评估 EveryInfra 公众号接口；**必须复现并验证 503 不做名字兜底**。
- [ ] 补「内容新鲜度」告警：`max(published_at)` 距今天数超过阈值就报警，而不是只看 fetch 成功。
- [x] 修正 `config-keys.ts` NESTED 白名单，补 `requireMarkers` / `dropMarkers`（`noiseFiltered` 同步实现 requireMarkers）。
