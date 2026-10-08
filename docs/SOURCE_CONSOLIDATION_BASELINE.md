# 公益信源整合：第一轮基线与下一批验收

> 2026-10-08 · **只读清点 + 后续执行门槛**。本文件来自三个仓库此刻默认分支的静态文件；没有对外发起抓取，也没有改动腾讯云、现有服务的定时调度、已启用的数据库信源、公众号付费 API 或用户数据。所有数字都不是“当前在线可用数”。

> **后续设计**：[SOURCE_GOVERNANCE_DESIGN.md](SOURCE_GOVERNANCE_DESIGN.md) 定义统一 source ontology、候选导入、预览/权限、运营健康与后台交互。当前只冻结规范，不调整已运行服务。

## 一句话的下一步

**先把已有 YiHot 的 16 条示范信源与 NewsMail/charity-intelligence 的重叠、合规和可用性梳理清楚，人工验收 5–10 个高价值公益来源，再补 YiHot 原有日报的邮件分发。** 公益机构数据库的实际迁移另设独立审计门槛。

## 文件来源（不是线上数据库）

| 仓库 | 文件 | 静态记录数与含义 |
|---|---|---|
| `CochraneK/yihot` | `industry/sources.json` | **16** 条预置 seed；仅反映仓库示例，不能证明所有来源已经启用/抓取成功 |
| `CochraneK/NewsMail` | `info_sources.md` | **99** 条 `名称 \| 类型 \| 地址/关键词` 行，包含新闻网站、聚合器、搜索关键词、重复记录；其中 **82** 行具有 http(s) URL，按**精确主机名**归为 **67** 个主机 |
| `CochraneK/charity-intelligence` | `compliance/source-register.yaml` | **101** 条带有效域名的登记条目，记录 `collection_status`：`conditional` **68**、`pending_retest` **27**、`blocked` **6**（以该文件 2026-09-07 的审查状态为准） |

解释：

- YiHot 预置的 16 条中，有多个是同一机构的不同栏目（民政部 4 条），所以绝不能把“预置数量”当作“机构数/有效站点数”。
- 以精确的 URL 主机名进行非常保守的比对，NewsMail 有 **10 条 URL 记录**与现有 YiHot 预置记录匹配主机名，其中包含名称重复；这不是 10 个独立新增信源。
- **精确主机名比对不包含父子域归并，也不判断同一组织不同域名/更名**，故数字只用于初步审计。
- charity-intelligence 中 **没有被标为 `allowed` 的登记项**（上述三个状态合计 101）。**这不意味着所有站点都不合法或不可用，只说明 2026-09-07 的合规记录不能当作自动采集授权**。后续每条需要重新核对 ToS、robots、官方 API/许可和技术可达性；不能批量开采。
- NewsMail 资料中的“RSS”类型并不确保 URL 实际是 feed：例如部分 RSS 项只是网站首页。是否是有效 XML、日期是否可靠、全文是否允许传播，都必须运行试抓并记录。
- NewsMail 的 **`中国儿童少年基金会`** 与 **`中华少年儿童慈善救助基金会`** 在静态列表里共用 `https://www.cctf.org.cn/`。在机构身份映射前应标为**待核实关联**，不能据此断定它们是一个机构。
- 搜狗微信关键词不是单个公众号的原始内容，也不应提升为原始事实来源。已经存在 YiHot `rss`、`mp_account`、`external` 三条连接路由，不新增单独运行的公众号平台。

## 第一批值得验收的高价值来源

下面是**候选验收优先级**，不是已批准的自动采集白名单。优先验证已在 YiHot 出现的站点是否健康，再测试尚未覆盖的高价值来源。

| 优先 | 候选来源 | 仓库覆盖情况 | 具体下一步 |
|---|---|---|---|
| P0 | 民政部 4 个栏目的信息流 | YiHot 已有 seed | 试抓 3 篇：文章原文链接、发布日期、正文/标题、重复栏目与条款；确认实际运行状态 |
| P0 | 中国慈善联合会 | YiHot 已有 seed，NewsMail 有首页 | 检查 YiHot 的来源栏目与 NewsMail 首页是否同站重复 |
| P0 | 南都公益基金会 | 两库已有来源，NewsMail 写了 `/feed` | 确认 RSS 是否有效，若可用评估替换脆弱 HTML 列表；不要无验证地同时启用两路采集 |
| P0 | 基金会中心网 | YiHot 已有 JSON 列表 | 测 JSON schema/真实时间，核对第三方使用规则；不要因其是聚合平台便将内容当官方事实 |
| P1 | 中国发展简报 | NewsMail 候选，charity-intelligence 状态 `conditional` | 验证 `/feed` 是否真实返回 RSS，校对日期与权限，再考虑新的 YiHot RSS 信源 |
| P1 | 公益时报 | NewsMail 候选，charity-intelligence 状态 `conditional` | 核对源 URL、是否产生 XML、失效 fallback；若无稳定端点转入人工审核 |
| P1 | 腾讯公益 | NewsMail 候选，charity-intelligence 状态 `conditional` | 寻找明确的官方资讯栏目/ API，而不是对门户首页全站扫关键词 |
| P1 | UNICEF China | NewsMail 候选，charity-intelligence 状态 `pending_retest` | 官方来源优先，排查网页可访问性和频道结构 |
| P1 | 一个确认为官方的公益公众号 | 两旧库有公众号和 Channels 设计 | RSS 优先，已合法获得的 API 其次；记录 `org_id/channel_id/source_id`、成本/版权 |
| P1 | 一个具有 RSS 许可的独立公益公众号 | 同上 | 避免第二套 crawler，验证失败回退、重复文章的 canonical URL 与归组行为 |

## 三步落地，不同时开工十几条主线

### M1 · 可观测、可验证的信源（当前最优先）

1. **只读**检查当前腾讯云 YiHot `aihot-web-1`、`aihot-api-1`、`aihot-worker-1`、`aihot-db-1` 是否健康；访问后台“信源”及日报页，看在线失败率和真正发布的源，不凭 seed 推断线上状态。
2. 对上述 P0/P1 的 5–10 个来源逐条“试抓”；记录 `source_id`、实际 URL、HTTP/Feed 格式、日期、样例数、最近成功时间、版权/采集权限、是否新源及是否与既有源重复。
3. 只把确认有效、合法、重复可控的源启用。搜狗微信和聚合热榜默认当 `hot_signal`，不当一手证据。数据异常留可复核的记录。

**完成标准**：至少 5 个一手/高价值公益来源通过试抓，24 小时内有明确的成功/失败记录；一个事件多路报道不被重复当作独立热点。任何自动付费接口都先打开预算与 receipt。

### M2 · NewsMail 邮件功能吸收到 YiHot

- **只保留 YiHot 唯一日报引擎** `packages/backend/src/reports/compose.ts` 与发布视图 `packages/backend/src/publication/reports.ts`；
- 从 `NewsMail/scripts/send_email.py` 借鉴 SMTP 配置与 HTML/纯文本双版本，但以 YiHot 原生 TypeScript Worker 的单条发送任务实现，支持重试幂等键、预算、收件人授权与退订；
- 禁止复制 NewsMail 的另一套日期窗口、日报生成器、Python scheduler、去重文件；
- **验收**：同一期站内日报与邮件内容相同、失败可重试且不二次付费调模型；默认关闭向外发送，先单个许可测试邮箱。

### M3 · 只读联通公益实体库

- 确认 charity-intelligence 实际主 SQLite 和 raw/evidence 的备份位置，运行 SQLite 完整性检验；
- 优先解决旧 `org_id = hash(name)` 与“同名不同机构/更名”的身份映射冲突；**不立刻往 YiHot PostgreSQL 做全库导入**；
- 先以只读快照展示机构搜索/证据引用与新闻关联，后续才设计有可回滚迁移的实体 schema。

**完成标准**：旧库数量、主键、年份、证据完整且能对账，才允许迁移。

## 本轮不做的事

- 不同时引入 Qiaomu RSS、WeRSS 和新爬虫服务；优先用 YiHot 自带的来源连接器。
- 不直接在生产启用 99 个 NewsMail 来源，不把 `conditional` 当 `allowed`。
- 不用 AIHOT 上游原仓库代码覆盖当前 YiHot 公益配置。
- 不删除 NewsMail / charity-intelligence 仓库及已采集的原始数据。
- 不为邮件重新建另一套数据库和四个容器。
- 不把慈善组织财务或处罚等“待核实信息”直接写成实体的已证实事实。

## 一句话继续工作指令

> 只推进 **M1 信源试抓与质量验收**：先读三库整合路线图和本基线，检查线上 YiHot 实际信源，再验收 5–10 个高价值来源。不得动四个容器、不得覆盖生产库、不得启用未经核验的采集。验收后才进入 M2 邮件与 M3 公益组织数据联通。
