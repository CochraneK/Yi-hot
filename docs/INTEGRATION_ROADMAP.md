# YiHot × NewsMail × charity-intelligence：统一公益情报平台

> **Canonical integration decision · 2026-10-08**
> **2026-10-13 产品决策**：取消自动日报及日报补刊，仅生成周报、月报，统一入口为「公益总报」。后续增加群发邮件功能已列入待办，当前未配置 SMTP、收件人或发送邮件。
> **2026-10-12 补充决策**：项目所有者选择免费自托管 WeRSS；允许新增独立的公众号 RSS 采集服务，YiHot 仍是唯一选稿、归组和对外发布平台。下文“不引入长期 RSS 系统”的旧限制仅对此方案取消，实施见 [WERSS_DEPLOY.md](WERSS_DEPLOY.md)。
> 方向已由项目所有者确认：以 `CochraneK/yihot`（上游 AIHOT 衍生）作为**唯一持续对外提供公益资讯服务的主平台**，逐步吸收 `CochraneK/NewsMail` 与 `CochraneK/charity-intelligence` 的可复用能力与资产。
> **注意：这是目标架构与迁移账本，不是已经完成的代码/数据合并。**
> 避免将旧版 `docs/legacy/CHARITY-INTELLIGENCE-CONTRACT.md` 所描述的“两个永远独立的系统”误解为最终产品目标；该合同仅可作为早期非破坏性对接过渡方案。

> **统一信源唯一规范（M0）**：[SOURCE_GOVERNANCE_DESIGN.md](SOURCE_GOVERNANCE_DESIGN.md)。Source/Channel/Connector/Publisher/Collection 的正交定义优先于本路线图中的简写；本文负责仓库整合，规范文档负责信源设计与状态机。

## 1. 明确分工（MECE）

### 后续待办：邮件分发与邮件信源（2026-10-13）

- [x] **第一版总报邮件投递**：复用 NewsMail 的 SMTP 经验与 TrendRadar 的多收件人配置思路，将 YiHot 已公开的周报、月报逐个发送给明确配置的收件人；以报告期号和收件人防重，发送与采集分离，不建立第二套报告生成器。2026-10-18 已用 QQ SMTP 向许可测试地址发送成功并启用服务器定时器。公开自助订阅、双重确认、退订和退信处理仍属于后续阶段。
- [x] **邮件信源连接器**：使用专用 QQ 邮箱，只读已确认的 newsletter 发件人，经既有 `/api/ingest/items` 鉴权入口接入 YiHot。以 IMAP UID、Message-ID 哈希和规范 URL 去重；退订、订阅管理和统计链接不入库，邮件发送时间不冒充原文发表时间。首次运行只立游标、不回灌历史邮件；部署及运维见 `EMAIL_SOURCE_DEPLOY.md`。运行时启用仍需配置独立 `INGEST_TOKEN`。
- [ ] **AmCham 邮件入口**：官网及 [Glue Up 订阅页](https://amcham.glueup.cn/org/amcham-china/subscriptions/) 提供 newsletter。选定收件邮箱、完成订阅确认并拿到一封真实样本后再实现邮件连接器；无需新增模型调用来拆分链接和标签，选稿仍使用 YiHot 原有管线。网站解析受阻的现阶段已另用认证公众号接入，见 `PRODUCT_UPDATE_2026-10-13.md`。
- [x] **爱德传一邮件入口**：规范名称为“爱德基金会传一慈善文化基金（爱德传一基金）”，目标刊物为《慈善纪事简报》，公众号 ID 为 `Chuanyi_2015`。QQ 邮箱实测识别 `aidechuany@batch.lingxi360.com` 历史样本 83 封，按整期简报接入；不把它误登记为独立基金会。WeRSS 已添加其认证公众号作为备用通道，微信读书 Cookie 失效后需重新扫码才会刷新。

| 能力域 | 最优继承来源 | 未来唯一权威位置 | 不重复做什么 |
|---|---|---|---|
| 新闻来源注册、抓取调度、预筛、评分、去重、事件聚合与热度 | YiHot（AIHOT 上游） | YiHot `sources/content/events` | NewsMail 不再独立运行日常新闻主循环 |
| 公益特色信源（90+ 候选清单）与中国来源解析经验 | NewsMail | YiHot 规范信源注册表及定向 parser/fixture | 不照搬旧标题前缀去重或宽泛关键词爬虫 |
| 新闻简报（日报/周报/月报）的 HTML、网页/RSS、邮件分发 | YiHot 报告引擎 + NewsMail 的 SMTP 经验 | YiHot 统一 report + delivery | 不保留第二套独立的 report/cron/dedup |
| 公益组织、资质、年报、财务、项目、资金关系与纵向档案 | charity-intelligence | 逻辑上的公益实体数据域，逐步进入 YiHot 数据服务 | 不能用“新闻文章表”承载十几年年报或机构状态 |
| 证据/来源质量/采集权限/人工复核 | charity-intelligence + YiHot source provenance | 公共证据契约与独立审核队列 | 不把“多媒体报道/热门”视为事实独立验证 |
| 公众号账户及其它 Channels | charity-intelligence 的 Channels 实体设计 + YiHot `mp_account`/`rss` | 一个公众号目录和源路由 | 不引入另一个单独长期运行的 RSS/微信采集系统 |
| 公益洞察与研究、机构检索、监管与资金监测 | charity-intelligence | YiHot 内独立 `charity` 数据与视图层 | 不将带不确定性的异常线索伪装为已证实违法 |

系统从 **发现 → 采集 → 事件 → 证据 → 机构 → 研判 → 简报/行动** 闭环，但这只是业务流程；数据层必须区分：
- `Article / Event`：文章及多源聚类事实，由 YiHot 原生数据模型负责；
- `Organization / Qualification / AnnualReport / Project / Financial / Relationship / Channel`：可持续追踪的实体数据；
- `Raw / Fact / Harmonized / Derived`：事实来源、字段校验及推论的证据分层；
- `Report / Delivery`：同一份报告的网页/RSS/邮件等不同出口。

## 2. 微信公众号整合：不要单独造新闻系统

公众号作为 `Channel`（含公众号标识、所有者机构、项目号/地方号/历史号、可靠性和更新时间），与 YiHot `Source` 建立对应关系：

```text
charity.organization (稳定 ID)
    │ 1:N
    ▼
charity.channel (公众号 / 官网 / 视频号)
    │ 1:N 可用采集方式
    ▼
source route (优先经过验证的 RSS → 正式授权 API/mp_account → 合规的人工或外部采集)
    │
    ▼
YiHot canonical Article → Event → Brief / UI
```

- **首选 RSS**：官方 RSS，或者权利范围允许、可靠的公众号 RSS 中转。必须保留原文 URL、真实发布日期、feed 服务 provenance；中转无全文时不将摘要当正文。
- **第二层已有 `mp_account`**：可用极致了（Dajiala）等经确认合规的付费接口，费用走 YiHot 既有 receipt、预算与失败告警机制。不重复使用免费源已覆盖的号。
- **第三层 `external` / 手工**：对没有稳定 RSS/授权接口的官方号，使用明确允许的外部采集/人工核验；搜狗微信搜索/聚合站默认仅作发现信号，不作为已核实的一手文献。
- **每个号都记录**：`channel_id`、所属 `org_id`、公众号原始标识、显示昵称及更名史、唯一源 `source_id`、优先级、候选 connector、合规状态、最后成功、失败原因、来源证据与成本。
- NewsMail 的 `info_sources.md` 和 charity-intelligence 的 `compliance/source-register.yaml` 是**候选和审核输入**，不是“导入就全部自动启用”的白名单。遵守 robots/ToS、内容授权和人工审核；禁止把需要验证码/访问控制的政府系统当成无门槛抓取源。

## 3. 与现有 Git 审计文件的关系

以下都属于**历史输入或过渡契约**，不是最终架构：

- `docs/legacy/SOURCE-MIGRATION-AUDIT.md`：信源去重与合规迁移原则，可保留；
- `docs/legacy/NEWSMAIL-PARSER-AUDIT.md`：日期解析、页面 fallback 可参考；其标题前缀去重、匿名翻译、平行 scheduler 应淘汰；
- `docs/legacy/CHARITY-INTELLIGENCE-CONTRACT.md`：charity → YiHot 事件推送作为暂时的防破坏桥接；其旧示例 `/api/v2/ingest` / `YIHOT_INGEST_TOKEN` **不可不经检查直接部署**。以当前 `docs/sources.md` 和实际路由代码所定义的 `POST /api/ingest/items` / `INGEST_TOKEN` 为先，部署前必须在测试环境验证；
- `industry/sources.json`：已经有部分公益信源示例，但无法由此推断 90+ 来源已成功迁移；
- `charity-intelligence/data/SCHEMA.md`：结构化慈善数据契约的权威输入，不能把实体库当普通新闻存量导入。

## 4. 不丢数据的整合次序

### Phase 0 · 基线盘点（迁移前）

- 对三个 Git 仓库冻结版本、提交 hash、版权/许可与上游 AIHOT attribution。
- NewsMail：清点 `info_sources.md` 候选来源、对应 URL、parser/fallback、邮件模板与调度方式。
- charity-intelligence：**先确认实际 SQLite 数据库及原始材料是否真的位于可备份机器**。README 的“14,327 家”是其 2026-09-11 快照说明，不可据此假设在现有腾讯云实例中已有该数据。验证 SQLite 完整性、条目数、证据引用与 Raw 快照后再操作。
- 当前 YiHot：对 PostgreSQL 数据、现有来源和日报设置做备份；记录线上版本、已有四个容器，**不在审计阶段重启 YiHot**。

### Phase 1 · 先合并用户体验与出版层（低风险）

- YiHot 成为单一公益新闻门户，保留 AIHOT 精选与事件算法；
- 导入 NewsMail 经过实时验证的信源候选，自动去重 URL/域名/实体，不批量启用全部旧源；
- 为现有 YiHot 日/周/月报增加 `email` Delivery Adapter（SMTP），使用现有报告视图成稿；保留退订、发件限速、收件人授权、发送日志与失败重试；
- 没有必要新增与当前 2GB 腾讯云服务器长期并行的 NewsMail/WeRSS/PostgreSQL 运行栈。

**验收**：一条资讯只出现一个规范 Article；同事件合并不增加伪热度；同一期日报网站/邮件内容一致；某邮件发送失败不触发重新采集或重复付费模型调用。

### Phase 2 · 公益实体“关联而非覆盖”

- 新增机构搜索/档案与证据检索的独立数据 API；新闻只保存可追溯的 `org_id`/外部来源引用。
- **先不要直接把慈善 SQLite 数据覆盖导入主 PostgreSQL**。先以只读导入器或受控服务测试实体主键、机构更名、同名异主体、统一社会信用代码、时间窗和 provenance。
- charity-intelligence README 明确提示现有 `org_id` 使用名称派生存在撞名/更名风险；进入统一主数据前必须修复身份判定并提供可回滚映射表 `legacy_id → canonical_org_id`。
- 当 SQLite 实际数据/原始证据/脚本在受控测试中通过完整性审计后，再做 PostgreSQL 中的 `charity` 独立 schema 或专用数据服务；**与 YiHot 新闻表正交，不随意合并**。结构化采集器仅在法律/技术条件允许下运行，敏感/验证码依赖的 Connector 单独治理。

**验收**：机构数量与原库对账一致，历史名称可追溯，原始证据/年份/来源数据无损，无法匹配的实体进入 review_queue 而非被静默合并。

### Phase 3 · 增量公益情报与研究分析

- 机构变更、资质/年报、风险与资金网络通过批准的增量采集/导入管道更新，并关联动态事件；
- 加入资料覆盖率、采集成功率、来源可信度、冲突队列、数据截止时间、用户可见的非指控性质量提示；
- 邮件、飞书、RSS/API、主题页共享同一个带出处的发布层；
- 根据实际运营情况将被替代的 NewsMail 独立调度停用，并把两旧仓库设置为**有完整备份的只读/归档参考**，保留 git history 和原作者贡献；此前绝不删除旧库、SQLite 或原始证据。

## 5. 状态与门槛

| 状态 | 当前结论 |
|---|---|
| 三库功能盘点 | **已读 README + 旧审计**，仍需代码级精细映射 |
| YiHot 公益主题/基础采集/日报 | **代码存在**，线上是否最新需另验 |
| NewsMail 90+ 来源全部导入 | **未核实，不可标完成** |
| YiHot SMTP 邮件发送 | **未核实为已实现，应作为迁移任务** |
| charity-intelligence 主数据迁入 YiHot | **未完成** |
| 当前服务器上的 charity SQLite 原库 | **位置和可访问性未确认** |
| 微信公众号可用 RSS/付费 API 覆盖率 | **需逐号实测、记录条款和费用** |
| 最终三个原仓库停止独立维护 | **未来目标，验收前不得关停/删除** |

**产品决策**：以用户已确认的“项目最终合并”作为目标，旧文件的“仓库永远独立”只适用于短期安全过渡；不因追求代码上的单仓库而牺牲合规、科研证据、历史版本与数据备份。

## 6. 可以直接推进的最小切片

1. 以 `NewsMail/info_sources.md` 与 `charity-intelligence/compliance/source-register.yaml` 为输入，生成一份带唯一 ID、规范 URL、现状和授权标志的候选来源**差异表**，先不自动启用；
2. 针对 5–10 个一手公益来源 + 2–3 个公共公众号 RSS 做试抓，对照 YiHot `rss/web_list/mp_account` 的真实字段；
3. 给 YiHot 当前 Report 做第一版 `Email Delivery Adapter`（复用 NewsMail 邮件构建思想，不复制另一个报表调度器）；
4. charity-intelligence 库先只读验数与机构身份审计，再设计 `org_id` 映射导入测试，**不得跳过**；
5. 上述测试通过后再修改生产部署，并继续维持 AIHOT 上游来源、LICENSE、NOTICE 与新增贡献的清晰归属。

