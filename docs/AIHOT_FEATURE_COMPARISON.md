# Yi-Hot × AIHOT：能力、代码归属与差异核对

> **核查基线：2026-10-30**。Yi-Hot `main`：[`96d562c`](https://github.com/CochraneK/Yi-hot/tree/96d562c4bd840c448036a77fdb6afa31a5cfc162)；AIHOT 上游 `main`：[`c535666`](https://github.com/KKKKhazix/AIHOT/tree/c535666f35e78e55beb0bc9de80bb0032e45cf68)。
> **方法**：实际获取两端 GitHub 源码树、React Router 路由、后端路由、功能开关与专题文档，并对比文件 blob SHA。此文是**代码级核查**；没有连接腾讯云 DB、使用管理员账号或证明所有页面当前线上 HTTP 可用。生产部署要单独确认。
> **术语**：「继承底座」= 源自 AIHOT 的功能/算法体系，**不代表文件逐字相同**；「定制」= Yi-Hot 围绕公益场景改写；「扩展」= Yi-Hot 另行增加的功能；「关闭/待合并」= 仓库存在部分实现、线上不一定提供。AIHOT 和第三方原作者的归属见 [LICENSE](../LICENSE)、[NOTICE](../NOTICE)、[THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md)。

## 一、先看结论：不是“换皮”，也不是“100% 同步”

| 比较层 | AIHOT 上游框架 | Yi-Hot 当前 `main` | 归类与证据 |
| --- | --- | --- | --- |
| **采集与规范化** | RSS、网页列表、JSON、X、公众号、外部推送；去重、重试、监测 | 保留相同类别的引擎与信源数据模型，集中在公益来源；另加主动网页搜索和邮件简报；原公众号/微博通道现阶段暂停 | **底座继承 + 公益扩展**；[上游来源](https://github.com/KKKKhazix/AIHOT/tree/main/packages/backend/src/sources) · [本地来源](../packages/backend/src/sources/collect.ts) · [搜索服务](../packages/backend/src/providers/deepseek-tools.ts) |
| **内容审核与精选** | 预筛、独立评分、摘要、结构抽取及各级入选标准 | 以公益/儿童权益的词表和提示词为准；2026-10-29 实施惰性结构抽取、灰区第二次评分及首尾预筛 | **继承后大幅改写**；[提示词](../industry/prompts/) · [精选口径](selection.md) · [实测成本](COST.md) |
| **事件聚合与热点** | 同事件跨来源归组，热点按独立参与方而非转载篇数计算 | 保留事件/热点逻辑，公益来源含搜索信号；搜索信号本身不能代替可核验的一手来源 | **继承 + 领域规则**；[事件归并](../packages/backend/src/events/group.ts) · [热点](../packages/backend/src/events/hot.ts) |
| **报告出版** | 日报、周报、月报 | 现用公益产品以**周报、月报**为主要定期报告；日报开关为 `false`，保留历史路由但不能宣称每天仍出版 | **出版策略定制**；[功能开关](../industry/features.ts) · [报告](../packages/backend/src/publication/reports.ts) |
| **主题与语言** | AI 行业公司/方向/形式主题及一般框架 | 儿童保护、营养健康、教育、社会组织等公益领域主题，另区分内容形式与公益议题；支持历史标签回填 | **领域定制**；[主题与迁移](topic-axis-migration.md) · [主题种子](../industry/topics.json) |
| **管理后台** | 登录、信源管理、内容诊断、运行、模型、SelectBench、设置、审计、反馈 | 继承主体，另增加**用量与成本、监测、候选信源治理**等页和运营规则 | **底座继承 + 运维扩展**；[本地路由定义](../apps/web/app/routes.ts) · [后台导航](../apps/web/app/routes/admin/layout.tsx) |
| **公益监管记录** | 对照版核心路由中没有 `/records` | 民政部行政处罚、社会组织异常名录和严重违法失信相关公告：独立可检索页，单独入库每日同步 | **Yi-Hot 专有扩展，代码开关为 true**；[设计与数据](REGULATORY_RECORDS.md) · [实现](../packages/backend/src/records/read.ts) |
| **订阅与简报** | RSS 与报告功能是底座，不能据此推断有本产品的邮箱订阅页面 | 订阅页、双重确认/退订、外部邮件信源读取和周/月报投递；邮件采集与投递分离 | **Yi-Hot 扩展**；[订阅实现](../packages/backend/src/newsletter/subscriptions.ts) · [邮件交付](EMAIL_DELIVERY.md) |
| **来源治理与机构信息** | 来源 tier、健康、预览及失败退避 | 规范 Publisher / Source / Channel / Connector / Collection，另保留 NewsMail 与 charity-intelligence 的候选和证据关系；**历史慈善实体主数据尚未证明全部迁入** | **领域治理设计 + 部分落地**；[来源治理](SOURCE_GOVERNANCE_DESIGN.md) · [整合路线](INTEGRATION_ROADMAP.md) |
| **多终端与用户体验** | 基础 Web、搜索、收藏、主题、热点、报告等交互 | `/yihot/` 子路径部署、手机底栏与桌面侧栏、儿童公益品牌、二维码分享/海报、单独的分析报告静态页 | **继承基础 + 体验定制**；[Web 路由](../apps/web/app/routes.ts) · [应用路径](../apps/web/react-router.config.ts) · [海报路由](../apps/api/src/og/poster.ts) |
| **机器读取与开放接口** | RSS / 公共 REST API / MCP / Agent Markdown 与 llms.txt | 保留并按公益语境命名；Agent Skill 下载包与站内安装说明（其中 Skill 包等扩展参照 PsyHOT，详见归属文件） | **底座继承 + 第三方实践与本地改写**；[Agent 页](../apps/web/app/routes/agent.tsx) · [PsyHOT 归属](../THIRD_PARTY_NOTICES.md) |
| **运行/费用/队列** | worker 调度、模型调用回执、付费服务 budget、运行监测 | 腾讯云 Docker 多容器、搜索按量成本、历史回填闸门、超时归档可恢复、离峰分析、阶段级成本分析 | **底座继承 + 运行适配与优化**；[队列](QUEUE_SUSTAINABILITY.md) · [成本](COST.md) |
| **AIHOT 跟进方式** | 上游 `main` 在继续演进 | Yi-Hot 是带完整祖先关系的 GitHub fork，`vendor/aihot-main` 跟踪上游；现用 `main` **并非每日自动合并上游全部代码** | **版本治理**；[上游重构](AIHOT_UPSTREAM_REBUILD.md) |
| **新模块化扩展机制** | 当前上游 `routes.ts` 从 `@aihot/site/modules` 读取模块页面和后台路由；`modules/tsconfig.json` 已存在 | 当前 Yi-Hot `routes.ts` 仍明确列出自己的路由和扩展，不使用相同的 `modulePages` 机制 | **上游新架构，Yi-Hot 尚未完成对齐**；[上游路由](https://github.com/KKKKhazix/AIHOT/blob/main/apps/web/app/routes.ts) · [本地路由](../apps/web/app/routes.ts) |
| **模型榜、Codex 重置** | AI 行业特色功能不应被当成任意行业框架的默认能力 | Yi-Hot **保留了一部分相应代码，但两个开关均为 false**；公开路由不代表可用功能，后台监控导航也受开关限制 | **代码留存、功能关闭**；[开关](../industry/features.ts) · [路由](../apps/web/app/routes.ts) |

### 两种能力边界务必区分

- **移植了引擎 ≠ 已保持最新上游行为**。公益版的相同文件可能含重要改写；复制覆盖有可能破坏邮件、监管、数据库迁移和信源。
- **文件/路由存在 ≠ 功能已启用 ≠ 线上已部署 ≠ 真实可用**。例如 `/leaderboard` 和 `/codex-reset` 的代码仍在，但 feature flag 为 `false`；公众号社交采集的配置存在不代表实际通道健康。

## 二、这次源码对照的量化检查（只衡量文件结构，不是功能实现率）

两边在上列 SHA 的 Git tree 里，Yi-Hot 有 **751** 个 blob 文件，上游有 **673** 个；以**同路径文件**计：

| 结构指标 | 文件数 | 如何解释 |
| --- | ---: | --- |
| 双方都有此路径 | 357 | 仅表示文件路径存在于两端 |
| 路径和 blob SHA 都相同 | 70 | 可以确定当前两端文件内容逐字相同 |
| 同路径但 blob 不同 | 287 | 包括公益定制、维护修复、上游演化差异 |
| 仅 Yi-Hot 有 | 394 | 包括自有功能，也包括 docs、数据资产、品牌和测试 |
| 仅上游有 | 316 | 包括上游新模块化、工程变化，不等于“缺了 316 项功能” |

**不能**把 `70 / 673` 写成“继承率”、把 `316` 写成“缺失功能数”、把 commit 的 ahead/behind 当作产品能力分数；不同的代码组织方式会扭曲这些比例。上游模块迁移后同功能可能挪到不同路径，仍需逐条读实现、跑 CI、做回归。

## 三、已实现、停用与仅计划：四种状态

| 状态 | 典型事项 | 下一步要求 |
| --- | --- | --- |
| **代码与功能配置已具备** | 监管页面与后端、周/月报、Agent 多入口、后台用量、邮件订阅 | 如需声称“今日在线可用”，还须访问现网验证 |
| **代码具备但实际渠道可能暂停** | 公众号 WeRSS / 第三方社交来源、旧平台入口、部分筛选项 | 以运行态健康/预算及对应文档为准 |
| **开关明确关闭** | 模型榜、Codex 重置监控、当前新日报出版、独立精选栏目 | README 不提供成“现有功能” |
| **尚未完成最终迁移/验收** | charity-intelligence 历史实体库全量接入、新的 AIHOT 模块化架构、最新上游功能逐项同步 | 按 [整合路线](INTEGRATION_ROADMAP.md) 和 [上游重构方案](AIHOT_UPSTREAM_REBUILD.md)推进 |

## 四、可重复的版本核查步骤

1. 锚定两个仓库最新 commit（不是依据名称猜同版本），分别记录当日 Git tree。
2. 先对照 `apps/web/app/routes.ts`、`industry/features.ts`、后端 `apps/api/src/app.ts` 和来源/评分/事件代码；同路径不同内容必须看**行为差异**。
3. 按继承/定制/扩展/停用/规划分别标注，并核对 `docs/RELATED_PROJECTS.md`、第三方归属及历史 ADR。
4. 升级只在隔离分支执行，验证迁移顺序、数据库兼容、定时任务、成本限额、邮件与监管再考虑生产。
5. 收尾要有腾讯云现场回执（URL、版本、登录保护、实际入选/费用/任务健康），再把“仅代码”提升成“线上已验证”。

相关：[现有入口导航](SITE_MAP.md) · [仓库历史与重构](AIHOT_UPSTREAM_REBUILD.md) · [维护手册](../MAINTENANCE.md)。
