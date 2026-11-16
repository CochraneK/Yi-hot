# AIHOT 衍生站自动巡检 · 只发现、不自动收录

日期：2026-11-16。**YiHot 邻域目前只展示信息聚合类网站；核心内容付费的站点排除；机构官网新闻归 RSS 来源。**

## 为什么做

AIHOT 上游 `KKKKhazix/AIHOT` 的 fork 数持续增长；单纯 fork 数 ≠ 自主改编或公开上线。此前人工逐个读取 fork 的 `site/site.ts`，能发现站名已更改的实际改编，但反复手动巡检成本较高。本流程只获取 GitHub **公开元数据和站点身份配置**，在 YiHot 内维持**待审线索列表**，不让扫描结果自动进入对外推荐或付费采集。

## 运行入口

- `.github/workflows/aihot-derivative-audit.yml`：每周一 **03:23 UTC / 北京 11:23** 自动执行，也可在 GitHub Actions 中选择 **AIHOT derivative discovery → Run workflow** 手动立即执行。
- 只用 Actions 自带 `GITHUB_TOKEN`（仅 `contents:read`、`issues:write`），不需要用户提供个人 Token；不使用 YiHot 生产数据库/模型/服务器密钥。
- `scripts/scan-aihot-derivatives.mjs`：自动枚举上游**直接 forks**（默认最多 3,000），筛选近 60 天推送或创建的，检查最多 400 个新增/有变更的配置（考虑旧结构回退时每 fork 最多两次读取，预留 GitHub Actions Token 请求配额），调用 GitHub REST API 读取 `site/site.ts`，旧布局回退 `industry/site.ts`。不读取私有仓库。
- `scripts/lib/aihot-derivatives.mjs`：仅提取文本字面量 `SITE.name / SITE.subject / SITE.defaultUrl`，过滤 MyHOT/AIHOT 模板原值；比对 `industry/peers.ts` 的已登记站名/网址；识别公开官网**线索**，不主动连接任意候选站域名。
- 首次运行创建 **「AIHOT 衍生站自动巡检 · 待审线索」** Issue，此后只更新**同一 Issue** 的候选列表和内部压缩状态，避免每周生成大量新 Issue；JSON 状态记录已看过的仓库和最近 `pushed_at`，无变化不重复读配置、无实质变化不重复提醒。
- 每次保留 `report.md`、`result.json` 为 GitHub Actions Artifact（30 天）；Issue 显示按最近推送排序的至多 60 项未收录候选，Artifact 可看全量。运行异常明确标记不完整，失败时不假装全量完成。
- PR CI 仅执行 `node --check` 和 `node --test tests/aihot-derivatives.test.mjs` **离线测试**；不会在 PR 或 fork 事件中使用写权限执行不受信任的代码。定时流程不下载/执行第三方源码，不 checkout fork。

## 线索何时能进入「邻域」

需人工至少核实：公开网站确实在线且有独立的聚合资讯产品；核心聚合/分析内容**可以免费使用**（自愿打赏不算付费墙）；有跨源持续更新或独立主题价值；与已收录站去重；RSS/API 是否可用和发布许可。仅站名修改、主页链接、fork 推送时间 **不构成上述事实**。候选如是政府、大学、联合国等机构新闻页，应该走主站 RSS 信源，不应占用邻域卡片。

**不做的事情**：不创建自动 PR、不开启 `industry/sources.json` 或 `PEER_SITES` 中的新站、不改 `enabled`、不触发 `refreshPeers`、不增加付费模型调用、不修改腾讯云生产配置、不抓取或复制第三方全文，不探测未核实域名的端口或内网地址。

## 盲点与扩展

- 只覆盖 `KKKKhazix/AIHOT` 的**直接 fork**；下载源码另建仓库、通过模板创建、公开 Show and tell/Discussions 登记但不 fork 的项目目前不在自动覆盖范围。后续可加入经人工批准的社区公开登记表，不应把 GitHub 关键词搜索结果直接当真实改编。
- `SITE.name` 使用 JS 动态计算、拆分到其他模块或不改名但仅改行业 prompts 的 fork，可能漏报；这是保守检测，不是证明没有改编。
- 60 天窗口用于增量巡检，较早且近期无更新的老 fork 不一定覆盖。要回填历史可在具备合规 GitHub Token 的本地只读环境手动运行：`node scripts/scan-aihot-derivatives.mjs --lookback-days=365 --max-forks=3000 --max-configs=900 --dry-run`，但 900 次配置读取会增加 GitHub API 配额消耗；`--force` 会忽略 Issue 内已有的推送检查点。定时任务不自动强制重扫。
- fork 数超过 3000、单周待检查超过 600 或个别 fork API 失败时，报告显式披露截断与延期；延期对象下一轮仍可继续尝试。API 鉴权失效或访问受限需人工处理，不能使用第三方代理或绕过限流。
- 每周定时任务可能被 GitHub 延迟、取消；请在仓库 Actions 页面核对**实际运行**，不能把 workflow 合并当作已经运行并发现新网站。

## 维护与回滚

操作入口：`Actions → AIHOT derivative discovery`，Issue 为统一人工待审清单。确认新站达到免费聚合标准后，**单独**以 PR 修改 `industry/peers.ts`，加证据和单元测试，再经原 CI 合并；如需接入主新闻 RSS，也需走独立的信源许可/相关性/成本审查。问题排查顺序：Actions job 日志 → Artifact → Issue 压缩状态标记；Issue 异常或历史丢失时从 Artifact 找记录，不要强行覆盖损坏的状态。

暂停巡检：在 GitHub Actions 禁用 `AIHOT derivative discovery` 工作流，或删除该工作流的 `schedule` 部分；回滚该 workflow 和两个脚本不会影响采集、站点及数据库。Issue 是公开的第三方仓库元数据汇总，不含隐私或密钥。
