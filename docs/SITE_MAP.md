# Yi-Hot 页面与接口导航（从路由源码核对）

> **2026-10-30 源码核对**：根据 `apps/web/app/routes.ts`、`apps/web/app/routes/admin/layout.tsx`、`apps/api/src/routes/{site,static,feeds,agent}.ts`、`industry/features.ts` 和 `apps/web/server.ts` 汇总。**有路由不代表此刻线上服务正常；这次没有完成生产 HTTP 实测**。  
> 站点的网页在 `/yihot/` 子路径；API / Feed / about/dashboard 可在根路径访问，服务端也接收带 `/yihot` 前缀的请求。以下以 README 已配置的 `https://49.233.72.222` 为示例；若证书或线上代理未就绪，请使用本站当前实际可访问的地址并保留相同路径。

## 读者可直接访问的页面

| 入口 | 路径 | 用途与状态 |
| --- | --- | --- |
| **首页 / 精选** | [打开](https://49.233.72.222/yihot/) `/yihot/` | 公益动态入口 |
| **动态** | [打开](https://49.233.72.222/yihot/all) `/yihot/all` | 阅读、搜索、精选/未读筛选 |
| **热点** | [打开](https://49.233.72.222/yihot/hot) `/yihot/hot` | 按事件聚合的热点 |
| **主题** | [打开](https://49.233.72.222/yihot/topics) `/yihot/topics` | 领域分类、机构相关主题 |
| **周报** | [打开](https://49.233.72.222/yihot/weekly) `/yihot/weekly` | 周度公益总报 |
| **月报** | [打开](https://49.233.72.222/yihot/monthly) `/yihot/monthly` | 月度公益总报 |
| **监管记录** | [打开](https://49.233.72.222/yihot/records) `/yihot/records` | 民政部处罚与社会组织异常/失信公告；`regulatoryRecords=true`，手机版“更多”可进入 |
| **邮件订阅** | [打开](https://49.233.72.222/yihot/subscribe) `/yihot/subscribe` | 确认订阅、按期收报、邮件内退订 |
| **Agent 接入** | [打开](https://49.233.72.222/yihot/agent) `/yihot/agent` | Agent Skill / MCP / RSS / REST API 四种方式 |
| **收藏** | [打开](https://49.233.72.222/yihot/starred) `/yihot/starred` | 浏览器本地收藏 |
| **关于** | [打开](https://49.233.72.222/yihot/about) `/yihot/about` | 站点与主题介绍 |
| **公众号内容分析** | [打开](https://49.233.72.222/about/dashboard) `/about/dashboard` | 独立静态数据图表页面；关于页底部有入口；**不是线上实时抓取报表** |
| **更新日志** | [打开](https://49.233.72.222/yihot/changelog) `/yihot/changelog` | 本站版本与用户可见变化 |
| **意见反馈** | [打开](https://49.233.72.222/yihot/feedback) `/yihot/feedback` | 反馈问题、遗漏和原文归属 |
| **隐私 / 条款** | [隐私](https://49.233.72.222/yihot/privacy) · [条款](https://49.233.72.222/yihot/terms) | 上线前运营方仍须核对实际联系信息与法律条款 |
| **多项目门户** | [打开](https://49.233.72.222/) `/` | 根路径门户，非 Yi-Hot 子路径 |

**不作为当前可用入口宣传的路由**：`/yihot/leaderboard`（模型榜）、`/yihot/codex-reset`（Codex 重置）、`/yihot/daily`（旧日报）：代码中的功能开关分别为 `false`，或仅存在历史档案；不能仅因路由在源代码中就宣称当前提供完整功能。详细情况见 [差异比对](AIHOT_FEATURE_COMPARISON.md)。

## 管理员入口：登录后才有权限查看

**登录：[Yi-Hot 后台](https://49.233.72.222/yihot/admin)；单独的 [登录页](https://49.233.72.222/yihot/admin/login)**。打开 `/admin` 后重定向至信源管理 `/admin/sources`（带 `/yihot` 前缀）。后端 `/api/admin/*` 对未登录会话返回 401，写操作要求 CSRF；网站没有把这些页面开放给普通读者。

| 管理功能 | 实际页面路径 | 备注 |
| --- | --- | --- |
| 信源管理 | [`/yihot/admin/sources`](https://49.233.72.222/yihot/admin/sources) | 当前后台默认页 |
| **候选信源** | [`/yihot/admin/sources/candidates`](https://49.233.72.222/yihot/admin/sources/candidates) | 来源发现/试用相关流程 |
| 新增信源 | [`/yihot/admin/sources/new`](https://49.233.72.222/yihot/admin/sources/new) | 有写操作的管理页 |
| 内容诊断 | [`/yihot/admin/content`](https://49.233.72.222/yihot/admin/content) | 内容、筛选与问题定位 |
| 运行记录 | [`/yihot/admin/runs`](https://49.233.72.222/yihot/admin/runs) | 任务与失败情况 |
| **用量与成本** | [`/yihot/admin/usage`](https://49.233.72.222/yihot/admin/usage) | 模型/外部服务费用 |
| 模型与评测 | [`/yihot/admin/models`](https://49.233.72.222/yihot/admin/models) | 模型选择、价格与评测 |
| SelectBench | [`/yihot/admin/selectbench`](https://49.233.72.222/yihot/admin/selectbench) | 精选评分测试 |
| 用户反馈 | [`/yihot/admin/feedback`](https://49.233.72.222/yihot/admin/feedback) | 反馈后台 |
| 设置 | [`/yihot/admin/settings`](https://49.233.72.222/yihot/admin/settings) | 站点运行设置；操作前须知后果 |
| 审计日志 | [`/yihot/admin/audit`](https://49.233.72.222/yihot/admin/audit) | 操作审计 |
| Codex 监控后台 | `/yihot/admin/monitor` | **当前关闭**，不作为在线可用入口 |

## 公开程序接口与订阅源

这些路径和上面的网页路由不是同一组，API 根路径通常**不加** `/yihot`：

| 入口 | 链接 | 实际用途 |
| --- | --- | --- |
| 精选 RSS | [`/feed.xml`](https://49.233.72.222/feed.xml) | 订阅入选信息 |
| 全部 RSS | [`/feed/all.xml`](https://49.233.72.222/feed/all.xml) | 全部公开条目 |
| 周报 RSS | [`/feed/weekly.xml`](https://49.233.72.222/feed/weekly.xml) | 周报源 |
| 月报 RSS | [`/feed/monthly.xml`](https://49.233.72.222/feed/monthly.xml) | 月报源 |
| Agent Markdown | [`/api/v1/agent`](https://49.233.72.222/api/v1/agent) | 给 Agent 阅读的查询说明 |
| MCP | [`/api/mcp`](https://49.233.72.222/api/mcp) | 对接 MCP 客户端（不是面向浏览器的人类页面） |
| OpenAPI 3.1 | [`/openapi-v1.json`](https://49.233.72.222/openapi-v1.json) | 公开 API 接口清单 |
| LLM 说明 | [`/llms.txt`](https://49.233.72.222/llms.txt) | 面向大模型的站点说明 |

**安全与数据边界**：列出路径并不绕过后台鉴权；不要在 GitHub Issue/README 填入 Cookie、密钥或含个人邮箱的订阅操作链接。UI 访问权限依赖登录会话，反向代理仍须按现行安全配置保护。

## 如何判断链接真实可用？

| 层级 | 本文是否核对 | 说明 |
| --- | --- | --- |
| **源码有路由、路径及功能开关** | ✅ | 已核对 `main`  |
| **静态文件在仓库存在** | ✅ | 监管、日报、Agent 等页面文件与 dashboard 资产 |
| **腾讯云与 `main` 一致** | 未核验 | 需要服务器实际版本/容器运行信息 |
| **浏览器真实 HTTP 200 / 登录跳转 / 内容有数据** | 未核验 | 需要可访问的线上环境；不能把源码证据当成 live 链接检查 |

相关：[功能差异矩阵](AIHOT_FEATURE_COMPARISON.md) · [维护手册](../MAINTENANCE.md) · [监管记录设计](REGULATORY_RECORDS.md)。
