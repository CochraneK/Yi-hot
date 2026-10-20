# 信源

信源在后台“信源”页管理：新建、试抓一次看看抓到什么、改频率、启停、看失败原因和最近的条目。首次启动时，`industry/sources.json` 里的示范信源会被导入。

## 六种信源

| 类型 | 适合 | 需要 |
|---|---|---|
| `rss` | 有 RSS / Atom 的博客、媒体、Substack、公众号转 RSS 服务 | 无 |
| `web_list` | 没有 RSS 的网页列表（新闻页、博客列表、更新日志） | 写选择器；抓不到时可以经 Jina Reader 渲染（按次计费） |
| `json_list` | 返回 JSON 的接口（GitHub Releases 等） | 写字段路径 |
| `x_search` | X（推特）账号 | SocialData 的 key，按请求计费 |
| `mp_account` | 微信公众号 | 极致了（Dajiala）的 key，按请求计费 |
| `external` | 你自己的脚本推送进来的内容 | `INGEST_TOKEN`，见下文 |

每种信源认哪些配置项写在 `packages/backend/src/sources/config-keys.ts`。填了不认识的配置项，保存会被拒绝、抓取会直接失败并在后台显示原因，不会悄悄退回通用解析。

### rss

```json
{ "feedUrl": "https://example.com/feed.xml" }
```

可选：`summaryIsBody`（订阅里的摘要就是全文）、`allowCategories` / `denyCategories`（按订阅里的分类过滤）。

### web_list

```json
{
  "url": "https://example.com/news",
  "itemSelector": "article",
  "linkSelector": "a",
  "titleSelector": "h2",
  "publishedAtSelector": "time"
}
```

- `parseMode`：`html`（默认，用选择器）、`markdown`（经 Jina 渲染后按 Markdown 读）、`docusaurus_changelog`。
- `detail`：列表缺日期、标题或摘要时抓详情页补齐（`publishedAtSelector`、`titleSelector`、`summarySelector` 等）。
- `allowUrlPrefixes` / `denyUrlPrefixes`：只收某些路径下的文章。

### x_search

```json
{ "query": "from:SomeAccount -filter:replies" }
```

普通账号会被自动合并成一次搜索（每次最多二十几个账号），省请求数。

### 免费公众号 RSS（WeRSS）

自托管 WeRSS 扫码添加账号后，用 `rss` 类型和单账号 feed 地址接入，无需 Dajiala Key。后台“候选信源”有公众号 RSS 入口；部署及私网 feed 配置见 [WERSS_DEPLOY.md](WERSS_DEPLOY.md)。未部署 WeRSS 时保持 `WERSS_BASE_URL` 为空。不要启用全局私网抓取。

### mp_account

```json
{ "ghid": "gh_xxxxxxxx", "nickname": "公众号名称" }
```

每个公众号按它的抓取间隔检查一次（查列表按次计费），新文章的正文一并取回。

### 第三方社交平台内容 API（EveryInfra · 小红书）

小红书这类平台的公开内容接口，**不自己写爬虫**：签名、风控、账号池和版权风险都不该由本项目承担。小红书内容经 EveryInfra 的公开内容 API 读取，作为 `json_list` 的一个 `adapter` 分支接入（写法参考同源项目 PsyHOT）：

> 同一 provider 还覆盖公众号（`wechat_oa`）、微博、知乎、抖音、B站等 90 个平台，单价与能力见
> [PAID_CHANNEL_PROVIDERS.md](PAID_CHANNEL_PROVIDERS.md#4-everyinfra-实际覆盖哪些平台2026-10-20-查官方能力目录)。
> 目前只启用了小红书这一路。

```json
{
  "adapter": "everyinfra_xhs",
  "everyinfraAction": "search",
  "everyinfraParams": { "keyword": "公益项目", "date_range": "last_7_days", "sort": "newest" },
  "summaryIsBody": true,
  "ingestNoiseFilter": { "requireMarkers": ["公益", "慈善", "基金会"], "dropMarkers": ["带货", "课程"] }
}
```

- `adapter: "everyinfra_xhs"` 时不再抓公网 URL，改调 `POST /api/v1/social`；列表字段有默认映射（`results` / `title` / `text` / `url` / `id` / `author_name` / `posted_at`），**没有链接的笔记直接丢弃**；`summaryIsBody` 让列表摘要直接当正文，跳过详情付费。
- `everyinfraDetail: true` 才会对没见过的笔记调 `note` 详情（按次计费）；已入库的 URL 不再产生第二次详情费，预算耗尽时断开详情、保住已付费的列表结果。
- 列表自带的公开互动数（赞/藏/评/转）只收数字类型，存入 `raw`，目前仅备用，未参与热度计算。
- 每一次调用都经 `paidRequest` 记账，`budgets` 里 `everyinfra` 默认 5/20/60 次（分/时/天）；**不配 `EVERYINFRA_API_KEY` 时相关信源保持停用**（`enabled: false`），信源报错信息会写明缺 key。
- 合规边界：只取公开内容、不落全文、互动数只作热度信号不得作为事实证据，详见 [PAID_CHANNEL_PROVIDERS.md](PAID_CHANNEL_PROVIDERS.md) 第 6 节。
- 小红书信源按 `publication_rule` 分轨放行（2026-10-20 起）：关键词搜索里同时有「讲得好的人物善举」（分数高）和「机构项目动态/政策」（分数低但正是本站要的），单一分数线必然顾此失彼，所以门槛写在源上——`minScore: 40` 放人物故事，`scoreByCategory: {project: 20, policy: 18}` 放机构动态与政策，但后一条轨要求标题或摘要出现机构/项目主体词（`requireMarkers`），`dropCategories: ["fundraising"]` 拦掉个人募捐征集。规则不过的材料连事件都不建（`events/group.ts` 的 `filtered`），不产生卡片、也不占热度。
- 这套规则用 2026-10-20 的 31 条实测样本校准过，放行 7 条、无一误入（含一条同为 22 分但只是本地活动推广的软文），样本固化在 `tests/publication-rule.test.ts`。


## 分级、参与方式与全文

- **分级** `tier`：`T1` 官方一手（官网、官方博客、机构）、`T1_5` 官方账号与准官方创作者、`T2` 媒体与个人、`EXCLUDE_MP` 不参与精选。入选门槛按分级不同（`industry/selection.ts`）。
- **参与方式** `participation_mode`：`editorial` 进精选和全部动态；`hot_signal` 不单独展示，只作为“大家在讨论什么”的热度证据；`isolated` 不进任何公开页面。
- **按源规则** `publication_rule`（可选，迁移 `0042`）：在 `editorial` 之上再收紧一个源。字段都可选，缺省不限制：
  - `minScore`：分数硬线，达到即放行，不看类别；
  - `scoreByCategory`：给指定类别更低的分线，例如 `{"project": 20, "policy": 18}`；
  - `requireMarkers`：走类别线时，标题或摘要里必须出现其中之一（机构、项目主体词），防止“看起来很有爱”的软文混进来；
  - `dropCategories`：命中即拦，优先于上面三条（例如个人募捐征集 `fundraising`）。
  规则不过的材料在归并阶段直接 `filtered`：不建事件、不发布、不计热度。同一份规则同时用于归并与发布两处（`publication/rules.ts`），改一处不会漏另一处。
- **一手** `first_party`：来源是当事方自己。事件页会优先展示一手报道。
- **全文**：`site_fulltext` 决定站内能不能显示全文，`syndicate_fulltext` 决定全文 RSS 能不能带正文。两者**默认都关**，只显示摘要和原文链接；来源明确允许时再打开。公众号、付费墙内容不会因为技术上抓得到就获得全文展示。

## 抓取频率

每个信源有自己的抓取间隔。每天 04:20 会按近 7 天的产出自动调整：产出多的抓得勤，最短 15 分钟；免费信源最长 60 分钟，按次计费的信源最长 120–180 分钟。

抓取失败不推进位置，下次从同一处继续；连续失败的信源在后台标红，每周一会在运营群发一份信源周报（配置了飞书内部群时）。

## Yi-Hot 当前补充覆盖（2026-10-19）

在既有民政、教育、法院、妇联、生态环境和公益机构来源之外，seed 已增加三处经过生产预览的官方入口：

- 中国残联“残联要闻”：补充残障融合、特殊教育、康复和残疾人权益；
- 应急管理部“应急要闻”：补充灾害响应、应急救援和安全治理；
- 中国网信网“政策法规”：补充未成年人网络保护、平台治理和数字政策。

准入要求是列表能稳定取得近期文章、原文链接和发布日期。农业农村部候选列表在本次核查时只返回一条 2026 年 1 月内容；国家卫健委妇幼健康页和 UNICEF 中国新闻页在生产网络上触发反爬，因此暂不启用。后续应优先寻找它们的官方 RSS、公开 JSON 或稳定镜像，而不是依赖易失效的页面绕过。

## 规则：旧文不刷屏

首次发现时原文已经发布超过 48 小时的资料、新信源第一次导入的存量条目、标记为回灌的推送，都按原文时间归档：不进入“今天”，也不推送。这条规则所有入口共用，防止一次性导入历史内容刷屏。

## 外部推送接口

自己写脚本抓的内容，可以推进站里，走和普通采集一样的判重、精选和归组。

```
POST /api/ingest/items
Authorization: Bearer <INGEST_TOKEN>
Content-Type: application/json

{
  "sourceId": "my-crawler",
  "sourceName": "我的抓取脚本",
  "items": [
    { "title": "必填", "url": "必填", "publishedAt": "2026-10-01T08:00:00+08:00", "author": "可选", "excerpt": "可选，最多 12000 字" }
  ]
}
```

- `INGEST_TOKEN` 在 `.env` 里设置，至少 16 位；不设置时接口一律返回 401。
- 每次最多 50 条；每个客户端每分钟最多 10 次。
- 返回 `{"ok": true, "created": <新建条数>}`。缺标题或网址的条目会被跳过，同一请求里重复的网址只取第一条。
- `excerpt` 供邮件等外部连接器传入已获准处理的摘要或正文片段；它只作为理解素材，是否公开全文仍由信源的 `site_fulltext` 决定。
- `sourceId` 不存在时会自动建一个 `external` 信源，默认不进公开页面：到后台把它的参与方式改成 `editorial` 才会出现在站上。
- 条目的 `raw._aihot.backfill` 为 `true` 时按历史回灌处理（不进入“今天”、不推送）。
