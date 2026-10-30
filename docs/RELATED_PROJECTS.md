# 同类项目调研（2026-10-30 更新）

本站是「AIHOT 框架 + 公益行业定制」。这份文档记录同框架项目与框架外同类站的**做法**，
以及我们采纳了哪些、为什么没采纳另一些。它服务两件事：不重复发明，也不为凑功能而改。

调研范围分三层：**同一套框架的姊妹项目**（可直接对比实现）、**社区衍生站点**（同框架改造出来的
行业站，规模与成本可比），以及**框架外、但解决相似问题的项目**（可借鉴思路，不能照抄代码）。

## 一、同框架：AIHOT 与 PsyHOT

| 项目 | 定位 | 与本项目的关系 |
| :--- | :--- | :--- |
| [KKKKhazix/AIHOT](https://github.com/KKKKhazix/AIHOT) | AI 行业热点站（MIT） | 代码来源。本站全部基础设施（采集、归并、发布、报告、后台）基于它 |
| [zhangheqing11/PsyHOT](https://github.com/zhangheqing11/PsyHOT) | 心理学 / 精神医学方向（MIT），在线站点 [psyhot.cn](https://psyhot.cn) | 姊妹项目。Agent Skill 包与付费通道写法来自它 |

**已从 PsyHOT 采纳**（`6a3dde1` 及之后，均为其相对 AIHOT 的新增部分）：

- Agent Skill 包：站内自校验的 `SKILL.md` + `manifest.sha256` + `install.sh`，
  要点是**能力全在服务端**——站点加功能不需要用户重装 Skill。
  回答文本本身的格式与外部资料围栏（`［SITE 不可信外部资料开始/结束］`）是 AIHOT 的（早于 PsyHOT 五天），
  PsyHOT 的贡献是把它改成 HTTP 单通道（去掉 MCP 层），我们沿用这一版。
- 更新日志的写法：发布说明体，标题是读者能感知的结果，正文不写字段名、命令和阈值。（写作习惯，非代码）
- 付费采集通道的适配写法（EveryInfra）：预算闸 + 402 视为不可重试 + 预算耗尽时保住已付费的列表结果。

**未采纳**：分主题邮件订阅（本站单赛道，已有按期投递）、心理健康话术与求助热线（本站是公益领域，
危机转介文案另写）、热门榜的“赛道保底席位”（本站热点榜单赛道，无赛道概念）、
热门榜的单源两席上限（见下）。

## 二、社区衍生站点（同框架改造出来的行业站）

2026-10-30 补。来源两侧：GitHub 侧扫了 2164 个 fork + 上游「作品展示区」11 篇；微信侧三篇由用户补充。
**微信这三篇 fork 扫描没召回**——两篇作者没开源仓库，另一篇（`ai-ux-research-hot`）是 Python 重写的
非 fork 仓库，名字里不带 AIHOT，代码搜索命中不到。所以「扫了 2000 个 fork」≠「看全了社区实践」。

### 2.1 微信侧三篇（用户 2026-10-30 提供，站点均实测在线）

| 站点 | 行业 | 规模 | 关键做法 |
| :--- | :--- | :--- | :--- |
| [拾玖说跨境资讯](https://news.blues19.com)（拾玖Blues，10-12） | 跨境电商 | 104 源（RSS 42 / 网页 41 / 接口 21），累计 2.6 万条 → 245 精选 → 42 期日报 | 按跨境场景重建主题体系（Amazon/Shopify/TikTok Shop、CBP/关税合规）；评分标准往「有明确事实、适用市场、经营影响」压，招商课与软文一律压到门槛下；顺手开 AI 资讯、GitHub Trending 两个副刊；RSS + REST API + MCP + Markdown 四套出口 |
| [品牌AI外刊](https://news.sevenailab.com)（Seven 的 AI 笔记，10-09） | 海外品牌 × GEO | 589 候选 → **141 入选** | **先写准入规则、再看候选**：5 条一票否决（60 天未更新 / 抓不到 / 离题 / 纯转载或 SEO 农场 / 付费墙）+ 6 项 18 分制，12 分以上才进；**拿 100 条真实文章人工逐条判**，Claude 初判 89 同意 11 改判，**改判理由写回评分标准**；服务器 0 元：MacBook 跑采集与模型，每 2 小时导出 2000+ 页静态站推 Cloudflare Pages |
| [URHOT · AI 用研热点](https://huangzhenhao90.github.io/ai-ux-research-hot/)（真知浩见，10-30） | AI × 用户研究 | 45 源，[仓库](https://github.com/huangzhenhao90/ai-ux-research-hot)（Python 重写、MIT、80 提交、**非 fork**） | **零服务器**：GitHub Actions 每 4 小时跑一次，结果存 JSON，Next.js 静态导出挂 GitHub Pages；每条 3.8 次调用 ≈3,600 token；自加用研校招/社招看板（11 家公司招聘官网接口可用）；`eval/` 有金标工具链，但作者自认门槛仍按分数分布定、未做金标验证 |

### 2.2 成本不能只看日额：URHOT 一天 6 毛，是因为一天只有 20 条

同模型（都是 `deepseek-flash`），所以可比：

| | URHOT | Yi-Hot |
| :--- | ---: | ---: |
| 信源数 | 45 | 200+ |
| 每天新条目 | **≈20** | ≈930 采集，入池 121+ |
| 调用次数/条 | 3.8 | 5（含 2 次评分）；预筛 BLOCK 的只花 1 次 |
| 日成本 | ¥0.6–1.2 | ¥3.1–4.1（今日新闻口径） |
| **单条成本** | **≈¥0.03**（按零缓存命中的保守上界） | **≈¥0.004** |

→ **Yi-Hot 单条成本反而低约 7 倍**：提示词前缀在各次调用间一字不差，DeepSeek 上下文缓存命中后输入价
降到 1/50，加上三道闸门（预筛、惰性结构抽取、灰区才跑第二票）挡掉了大量后续调用。
**"别人一天几毛"不构成我们改架构的理由**；真正的大单项仍然是搜索源 API（≈¥46/月），不是分析管道。

### 2.3 值得抄的三件事

1. **金标验证**（品牌AI外刊的 100 条人工逐条判、URHOT 的 `eval/gold.jsonl` + `eval_selection.py` 门槛扫描）。
   我们的精选门槛也是调出来的，没做过金标。这两家都指同一条路：导出金标候选表 → 人工标 → 扫描门槛 → 看改判。
2. **准入规则先写后筛**（品牌AI外刊 589 → 141）。我们是事后看入池率淘汰，规则是反推出来的；
   把「一票否决 + 打分项」先写下来，能减少"看着顺眼就放进来"。
3. **防误花钱的开关**。URHOT 的三重安全阀（`--execute` + 有 `LLM_API_KEY` + `MODEL_CALLS_ENABLED=true`
   同时成立才真调模型，默认永远零成本）正是我们在容器里做一次性实验时靠人工纪律保的事情
   （见 `docs/COST.md`：实验 receipt 的 origin 是 `live`，会进账单，跑完要 DELETE）。

**不抄**：零服务器 / 静态导出这条路线（MacBook + Cloudflare Pages、Actions + Pages）。我们要实时搜索、
后台、按天归档，Postgres 是刚需；静态化换来的省钱幅度（服务器 ¥8.25/月）不值得。但两条硬经验存下来：
**`pages.dev` 国内解析正常、`vercel.app` 有 DNS 污染**；静态化代价是失去搜索与站内反馈。

### 2.4 GitHub 侧扫描结论（同日）

- 2164 个 fork 里**只有 130 个（6%）真有自有提交**，其余全是点星。提交 ≥100 的 9 个，1–9 的 82 个；
  近 7 天仍在提交的 42 个，**落后上游 100+ 提交的 55 个**（改完就不管上游了）。
- 行业全景：汽车（AUTOHOT×3）、机器人/具身（ROBOTHOT×2）、金融（FinanceHot、A 股、qhot）、
  保险（InsurHOT、baoxian.news）、房地产 REHOT、医疗信息化 HITHOT、漏洞 vulnhot、芯片 ChipHOT、
  地理 GeoHot、游戏 GAMEHOT（韩语）、葡语 MedIA-briefing 等。
- 上游「作品展示区」是在线案例密度最高的地方：大厂观察 → innews.site、RoboHot → robohot.news、
  MediaStack → mediastack.work、AI4Math Radar（数学论文，按证据分级）、营销通鉴 → yingxiaoclub.com/news
  （AIHOT 只跑内网做采集/打分/归组，主站每 30 分钟按游标同步精选，SEO 权重留在原站）。
- **最值得跟进的一条**：[青砚](https://github.com/evildj1221/qingyan)（环保/EHS，MIT）——
  130+ 信源，并写了 **we-mp-rss + 微信读书通道的免费公众号采集管道**（130+ 个号零 API 费），
  正对上我们 everyinfra 停服后 8 个公众号源停摆的缺口。另修了 4 个上游 bug，其中
  **web_list 的 detail 默认 `maxFetches=0` 导致详情页永不抓取**这条我们大概率也踩着，待查证。

### 2.5 讨论区 21 条全量索引（2026-10-30 抓取）

上游的 Discussions 是「谁做了什么」密度最高的地方，但 21 条要一条条点开才能拼出全貌。以下是全量索引，
按分类排；**「可复用的东西」一列才是重点**——大部分站只贴一个链接，真正能搬走的是少数几条。

**Show and tell（11 条，10 个项目）**

| 讨论 | 作者 | 说了什么 | 可复用的东西 |
| :--- | :--- | :--- | :--- |
| [#272](https://github.com/KKKKhazix/AIHOT/discussions/272) / [#244](https://github.com/KKKKhazix/AIHOT/discussions/244) | skynet2000 | [大厂观察](https://innews.site/)：互联网职场（裁员招聘/组织/经营/政策四栏），两小时一采，热点榜 + 日报，中英切换，Google/GitHub 登录同步收藏。[仓库](https://github.com/skynet2000/dachang-observer) | 同一项目发了两次（早期版 + 建成后），说明**展示帖要等站能看再发**；登录同步收藏是社区里少见的「有账号体系」的改法 |
| [#253](https://github.com/KKKKhazix/AIHOT/discussions/253) | evildj1221 | [青砚](https://qingyannews.cn)：环保与双碳，130+ 源（部委 + 31 省厅 + 79 地市局 + 行业媒体），两次评分，早 8:10 日报。[仓库](https://github.com/evildj1221/qingyan) | **最有价值的一条**：`integrations/wemprss-bridge/`（已核实存在）是 we-mp-rss + 微信读书通道的免费公众号管道，130+ 号零 API 费；另有邮件订阅双确认、运维告警 + 每日心跳邮件 |
| [#65](https://github.com/KKKKhazix/AIHOT/discussions/65) | Charlie-Wang-03 | [AI4Math Radar](https://charlie-wang-03.github.io/ai4math-radar/)：AI for Mathematics，[仓库](https://github.com/Charlie-Wang-03/ai4math-radar) | 把「一条消息值不值得记」拆成可判断的问题链：模型自称解决 vs 作者复核 vs 是否有 Lean/Coq 机器验证 vs 形式化命题是否就是原问题。**证据分级**的写法比分数门槛更可解释 |
| [#174](https://github.com/KKKKhazix/AIHOT/discussions/174) | Azhu9701 | [AIMAN.World 聚身之家](https://www.aiman.world/)：机器人产业数据库 + 图谱 + MCP 接入，公开查询免 API Key。[仓库](https://github.com/Azhu9701/AIMAN-World-Hub) | 把**厂商声明 / 待核验 / 已审核**三态分开存，缺失参数一律留「未知」，公开贡献先进待审收件箱；图谱里的资料连线与已确认关系分开画。可信度做法里最完整的一套 |
| [#132](https://github.com/KKKKhazix/AIHOT/discussions/132) | jtmovie | [营销通鉴 · 平台动态](https://yingxiaoclub.com/news)：营销平台规则变化。[仓库](https://github.com/jtmovie/yingxiao-hot) | **不开前台的部署形态**：AIHOT 只在内网跑采集/打分/归组，主站每 30 分钟按游标同步精选、按自己版式展示，SEO 权重留在原站。适合「已有站点想加一个栏目」 |
| [#192](https://github.com/KKKKhazix/AIHOT/discussions/192) | jasonsunai | [RoboHot](https://robohot.news)：机器人产业，面向研发者与入行者 | 明说改行业真正花时间的地方是**把筛选标准改成面向某类读者**，不是换信源；并划了收录边界（泛 AI 消息必须有明确的机器人研发/应用联系） |
| [#206](https://github.com/KKKKhazix/AIHOT/discussions/206) | kaysono0 | [MediaStack](https://mediastack.work/)：音视频技术情报，日报 + 精选 | 自述动机是「信息茧房」；坦承「比较耗费 Token」——成本是这类个人站的共同压力 |
| [#217](https://github.com/KKKKhazix/AIHOT/discussions/217) | albertwang168 | [NewsIQ](https://newsiq.xyz)：新闻事件聚合 | 没讲做法，问的是一个更值得讨论的问题：多个用 vibe coding 做出来的站，为什么表结构和产品形态会高度相似——是 Agent、Skill 还是模型先验决定的 |
| [#254](https://github.com/KKKKhazix/AIHOT/discussions/254) | foxanran | [hot.foxnan.com](https://hot.foxnan.com/)：AI 新闻 | 只贴了链接，无做法 |
| [#98](https://github.com/KKKKhazix/AIHOT/discussions/98) | ywgx | [xabcnews.com](https://xabcnews.com)：AI 新闻 | 只贴了链接，无做法 |

**Ideas（5 条，不含本项目的 #283）**

| 讨论 | 作者 | 提了什么 | 状态 |
| :--- | :--- | :--- | :--- |
| [#82](https://github.com/KKKKhazix/AIHOT/discussions/82) | xiaojian94xiaojian | CI 是否该覆盖 Windows，附两个只在 Windows 暴露的可复现缺陷（`path.relative` 拿反斜杠串去匹配 posix 规则，导致架构守卫把 53 条合规写入报成违规） | 缺陷本身已由 PR #79 修；**CI 至今仍只有 `ubuntu-latest`**（已核实 `check.yml`），等于这些守卫在 Windows 上仍然失效 |
| [#143](https://github.com/KKKKhazix/AIHOT/discussions/143) | ChuHanModel | 按自定义「缓存输入 : 普通输入 : 输出」比例重算模型成本与性价比边界，[原型与源码](https://github.com/ChuHanModel/model-cost-lens)（MIT） | 未接入。与我们的结论一致：成本必须拆 hit/miss/out 三段，否则高估两倍以上 |
| [#37](https://github.com/KKKKhazix/AIHOT/discussions/37) | 1204kay | 同一站点输出多语言（马来西亚中/英/马来三语），[fork](https://github.com/1204kay/myfnbguide)。列了三条卡点：`title_zh/summary_zh/reason_zh` 单语言成稿、提示词按中文写、界面文案与 4 处「北京时间」写死 | 方向未定。这是「语言」维度，比「行业」维度的改动更深 |
| [#212](https://github.com/KKKKhazix/AIHOT/discussions/212) | wangduo404-eng | 部署到腾讯云后某新闻源触发 AWS WAF Challenge，本地 docker 无此问题 | 未解。**同一个容器本地能跑、上云被拦**，这类差异只会在部署后才暴露 |
| [#178](https://github.com/KKKKhazix/AIHOT/discussions/178) | gjj-star | 模型榜评分维度会不会加、要不要雷达图 | 正文只有占位符（`zsbd`），信息全在标题里，无法判断诉求 |

**Q&A（4 条）——这四条比 Ideas 更有信息量，因为它们是被真实卡住的人问的**

| 讨论 | 问题 | 暴露的文档缺口 |
| :--- | :--- | :--- |
| [#201](https://github.com/KKKKhazix/AIHOT/discussions/201) | 改了 `topics` 文件，网页还是 AI 的内容 | 「换领域要改哪几处、改完怎么确认生效」缺一份清单。`industry/` 目录的约定散在 `customize.md` 里，新人第一反应是改 `topics` |
| [#200](https://github.com/KKKKhazix/AIHOT/discussions/200) | 线上有 Agent Skill 接入，开源版里没有，是对的么 | 需要明说哪些能力只属于线上站点、不在开源范围内，否则每个人都要问一遍 |
| [#191](https://github.com/KKKKhazix/AIHOT/discussions/191) | 本地跑国际新闻站，每天约 90 美元，怎么省 | 成本的「怎么算 → 怎么降」缺一段可直接照做的路径（预筛、缓存命中、off-peak、按天幂等）。`docs/COST.md` 是本站写的，不是上游的 |
| [#69](https://github.com/KKKKhazix/AIHOT/discussions/69) | 「重置」是不是要订阅 X 的 API | `x_search` 采集器的凭据要求没写清 |

### 2.6 从 21 条讨论里读出来的三件事

1. **被重复解决最多的不是功能，是「适配」**：政府站没有 RSS、日期写法没见过、Node 握手协商不上、公众号通道太贵。
   这些解法都能直接搬，但没有地方搬——所以青砚的公众号管道、URHOT 的金标工具链，都只有作者自己知道。
2. **成本是个人站的共同天花板**，而且问法高度一致：「一天几刀怎么办」。回答却散在各处，没有一份能照做的。
3. **「独立实现」比 fork 更常见的原因，是 fork 之后不知道怎么跟上游**。2.4 的扫描里，落后上游 100+ 提交的有 55 个。
   改得越深越不敢跟，最后变成自己维护一条死分支。

这份索引和由它推出的三个协作提议（领域注册表、适配器以数据回贡、跨站索引只做索引不做混池）已同步到上游
[Discussion #284](https://github.com/KKKKhazix/AIHOT/discussions/284)。

## 三、框架外的同类站

| 项目 | 形态 | 值得学的点 |
| :--- | :--- | :--- |
| [Thysrael/Horizon](https://github.com/Thysrael/Horizon) | Python，MIT，「AI 新闻雷达」，多源 → 打分 → 双语日报 | ① **配置即产品**：源、阈值、模型、语言、投递方式全在一份 JSON；② 整条 pipeline 通过 MCP 暴露给 Agent；③ 抓取失败不中断整轮 |
| [ourongxing/newsnow](https://github.com/newsnext/newsnow) | TypeScript，MIT，66 个热榜源聚合成一面卡片墙 | ① **“可腐烂架构”**：承认每个源都会死，一源一文件，死亡影响限定在单个模块；② 抓取失败用旧缓存兜底，前端始终有内容；③ 按源的更新节奏自适应抓取间隔，避免打爆对方 |
| [service-dept/bandwidth](https://github.com/service-dept/bandwidth) | Python，公益与开源新闻的纯文本聚合，静态 HTML | ① **单一来源席位上限**（每个源最多占 2 席，共 30 条）；② 无 JS、无 Cookie、无追踪像素，纯文本即可读 |
| [tvanderb/Cronkite](https://github.com/tvanderb/Cronkite) | LLM 生成每日多源报告 | 按议题分节的报告结构，与我们的板块制一致 |
| [Open Newswire](https://www.opennewswire.org/faq/) | MIT，记者主导的新闻聚合 | **信源准入看许可**：只收按 CC 等开放许可发布的来源 |

## 四、逐条对照：我们已有 / 已改 / 不打算改

| 别人的做法 | 我们的现状 | 结论 |
| :--- | :--- | :--- |
| 单源席位上限（PsyHOT、bandwidth） | 热点榜按参与方数排序，天然要求 ≥2 个来源；日报不限流 | **不采纳**：汇聚型信源（公益时报这类把行业动态收在一处的）本来就该多占；限流会让日报丢掉当天最重要的几条 |
| 抓取失败降级、不中断整轮（Horizon、NewsNow） | `collect.ts`：单源失败只记 `health=degraded`，连续 5 次 `failing`，下次抓取按失败次数退避（上限 6 小时），并进运维巡检 | 已具备，无需重建 |
| 旧缓存兜底（NewsNow） | 我们的页面读数据库，已发布内容不会因采集失败消失；采集端有 cursor + 时间窗，不会重复入库 | 已具备 |
| 一源一文件、隔离扩展（NewsNow） | 信源是 `industry/sources.json` 的配置条目，新增源不改代码 | 已具备（形式不同，效果相同） |
| 自适应抓取间隔（NewsNow） | 按 `tier` + `interval_minutes` 显式配置，配合退避 | 不采纳：源只有几十个，显式配置更可预期 |
| 配置即产品、向导式接入（Horizon） | 已有 `docs/customize.md` 与 `industry/` 目录约定 | 不采纳向导：本站不是给陌生人一键开站的形态 |
| 整条 pipeline 暴露为 MCP（Horizon） | 已有 MCP 读接口（动态、搜索、热点、报告） | 已具备，写操作不对外 |
| 三档信号分级（Horizon 的 0–10 分 → 高/可参考/低） | 卡片直接给分数，精选另有门槛（35/35/40） | 不采纳：再加一档会和现有门槛重复 |
| 无 JS、无追踪（bandwidth） | 无第三方统计脚本，页面 SSR 输出 | 已具备 |
| 信源准入看许可（Open Newswire） | `docs/sources.md` 写明只取公开内容、默认只展示摘要与原文链接 | 已具备 |
| 订阅入口（AIHOT） | AIHOT **没有**订阅页：`more.tsx` 底部只有一行 12px 灰字的 `RSS` 链接，导航里无入口 | **不照抄**：我们已有完整订阅页，比它更近一步，缺的只是入口位置 |

## 五、曾试过又撤回的一项

- 2026-10-20 曾给日报加过同一信源最多 3 条的上限（`DAILY_MAX_PER_SOURCE`），当天即撤回。
  撤回理由：日报里那些"同一家媒体"的条目，多是公益时报这类把行业动态汇在一处的来源，
  同一期出现六七条往往正是当天该读的东西；限流只是把重要条目挪进「快讯」，并没有提高质量。
- 结论：**日报不限流**。信源质量该在信源准入和发布规则（`sources.publication_rule`）上解决，
  不在组稿时按条数摊平。

## 六、看这些项目时的一条判断标准

同类站点的“优点”分两种：**能力**（我们真缺）与**形态**（适合它们的用户规模，不适合我们）。
本次只补能力，不为对齐形态去加重配置和界面。若以后信源数量上一个量级，
NewsNow 的自适应间隔与“一源一文件”才值得重新评估。
