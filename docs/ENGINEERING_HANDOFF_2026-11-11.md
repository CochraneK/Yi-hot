# YiHot 工程交接：P0 修复与 P1 首批闭环（2026-11-11）

> **2026-11-12 工程续接结果**（此段比下文 11 月 11 日阶段记录更新）：原四项 P0 已通过 PR #20 合并；P1 邮件确认/补日报 #22、长文翻译 #25、失效模型配置提示 #26、空周/月报 #27、事件合并/归组事务与人工拆离 #28 **均已合并**。下文原“待修复”的清单属于先前时间点，不应再当今日代码缺口。
>
> | 已完成的续接 | PR / 合并主分支 | 代码侧验证 |
> | :--- | :--- | :--- |
> | 长文翻译对真实模型输入计长 | [#25](https://github.com/CochraneK/Yi-hot/pull/25) · `fd734c71` | [Check](https://github.com/CochraneK/Yi-hot/actions/runs/43055190200) 成功 |
> | 失效模型提示 + 有效模型来源 | [#26](https://github.com/CochraneK/Yi-hot/pull/26) · `c284d53d` | [Check/Docker](https://github.com/CochraneK/Yi-hot/actions/runs/43056286503) 成功 |
> | 安全跳过有证据的空周/月报 | [#27](https://github.com/CochraneK/Yi-hot/pull/27) · `c98df22f` | [Check/Docker](https://github.com/CochraneK/Yi-hot/actions/runs/43056963744) 成功 |
> | 事件合并、人工拆离、公开视图和回执同事务 | [#28](https://github.com/CochraneK/Yi-hot/pull/28) · `7f5eb8af` | [Check/Docker](https://github.com/CochraneK/Yi-hot/actions/runs/43060231275) 成功，含 PostgreSQL 故障注入和并发测试 |
>
> **重要区分**：这些是 GitHub 合并及 CI 结论，不证明腾讯云生产实际运行代码已同步，也不证明生产旧归档未丢数据。**[Issue #21](https://github.com/CochraneK/Yi-hot/issues/21) 仍然是部署前人工闸门**。生产归档 cron 暂停、历史父子回执完整性、服务器实际代码 SHA、Chromium 出站限制、邮件实投与服务商账单均要现场核验。未经核实，不恢复自动 `archive-db.py --delete`。
>
> **CI 与 PDF 交付补充（2026-11-12 已恢复）**：核心 `Check` 和 `Docker` 已通过。旧 PDF 导出曾因 GitHub Runner 无法解析 `security.ubuntu.com`、导致中文字体无法安装而失败（[旧失败记录](https://github.com/CochraneK/Yi-hot/actions/runs/43057498725)）。现已由 [PR #30](https://github.com/CochraneK/Yi-hot/pull/30) 固定 Ubuntu 24.04、检查已有 CJK 字体并设置有界安装重试。**[新导出任务 43062347877 成功](https://github.com/CochraneK/Yi-hot/actions/runs/43062347877)**，并将 `docs/pdf/YiHot_README.pdf`、`YiHot_MAINTENANCE.pdf`、`YiHot_Complete.pdf` 三份 PDF 真正回写 `main`（[提交 `753bdb59`](https://github.com/CochraneK/Yi-hot/commit/753bdb59dde86e122ebd7d4582c6462f075c5c66)）。这是文档构建恢复，不代表腾讯云生产验收已完成。
>
> **唯一可信边界：** 这里核验的是 **GitHub 源码、提交与 GitHub Actions 测试**。没有访问腾讯云生产数据库、运行态、真实订阅邮箱或供应商账单，不能根据合并历史推断生产已部署或历史数据没有损失。详细老版文档见 [运营交接](YIHOT_OPERATIONS_HANDOFF_2026-11-09.md) 与 [生产证据](PRODUCTION_EVIDENCE_2026-11-10.md)。

## 版本基线与实际合并

| 变更 | 来源 | 已合并 PR | 合并后的主分支提交 | 真实 CI |
| :--- | :--- | :--- | :--- | :--- |
| 四项 P0：回执归档、HTTP 重定向、Chromium 出站、MCP 依赖 | 2026-11-11 差异审计；原基线 `9226540c10daa6f4455399e143d2780448bdc5cb` | [#20](https://github.com/CochraneK/Yi-hot/pull/20) | [1f0a875b](https://github.com/CochraneK/Yi-hot/commit/1f0a875b755ab00d840a679e4d5805999e7b4395) | [43051877567](https://github.com/CochraneK/Yi-hot/actions/runs/43051877567) — **check / docker 均通过**；main 合并提交的 [Check](https://github.com/CochraneK/Yi-hot/actions/runs/43052437141) 也通过 |
| P1 首批：重复邮箱确认与邮件日报补刊 | 已复现问题，保留既有双重确认 | [#22](https://github.com/CochraneK/Yi-hot/pull/22) | [73711e41](https://github.com/CochraneK/Yi-hot/commit/73711e41a53648d74918554c3307d3163f1d6262) | [43053580813](https://github.com/CochraneK/Yi-hot/actions/runs/43053580813) — **check / docker 均通过** |

*表中结论只对列明的 SHA 和 CI 记录负责。main 后续提交及生产部署需重新核查。*

## P0 实际修改与回归要点

1. **回执安全归档**（`scripts/archive-db.py`）：旧父表 `receipts` 的独立删除会通过 `ON DELETE CASCADE` 删除尚未导出的较新 `receipt_attempts`。改为按固定父 ID 批次完整导出父子 CSV、记录 SHA/行数与 fsync manifest，再在单事务中锁定父子、重查完整内容指纹与新明细；不符时拒绝删除。通过 PostgreSQL 17 临时库的并发插入、保留较新明细、后续完整归档及 `COPY` 恢复回归（`tests/test_archive_receipt_integrity.py`）。归档文件使用私密权限；该结果**不是对既往生产归档的完整性证明**。
2. **HTTP 重定向**（`packages/backend/src/lib/http-fetch.ts`）：敏感头、POST/PUT body、显式 `same-origin` 策略及常见 URL 凭据参数约束到原始来源；301/302/303 正确处理请求方法与实体头，307/308 保留方法。JSON 源与 Dajiala 调用显式限制来源；本地双服务测试证实敏感信息未被跨来源发送。保留已有 SSRF 和窄范围 TLS 修复。
3. **浏览器采集**（`packages/backend/src/lib/browser-render.ts`）：等待首次地址检查，对导航、跳转与子资源做异步检查，拒绝任一资源即使整次渲染失败；禁用 service worker 绕过。离线 Puppeteer 替身测试 + **真实 Chromium 的隔离 HTTP 测试**通过。**连接时 DNS 重绑定、WebSocket 和网络命名空间隔离仍应在部署前单独核验**：Node 预解析与 Chromium 真正拨号间不能自动视为同一 DNS 结果。
4. **MCP 协议安全**：服务端与其 Core 升至 `2.3.0`，保留开发端客户端的兼容依赖隔离；Fastify 请求体限制 256 KiB。CI 使用真实的 YiHot MCP 工具名称验证 `initialize`、`tools/list`、`tools/call` 及 413 超限拒绝，也运行依赖安全审计。迁移没有修改公益主题、报告样式、订阅公开流程或 `/yihot/` 路径。

**额外的测试维护**：修复两条过时的九月信源测试样本，保留真实 7 天时间可信规则。前端、后端、Docker 与本地站点冒烟均作为 PR 合并闸门。

## P1 首批实际修改与回归要点

- **订阅确认去重**（`packages/backend/src/newsletter/subscriptions.ts`）：同一邮箱使用 PG 事务咨询锁解决首订并发；10 分钟内相同偏好且令牌未过期的重复提交复用原链接/发件任务。真正变更偏好仍要求再次确认，令牌与 outbox 原子提交并撤销未发送的旧确认。覆盖 4 个并发请求、活跃用户偏好、重复点击及新旧令牌。**已发送旧邮件不能收回**。
- **邮件日报补刊**（`packages/backend/src/reports/compose.ts`）：`dailyReports=false` 但 `dailyNewsletter=true` 时，缺少的日报仍会由 `catchUpReports()` 生成；测试仅在隔离数据库进行，未发送真实邮件或开放公众日报入口。
- **容量测试稳定性**（`tests/capacity.test.ts`）：以北京时间次日中午为模拟时间起点，避免跨午夜时“日额度自然归零”被误报为快照刷新丢失限制；未改变实际业务配额或归零规则。

## 仍需生产核验的事项（下列 P1 是 11-11 历史待办，已于 11-12 合并）

- **[Issue #21：生产旧归档暂停与历史恢复审计](https://github.com/CochraneK/Yi-hot/issues/21)**。应先暂停旧版 `archive-db.py --delete` cron/timer，核对往期父子 CSV 与离线备份，确认新脚本实际部署后再恢复。**仅修改 GitHub 不会停止现有 cron**。
- **浏览器服务端强制出站**：建议以可审计的网络策略阻断环回、RFC1918、云元数据与 DNS 重绑定，不要仅依靠业务层 URL 检查。没有证明其在生产网络环境已生效。
- **[Issue #23：事件合并/归组事务一致性](https://github.com/CochraneK/Yi-hot/issues/23)**：已由 #28 完成并关闭；**生产实际版本和运行仍待核验**。
- **[Issue #24：空周/月报规则](https://github.com/CochraneK/Yi-hot/issues/24)**：已由 #27 完成并关闭；**生产实际版本和报告行为仍待核验**。
- 模型配置来源可见性已由 #26、长文翻译由 #25 完成；仅做局部补丁适配，未覆盖 YiHot 公益主题、周月报或邮件流程。

## 接手者下一步

先读 [AGENTS.md](../AGENTS.md) 和本页，再核对最新 `main` / CI。生产核验必须通过有权限的服务器操作员：实际部署 SHA、数据库真实数量、定时归档、邮件确认/投递、模型真实回执、费用与 SSRF 出站策略分别记录。不要对生产直接运行临时测试、`--delete` 或历史任务重分析；不要合并上游 `0045_drop_topics.sql`，YiHot 的儿童公益主题依赖 `topics`。
