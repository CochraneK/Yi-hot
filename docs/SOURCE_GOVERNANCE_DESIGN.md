# YiHot 信源治理系统：统一目录、可追溯采集与覆盖率

**Status: DESIGN / GO PLAN · 2026-10-08**

> 目标：以 AIHOT 当前采集/精选/事件/预算实现为底座，把 NewsMail 的候选信源、charity-intelligence 的合规台账和渠道/机构知识整合为**一套唯一 canonical 信源体系**。不为“整理信源”另建 NewsMail/WeRSS 服务，也不把新闻源、公益机构与微信账号塞在同一张概念表。
>
> **本轮为研究和设计，不是生产变更**；以下新字段、后台页面、状态机均属拟议功能。现有 `sources` 表已支持 `kind, tier, participation_mode, first_party, health, fail_count, last_ok_at, last_error, interval_minutes, enabled, site_fulltext, syndicate_fulltext`。应最大程度复用，避免一次大迁移。

## 0. 参考项目与可核验来源

| 项目 | 真实可借鉴的机制 | 我们的取舍 |
|---|---|---|
| **AIHOT（KKKKhazix）** `docs/sources.md`, `packages/backend/src/sources/{collect,config-keys}.ts` | 六种原生入口 RSS/网页/JSON/X/公众号/外部推送；先预览后创建；按源区分一手、分级、展示参与方式；失败计数与重试；模型及付费 API receipt 与 budget；同事件合并 | **继续沿用原实现**，不能克隆第二个采集引擎；和用户本地修改对比后选择性吸收上游特性 |
| **TrendRadar** https://github.com/sansan0/TrendRadar | 热榜源/RSS 分流、关键词/AI 过滤、新鲜度过滤、平台级及时间窗配置、可视化配置 | 把 `hot_signal` 与事实资讯分开；新增内容的新鲜度规则，不以热榜页为事实来源 |
| **RSSHub + Radar** https://docs.rsshub.app/ 与 https://github.com/DIYgod/RSSHub-Radar | 已知网站 URL 自动发现现成 RSS/RSSHub 路由；可配置缓存 | **引入 URL→候选 Feed 的发现步骤**，不是将 RSSHub 变成唯一数据库/永久必需容器 |
| **RSS-Bridge** https://github.com/RSS-Bridge/rss-bridge | 无原生 RSS 站点的 HTML→RSS connector，缓存、桥接能力 | 特定来源 RSS/API/网页适配失败后的备选；源失效时保留降级记录 |
| **Miniflux** https://miniflux.app/docs/ | Feed 错误/禁用状态、更新频率调度、按 host 控制抓取并发 | 运营层增加调度、出错类型与降级/恢复策略；优先复用现有 `health` 字段 |
| **Media Cloud** https://www.mediacloud.org/documentation/source-guide 与 https://github.com/mediacloud/web-search | `Source`、`Feed`、`Collection` 分离；出版国家/语言/媒体类型/主机别名与研究集合 | **用于 YiHot 的实体—渠道—采集入口—专题分层**，但公益组织（可能不常发新闻）也要纳入 |
| **FreshRSS** https://freshrss.github.io/FreshRSS/en/developers/OPML.html | OPML 导入导出，Feed 级过滤和去重规则 | 把 OPML 作为候选导入格式与便携备份，不引入第二套 RSS 阅读器 |

上述项目只提供可学习的模式，真实采集许可和各网站可访问性必须逐源确认；不把第三方发布的源列表等同于经过事实审查的官方原文。

## 1. 一套正交 Ontology，禁止重复概念

**五类主对象**（身份稳定，之间用外键和映射关系；不靠名字或 URL 单一键硬合并）：

| 对象 | 主键 | 含义与例子 | 身份边界 |
|---|---|---|---|
| `Entity` | `entity_id` / 公益 `org_id` | 发布者或相关机构：如中国慈善联合会 | 机构更名不变 ID；机构可发布多个账号；信源目录可以有与公益主数据不同的非公益 publisher |
| `Channel` | `channel_id` | 网站、微信公众号、媒体号、官方公告栏目等 | 同一机构可多账号，同一域下也可多栏目；公众号更名不等于新号 |
| `Source`（逻辑来源） | `source_id` | 真正的内容供给单元：如“某机构·通知公告”或“某公众号文章流” | 一个逻辑 source 可有多条技术 `Connector`；保持现有 `sources.id` 和 Article 关联不变 |
| `Connector`（技术端点） | `connector_id` | API URL、RSS Feed URL、CSS web_list、已授权 mp_account、人工/外部推送 | 一源可以 RSS 主路径、合法 API 备用路径；不可同轮都计作“两个独立来源” |
| `Collection`（研究/运营分组） | `collection_id` | 慈善政策、儿童救助、基金会财务、教育、国际人道主义等 | 多对多；标签不决定发布主体可信度、抓取许可或新鲜度 |

**文章 `Article`** 与**事件 `Event`** 继续使用 YiHot 原有 canonical data 和聚合器。每条文章留原始 URL、发布时间、原始发布者、观察到的 connector、数据发现时间、可追溯来源。无作者/缺日期不能凭采集时刻伪装成原始发布时间。

**公益纵向 `Evidence / Fact / Organization / AnnualReport`** 由 charity-intelligence 的 Raw→Fact→Harmonized→Derived 数据模型提供，不在 Article 内复制整条组织主档。初期仅用稳定引用连接，数据库实体与许可证审查通过后再设计迁移。

### 反例：不要这样合并

- **同域 ≠ 同发布者**：网站托管平台中多组织可共用域名；相同主域下有不同栏目；
- **同名 ≠ 同机构**：NewsMail 中有名称与 URL 疑似错配的条目，先人工核验；
- **转 RSS 的第三方域名 ≠ 内容发布者**：第三方 RSS 服务是技术中介，文章真正 publisher 仍是原公众号；
- **同篇文章的十次转载 ≠ 十份独立一手证据**：要维护转载链与 publisher 独立性，AIHOT 的“独立来源数”不应被技术重抓夸大。

## 2. 来源属性必须是正交的，不能用一个“可信分数”代替

| 属性维度 | 样例枚举/字段 | 用途 |
|---|---|---|
| **身份/来源** | `publisher_id`, `channel_id`, `aliases[]`, `original_url` | 追溯原始发布者，关联慈善机构 |
| **内容类型** | `information_types[]`: news/policy/notice/registry/annual_report/financial/project/funding/research | 区分信息流与年度数据源；不是所有来源都要放进日报 |
| **专题与地域** | `collection_ids[]`, `regions[]`, `languages[]` | MECE 基础分类可多标签，研究缺口/覆盖率 |
| **来源权威与关系** | 复用 `tier`、`first_party`，扩展 `primary_or_syndicated` 和针对具体断言的 authority | 官方机构也可能发布自述；不能仅凭“官方”自动认定其他类型事实真实 |
| **合法性/权益** | `collection_permission`: permitted/conditional/review_required/blocked；`attribution`, `republish_rights`, `robots_checked_at`, `tos_checked_at` | 自动启动硬门槛；采集许可与是否能公开全文独立 |
| **运营参与角色** | 复用 `participation_mode`: editorial/hot_signal/isolated | 事实新闻、关注热度、私有线索分开 |
| **技术与资源** | 复用 `kind`、`interval_minutes`, `config`，补 `preferred_connector`, `fallback_connector`, `estimated_cost`, `rate_limit` | 选择最省钱的合法抓取途径 |
| **健康与数据质量** | 复用 `health, fail_count, last_ok_at, last_error`，补 `last_verified_at, parse_valid_rate, date_precision, coverage_confidence` | 区分可访问、能解析、真的产生有效信息 |
| **人工审核与历史** | `review_owner`, `reviewed_at`, `decision_reason`, `provenance`（来自哪个旧仓库/文件/行） | 任何自动入库/状态变化可解释、可回滚 |

`collection_permission` 为单独**强制门**，不是综合加权分数：被 `blocked` 的 connector 即使权威很高，也不应自动抓取。信源的健康 `health=ok` 也只能说明获取/解析成功，不代表版权授权或事实可信。

## 3. 从三库到单一 canonical Registry 的安全映射

**库存基线（静态文件，非线上情况）**
- `yihot/industry/sources.json`：16 条 seed；具有 `source_id`，不得在数据迁移时更换它们以免文章引用断裂；
- `NewsMail/info_sources.md`：99 行原始来源/关键词候选，82 条 HTTP(S) 网址记录，67 个精确主机名（根据 2026-10-08 静态读取）；
- `charity-intelligence/compliance/source-register.yaml`：101 条有域名的登记，68 conditional、27 pending_retest、6 blocked（**2026-09-07 的历史检查**，不能当今时今日的站点实时状态）；
- `NewsMail` 部分记录是“微信公众号关键词”、“微博热榜关键词”、“行业汇总网址”，不能按一行一个 publisher 导入；出现同一网址绑定不同机构名的候选时一律进入 `REVIEW_CONFLICT`。

**建议只做可复算的迁移流水线：**

```text
三库原始清单（只读快照）
  → Parsing (候选条目 + 来源文件路径/行)
  → URL 规范化 / 站点变体和栏目区分
  → 身份匹配（精确 URL / 已验证公众号 ID / 稳定机构码 / 人工审定 alias）
  → 合并候选与冲突报告（保留原始每条记录）
  → 补全 rights / collection status / provenance
  → 试抓 preview（不写正式文章、不产生付费模型分析）
  → 管理员审核
  → 写入 YiHot 既有 source 或新增关联记录
  → 后续定时健康验证
```

**关键原则**：三库原始条目永不因“重复”直接删除，只有生成 canonical 映射、审计记录、禁止启动标志；缺字段用 `UNKNOWN` 而不是 `false` 或 0。禁止通过 `https://example.com` 这样的站点主页假装 RSS feed 真正存在。

## 4. 来源生命周期（候选入站 ≠ 自动发布）

```text
DISCOVERED
  → NEEDS_REVIEW
  → READY_FOR_PREVIEW
  → PREVIEW_PASSED
  → APPROVED_FOR_COLLECTION
  → SHADOW_COLLECTION （只记录/不公开）
  → ACTIVE
  → DEGRADED （异常待修复）
  → PAUSED / RETIRED
```

- `blocked` / 许可撤销：立即转入 `PAUSED`，无论以前 `ACTIVE` 与否；
- `conditional` / 未确认 ToS：保留候选或人工 review，不允许“批量启用”；对明确已有权利、合法且低风险的第三方源也须按实际条款独立审核；
- 运营失败：重试与指数回退，保留旧数据、不可偷偷切换到未经批准的第三方抓取；
- 长期低产出：可降低频率或改为仅存档/手工引用；“没有新文章”并不自动等于抓取失败；
- 内容字段错位、日期偏移、来源被劫持：应作为 **parser/data-quality** 异常；HTTP 200 不能算“采集正确”；
- 退役：保留原文链接、历史采集与删除/下架记录，不清掉研究证据。

**Implementation note**：生命周期是治理/审批状态；现有 YiHot 的 `health` 是运营状态。两者在数据库与 UI 上分开呈现，不能混为一个 status。

## 5. 监控与健康仪表板（先做能用的 5 个指标）

| 指标 | 精确定义/观察 | 目标的角色 |
|---|---|---|
| `availability_7d` | 最近 7 天预期抓取中，成功发起且收到合法响应的比例 | 网络/接口健康 |
| `parse_valid_7d` | 被识别的候选项中，合法标题+原文链接+可核验时间的比例；无日期可记 missing 而非误判为“今日” | 解析器健康 |
| `freshness_lag` | `fetched_at - latest_verified_published_at`，只在真实已发布新条目时解释 | 更新延迟；低频源区别对待 |
| `unique_value_30d` | 30 天内来自该来源、去重后确有独立信息价值的贡献；按 publisher 归集、防同转载刷屏 | 是否值得维护 |
| `cost_per_useful_item` | 实际抓取/内容处理成本 ÷ 非重复有价值条数（分母为 0 时显示 N/A） | 付费来源优先级 |

另外在来源目录明确展示 **rights 状态、最后一次人工核验日、回退链、最近一次异常与处理记录**。这些比虚构“总信源质量分 87.5”有解释力得多。

抓取频率：沿用 AIHOT 自动按近期产出调整频率的机制，参照 Miniflux 的每主机请求上限与错误退避；不为了追求秒级更新将低频慈善机构网站每分钟刷一次。

## 6. 用户端 / 管理端：Less is More

访客端不展示复杂的采集器管理，只显示必要溯源：**来源名、原文、首次/最新发布时间、官方/转载标识、需要复核的证据提示**。需要时点击来源查看资料与其他相关事件。

管理员后台新增一个 **「信源中心」**，只用四个工作区：

1. **总览**：启用多少、失败多少、近 7 天采集成功率、低贡献/高成本来源、待审核数；
2. **目录**：一个搜索框输入网站 URL、公众号名、机构名，列出规范发布主体及其渠道/技术入口，能从现有页面导入；
3. **候选**：三库合并建议、重复/名称冲突、RSS 自动发现、试抓结果、ToS/robots/版权审核；**默认不开采**；
4. **待处理**：失败、日期异常、源变更、内容不匹配、许可风险，支持暂停/重试/驳回与审计记录。

给管理员的默认流程尽量压到：

```粘贴 URL 或输入公众号名称
    → 自动识别站点 / 列出已知 RSS/官方 API/已有来源
    → 显示「预览 3 条」和「风险/权益信息」
    → 管理员通过或仅收藏
```

避免将一堆有技术感的配置字段直接摊给不熟悉抓取器的管理员；高级配置折叠可见。

## 7. 分期实现（M0 → M4，先小后大）

| 里程碑 | 最小开发切片 | 验收 |
|---|---|---|
| **M0：规范 + 对账**（当前） | 冻结 ontology；只读解析三库 source 清单；输出 CSV/JSON 的规范候选、重复组、冲突组、合规风险；不改在线业务 | 原始总量、canonical 候选数、重复映射、冲突保留均可复算；无生产写操作 |
| **M1：现有 AIHOT 能力复用** | 按有效权限验收 5–10 个一手公益源，用现有 preview、source run/health；记录真实 URL/发布时间/质量 | 抓出真实新闻且不把导航、旧闻、搜索页当今日消息；不造成重复发布 |
| **M2：候选发现与来源审查** | URL→RSS 自动发现（RSSHub Radar 思路）、来源/Channel 关联、合规审查队列；仍不引入常驻新 Docker 服务 | 新增一个官网/公众号，只需单次登记；主采集失败不重复计费或自动绕过许可限制 |
| **M3：覆盖/运营优化** | 后台来源总览、失败分类、健康/贡献/成本指标、调度频率与断路器，日报数据溯源 | 一眼知道哪个领域缺信源，为什么某来源 7 天未更新、实际损失什么信息 |
| **M4：深度关联** | 只读链接 charity-intelligence 机构/年报/项目/证据；通过身份校验再设计独立 schema | 能从公益事件查看关联机构证据，不丢原始资料、不做虚假机构合并 |

**与邮件整合的关系**：NewsMail 的邮件迁移只作用于 YiHot 已有 report 的 Delivery，归属另一个工作项。不要让 SMTP 功能决定信源管理逻辑，也不要复制 NewsMail 调度器。

## 8. 不能跳过的设计测试

- 同一内容通过官网 RSS、公众号转 RSS、付费 API 出现，**只计入真实独立 publisher**；保留多个原始 link 的转载/采集链；
- 一个域名下两个不同公益机构，不会按域名直接合并；一个机构下两条不同公告栏，也不会丢失；
- 公众号改昵称、机构改名称、历史网址 301，不改变既有 canonical ID；不能自动将同名不同统一信用代码视作相同组织；
- `collection_permission=blocked` 的候选绝不因 `health=ok`、`tier=T1` 或人工预览通过而启用；
- 付费 API 预算见底不会被误记为网站宕机，也不会触发付费重复请求；
- feed 返回 200 但全是导航标题/错误日期，标为解析异常；
- 第一次导入半年旧文不会重新发布为“今天”或推送；
- URL/feed 中有需要凭据的查询参数时，管理员公开页面/日志不应泄漏 token；
- 公众号/政府/公益组织注册信息只能在允许范围内采集展示；现场政策/基金管理与人员异常须独立事实核验，不能从来源热度推断违规。

## 9. 上游许可与遗产保留

- `CochraneK/yihot` 继续遵循 AIHOT 上游 MIT 许可、`NOTICE`、`THIRD_PARTY_NOTICES.md` 与商标边界；从 TrendRadar/RSSHub/其他项目**借鉴架构机制不意味着直接复制实现**，如复用代码，单独核验许可证、保留作者 attribution；
- `NewsMail` 和 `charity-intelligence` 在数据和审计通过之前保留可追溯 Git history 与原始存储；
- 任何未来的数据库 migration 必须可回滚、可重跑、与当前 YiHot 生产数据对账；
- 当前腾讯云 2 GiB RAM 服务器四个 YiHot 容器不动；先做文件级规范和离线来源整理，再做局部功能，不能通过“再加五个 Docker”解决信源整理。

## 决策句

> **一个站点入口、一个规范来源目录、一个新闻/事件管道、一个发布/简报引擎；采集端可以有多种 Connector，公益证据与实体库可以有独立数据 schema，但对人只有一个 YiHot。**
