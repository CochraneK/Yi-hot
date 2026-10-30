# 旧仓库 CochraneK/Yi-hot 的 PR 存档（2026-10-30 导出）

旧仓库为删除重建 fork 而移除，这里保留 PR 的标题、状态、时间与正文，供日后检索。
共 15 条。代码本身已合并进提交历史，此文件只保存 PR 元数据与叙述。

## #1 [closed] chore: bootstrap private AIHOT upstream history and safe YiHot v3 rebuild
- 作者: CochraneK
- 创建: 2026-10-09T17:58:34  合并: 2026-10-09T18:00:14
- 分支: `chore/aihot-upstream-bootstrap` → `main`

## Goal
Implement **B: upstream-aligned rebuild** without resetting the private YiHot repository or touching Tencent Cloud.

## Implemented
- Add a safe GitHub Actions job to fetch **the complete public AIHOT Git history** into a private fast-forward-only `vendor/aihot-main` branch.
- On the first successful run, create `rebuild/aihot-aligned` **from the actual AIHOT upstream commit**, with full Git ancestry, then never auto-reset it.
- Run daily and on explicit workflow dispatch; no upstream code is executed, no external secrets requested, no change to `main` engine, no production deployments.
- Document immutable baseline, migration map, safety/rollback and exact validation gates in `docs/AIHOT_UPSTREAM_REBUILD.md`.

## Notes
This PR is the **bootstrap phase**, not the complete charity-specific migration. The existing `main` remains authoritative for running YiHot. The importer creates branches only after this PR is merged, and fails safely if GitHub Actions write permissions are disabled. After import, port the industry/site/extension modules onto `rebuild/aihot-aligned` and validate on a separate test database; do not merge unrelated histories back into `main`.

## Validation
- [ ] Existing `Check` CI green
- [ ] New `vendor/aihot-main` branch points at exact AIHOT commit
- [ ] New `rebuild/aihot-aligned` branch points at same initial commit
- [ ] Existing `main` remains intact and no Tencent services restart

## #2 [closed] fix: make AIHOT sync monitor safely without Workflows-capable token
- 作者: CochraneK
- 创建: 2026-10-09T18:07:08  合并: 2026-10-09T18:08:43
- 分支: `fix/aihot-upstream-token-gate` → `main`

## Cause
First AIHOT import fetched the public complete Git history successfully, but a standard GitHub Actions `GITHUB_TOKEN` was **rejected** for creating branches containing upstream `.github/workflows/check.yml` because it lacks `Workflows: write` permission. This is distinct from ordinary repository `contents: write`.

## Fix
- Change the daily action into a reliable **upstream status check by default**; it reports whether `vendor/aihot-main` matches public AIHOT and emits an explicit warning on drift rather than an unexplained failed push.
- Support optional **`AIHOT_SYNC_TOKEN`** with narrowly scoped Contents+Workflows read/write permission for real unattended fast-forward updates; no token is committed or echoed.
- Never force push, never modify the rebuilt branch once created, and never deploy to Tencent Cloud.
- Document the precise permission requirement and protected fallback.

Initial real AIHOT history is **already imported and verified** via authorized connector: `vendor/aihot-main` and `rebuild/aihot-aligned` started from original public SHA `8ef28ebcd1`.

## #3 [closed] sync(v3): merge AIHOT 18ddc7 public upstream into charity rebuild
- 作者: CochraneK
- 创建: 2026-10-09T18:40:20  合并: 2026-10-11T06:47:43
- 分支: `sync/aihot-18ddc7` → `rebuild/aihot-aligned`

## What this actually does
- Real two-parent Git merge of `KKKKhazix/AIHOT@18ddc7b17f` into the YiHot v3 rebuild lineage, **without squashing upstream commits**.
- Preserve all 26 untouched upstream changes byte-for-byte, including UI/navigation, wording pipeline and associated regression tests.
- Resolve the sole overlapping file `site/site.ts` manually, keeping YiHot's charity naming/crawler/MCP identity and adding upstream's new configurable `NAV` export.
- All old `main` code, cloud deployment and existing production data remain untouched.

## Review gates
- [ ] Rebuild-specific CI green on the merge result (testing after deployment-safe model mock environment fix).
- [ ] Audit upstream `industry/wording.ts` for charity-specific wording; retain existing YiHot prompt quality.
- [ ] Validate AIHOT-only fixtures in backend integration tests; don't weaken meaningful tests.
- [ ] Add corrected test runner PostgreSQL 17 `pg_dump` client.

`vendor/aihot-main` == AIHOT public main SHA `18ddc7b17f` at preparation. The merge commit actually has the public upstream commit as its second parent.

## #4 [closed] sync(v3): AIHOT Oct 10 upstream fixes for evidence, recovery and wording
- 作者: CochraneK
- 创建: 2026-10-11T06:49:49  合并: 2026-10-11T06:56:45
- 分支: `sync/aihot-20261010` → `rebuild/aihot-aligned`

## Real upstream merge
- Merge upstream AIHOT through commit `9cf2a3c` (2026-10-10) as a second Git parent, preserving original upstream history.
- Pull 20 upstream-changed files including withdrawn evidence exclusion, related-event recall, alert scan windows, selection re-evaluation, and wording refusal handling.
- Resolve sole overlap `tests/analyze.test.ts` by applying upstream refusal fixture while keeping YiHot charity-specific analysis fixtures.
- Target only `rebuild/aihot-aligned`. Never touch `main` or Tencent Cloud.

## Release gates
- [ ] `Check` green (build, Docker, browser, backend).
- [ ] `YiHot v3 rebuild check` green (isolated PostgreSQL 17 regressions).
- [ ] Check CI failures for source permissions and charity taxonomy differences.

A newer upstream commit `931a4eb` from Oct 11 is not yet in local `vendor/aihot-main`; it will be integrated in a later sync when mirrored, rather than faking upstream ancestry.

## #5 [closed] feat(v3): restore NewsMail and charity source audit as read-only historical baseline
- 作者: CochraneK
- 创建: 2026-10-11T06:55:19  合并: 2026-10-11T07:02:46
- 分支: `integration/three-repo-source-baseline-v3` → `rebuild/aihot-aligned`

## Actual M1 migration to YiHot v3
- Preserve original NewsMail 99-candidate and charity-intelligence 101-compliance-row inventories (including provenance, duplicate conflicts and historical probes), plus archived 20-row YiHot source seed.
- Bring forward the complete existing source-audit script and six offline invariant tests; pin its old input to a frozen 2026-10-08 copy instead of silently using a different v3 `industry/sources.json`.
- Preserve deterministic generated candidate JSON, CSV and 2026-10-08 audit Markdown. Add `npm run sources:audit:check` and CI gate.
- Archive previous integration/governance plan, and include explicit truthful status: imported snapshots **are not a live collector, permission grant, SMTP integration, charity entity database or new admin UI**.

## Safety
- New candidates remain `approved=false`, `enable_collection=false`.
- No external network fetch, PostgreSQL mutation or Tencent Cloud deployment.
- v3 admin UX and all NewsMail/charity live features still require separate reviewed PRs.

This PR branches from the verified v3 rebuild baseline; it can merge independently after CI and after checking the ongoing upstream PR #4 for conflicts.

## #6 [closed] 优化公益总报、动态日期与标签，修复发布链并接入免费公众号信源
- 作者: CochraneK
- 创建: 2026-10-12T13:39:56  合并: 2026-10-13T05:41:52
- 分支: `codex/source-expansion-wechat` → `main`

公益动态使用收录日期分组，导致新抓到的旧文章日期错位；日报内容稀少，手机卡片还隐藏了标签。本改动将全部动态按原文日期优先排序与展示，未知日期明确标注收录；复用已有分析和主题注册表展示、筛选标签，不增加标签模型调用。

日报定时任务、补刊和缺日报告警停用，仅生成周报、月报，入口改为“公益总报”并放在精选之前；保留旧日报详情/API 兼容，提供周报/月报 RSS。修复报告类型识别遗漏 /yihot/ 部署前缀引起的循环跳转。

同时包含前次六项审查修复：撤稿派生文案与并发旧综述保护、日期更正同步、后台返回路径、PWA 子路径、依赖补丁和 LF。来源扩充及免费 WeRSS 已在腾讯云验证；四个新增来源已启用并进入正常选稿。AmCham China 已通过认证公众号接入，首轮入库 15 篇，网站 RSS 的抓取限制仍在。

群发邮件和邮件信源作为两项后续工作记录在 docs/INTEGRATION_ROADMAP.md，当前未发送邮件或读取个人邮箱。

验证：TypeScript、生产构建、18 项前端测试、6 项信源审计通过；Linux / Node 24 的 152 项后端测试全部通过。线上整站 smoke、日期排序、导航与标签 SSR、周报/月报调度、FutureMe 均通过。部署备份与实际结果见 docs/PRODUCT_UPDATE_2026-10-13.md。无数据库结构迁移，生产模型、预算与全文权限未更改。

## #7 [closed] docs: turn YiHot README into a visual product showcase
- 作者: CochraneK
- 创建: 2026-10-18T07:24:07  合并: 2026-10-18T07:24:32
- 分支: `docs/readme-showcase-20261018` → `main`

## 为什么改
当前 README 约 1,518 行，运维说明很全，但新访客很难迅速理解产品价值。

## 本次交付
- 重设计 README（约 132 行）：产品定位、在线入口、核心能力、快速开始、使命主题、架构、AIHOT 归属和已知限制。
- 增加 3 张轻量、可版本化、文字可检索的原创 SVG：hero、信息处理链路和 13 主题。均是示意图而非真实网站截图。
- 将原 README 按原 Git blob 完整存入根目录 `MAINTENANCE.md`，保持 1,518 行操作手册与旧链接、运维细节不丢失。
- 透明披露仍为私有仓库、并非官方产品、目前 CI 尚未全绿、隐私模板待维护者完善；不虚构研究样本量或运营成效。

## 范围与验证
- 仅 README、图像、完整手册，共 5 个文件；未修改应用代码、数据库、信源和部署。
- compare commit 已确认变动范围；3 张 SVG 文件、全量目录均已从 GitHub 分支重新取回检查。
- 现有 main CI 的两个后端标签断言和 Docker smoke 信源数量断言属于先前问题，本 PR 不处理也不宣称通过。

## 参考
借鉴 AFFiNE 的视觉首屏、Open WebUI 的直达体验、RSSHub 的精简入口与 changedetection.io 的真实功能表达。

## #8 [closed] test: fix CI regressions after mission topic and source expansion
- 作者: CochraneK
- 创建: 2026-10-18T07:34:22  合并: 2026-10-18T07:36:43
- 分支: `fix/ci-taxonomy-seed-count-20261018` → `main`

## What failed
- Backend `tests/analyze.test.ts`: two expectations were missing the intentional `其他领域` fallback mission tag. `tests/card-tags.test.ts` already asserts the intended behavior.
- Docker smoke: all app endpoints passed; the final seed-count assertion still expected 20 rows, while the current `industry/sources.json` seeds 21.

## Changes
- Update only the two expected tag arrays in `tests/analyze.test.ts`.
- Compare Docker CI's new database source count against the actual registry length rather than a hard-coded number.

## Scope
No product logic, model prompts, database migration, production data, README, or Tencent Cloud deployment changes. CI only.

## #9 [closed] docs: restore Save the Children logo to YiHot README first screen
- 作者: CochraneK
- 创建: 2026-10-18T07:42:53  合并: 2026-10-18T07:42:59
- 分支: `docs/restore-save-the-children-logo` → `main`

Restore the existing `industry/brand/save-the-children.svg` from the original README to the new visual first screen. Include adjacent attribution clarifying the third-party mark and that YiHot is independently maintained, not an official Save the Children collaboration or endorsement. No changes to app code, source data, deployments or license.

## #10 [closed] docs: maintain a living YiHot operations handbook across future changes
- 作者: CochraneK
- 创建: 2026-10-18T07:49:15  合并: 2026-10-18T07:49:46
- 分支: `docs/living-handbook-policy-20261018` → `main`

## 目标
保留简洁 README（明星项目展示）和最完整操作手册，同时让后续 Codex、Copilot、人工 PR 主动更新手册而不遗漏部署、微信、邮件、标签与新功能的操作经验。

## 改动
- `MAINTENANCE.md`：原 1,518 行保持不删，加入口提示、历史数据快照警告与第 22 章“持续维护规则”。
- `AGENTS.md`：将 Living Handbook 加入 Codex/Agent 冷启动入口和改动同步纪律。
- `.github/copilot-instructions.md`：让 Copilot 同样读取手册。
- `.github/PULL_REQUEST_TEMPLATE.md`：提示 PR 检查手册或说明无需更新理由。

## 边界
仅文档与 PR 模板；不改 README、业务逻辑、模型、数据库、环境变量或腾讯云部署。不宣称已实现无人值守自动文档更新。动态的信源数、价格、服务器版本必须注明快照日期与证据。

## #11 [closed] docs: export README and living handbook as readable PDFs
- 作者: CochraneK
- 创建: 2026-10-18T08:40:41  合并: 2026-10-18T08:40:46
- 分支: `docs/auto-export-pdfs-20261018` → `main`

Generate three PDFs directly from canonical GitHub Markdown, preserving the 1,569-line MAINTENANCE.md, the README illustrations and current source links: README PDF, MAINTENANCE PDF and a merged edition. GitHub Actions regenerates PDFs after documentation changes and publishes both an artifact and `docs/pdf` direct download files. No change to application code, database, source feeds or Tencent Cloud.

## #12 [closed] feat(sources): stage four child-rights official feeds and track remaining gaps
- 作者: CochraneK
- 创建: 2026-10-21T05:31:08  合并: 2026-10-21T05:35:17
- 分支: `feat/child-rights-sources-20261021` → `main`

## 本轮真实交付
- 在 `industry/sources.json` 补上 **救助儿童会国际、UNICEF 中国新闻、UNICEF 全球新闻、UNICEF Innocenti 研究** 4 条公开官网采集配置，均为 **`enabled:false`，无付费采集接口，回灌上限 6–8，禁全文分发**。
- 新增 `data/source-registry/proposals-child-rights-2026-10-21.json`，记录其余 **41** 项儿童政策、儿童公益机构、国际机构、机会渠道和媒体缺口。它不是可导入的 `sources` 表。
- 新增 `docs/SOURCE_EXPANSION_2026-10-21.md` 交付“证据、选择器、未验证点、云端 seed 步骤与启用前 preview”。同步 `MAINTENANCE.md` 第 23 章。
- 新增不联网的安全测试，并纳入现有 GitHub Check 工作流。

## 校验边界
栏目及标题/链接的 CSS 模式参照 2026-10-21 只读公开网页，但尚未在腾讯云用 YiHot 自有 `fetchWebList` 实抓。前置授权、robots/ToS 仍需审定。高风险接口（国家卫健委、最高检部分站点、慈善中国等）没有伪造解析器或绕过防护。

## 落地与验收
GitHub 变更不等于服务器完成部署。部署机明确执行 `node --env-file=.env scripts/seed.ts` 后，会新增四条暂停信源且不覆盖既有数据库行；管理员逐条 Preview，确认日期与许可后手动启用。**本 PR 不触碰腾讯云生产库、不发真实采集或模型调用。**

## #13 [closed] ops: safely migrate YiHot production default from DeepSeek Chat to Flash
- 作者: CochraneK
- 创建: 2026-10-21T05:55:40  合并: 2026-10-21T05:58:08
- 分支: `ops/switch-default-model-deepseek-flash-20261021` → `main`

## Why
DeepSeek retired the legacy `deepseek-chat` alias, while YiHot's last production runbook snapshot still used it. The repository already supports `deepseek-flash` and its `.env.example` already configures non-thinking Flash, but committed templates cannot update a real server `.env`.

## What this PR does
- `tools/switch_deepseek_flash.py`: safe **dry-run by default**; `--apply` backs up the live `.env` inside ignored `.data/backups/model-switch/`, preserves the actual API Key, changes only `LLM_MODEL=deepseek-flash` and non-thinking `LLM_EXTRA_JSON`, recreates **api and worker only**, checks their container environment, and attempts rollback if validation fails. Rejects non-official endpoint / missing key; does not print secrets or call any LLM API.
- Seven offline Python unit tests, wired into GitHub Check.
- [Production cutover instructions](docs/DEEPSEEK_FLASH_SWITCH_2026-10-21.md) with no-secret, copy/paste commands, receipt/pricing caveats, rollback and admin per-stage overrides. Synchronize MAINTENANCE living manual and tools index.

## Explicit boundary
The user requested switching the model. This PR prepares and audits the production switch but **does not claim Tencent Cloud was modified**: `/opt/yihot/.env` and live DB are inaccessible from the GitHub plugin. After merging, a server operator must run `cd /opt/yihot && python3 tools/switch_deepseek_flash.py --apply` to make the real change. Do not re-run historical jobs just to create receipts, and do not change the existing account keys.

## #14 [closed] docs(handoff): archive YiHot chat, correct source snapshot and preserve SVG atlas
- 作者: CochraneK
- 创建: 2026-10-23T16:14:34  合并: 2026-10-23T16:17:03
- 分支: `docs/archive-chat-yihot-20261024` → `main`

## 本轮对话归档
用户明确要求归档当前聊天并实际落地 Git。新增 `docs/HANDOFF-2026-10-24-CHAT-ARCHIVE.md`：记录 Oscholar 1665 计划讨论（仅研究候选，不等于正式来源）、公益五类来源覆盖与 #12 扩容、DeepSeek 付费/API 每日预算及 USD/CNY/百万 Token 单位、#13 Flash 切换、#11 PDF 自动生成、生产 vs Git seed 统计口径、source quality、已知失效与后续动作。

## 以可复核数据替换 AI 作图幻觉
新增可编辑 `docs/assets/yihot-source-atlas-2026-10-23.svg`。只绘制 10-23 22:00 北京维护记录：生产 sources=190/启用=169/selected=1270/近3天=1005；Git seed=133（search 61/web_list 47/json_list 17/rss 8）。明确 44/60 是另一类原名单覆盖口径、不与前述相加。旧图的 42 seed、16/60 已过时，禁止再传播。

## 已知审计待办
发现 `docs/SOURCE_COVERAGE.md` 报告标题写“24省”但枚举仅“23省”；不猜测丢失条目，记录需要生产 SQL 验证。10-23 EveryInfra 日预算为 0 导致14源受影响；生产 Flash 是否执行未知；都只作为带日期待核验项。

## 交接入口
更新 `docs/PROJECT_CONTEXT.md` 当前交接指针、`MAINTENANCE.md` 增设第32章。未触碰生产库、信源抓取、价格设置或任何密钥；只有 docs + SVG。

## #15 [open] docs: reconcile 2026-10-24 handoff's 23/24 provincial coverage discrepancy
- 作者: CochraneK
- 创建: 2026-10-23T16:32:03  合并: —
- 分支: `docs/20261024-province-count-audit` → `main`

## Scope
- Precisely label the 2026-10-23 provincial table as 23 **enumerated** regions, not a verified current production total.
- Explain why neither 23/31 nor 24/31 should be publicized before checking production DB, including runtime web-probe sources.
- Add a read-only source-level SQL query for a production operator to use before mapping to provinces.

## Verification
- Read the 2026-10-24 handoff archive and SOURCE_COVERAGE.md.
- Counted 23 distinct province labels directly in the table; the 8 named gaps complement those 23 to 31.
- No production DB/SSH access was used; **live total remains unknown**.
- Documentation-only change, no collection/budget/model settings modified.

## Remaining P1
Run province-code-anchored production SQL and replace historical snapshot only after reconciling every source with selected publications.
