# Handoff — 机构主题误归类清理与防复发（2026-10-19）

## 1. 任务背景

用户发现「救助儿童会」主题里混入了一篇爱德基金会年报。排查后确认**不是单条问题**，而是机构主题（机构与平台）存在两个系统性根因，导致大量第三方合作方、合集/纪事类内容被误归入机构主题。本 handoff 记录两个根因的修复、数据清理结果与遗留事项。

## 2. 根因与修复

### 根因 1：主体证据缺失（已部署）
- **现象**：结构化模型给出机构主体（`subjects`）后，系统只校验实体 ID 是否存在，不校验该机构是否真是文章主体。导致同一封爱德月报同时进入腾讯公益、壹基金、中慈联、乡村发展基金会等多个主题。
- **修复**（提交 `a1b33ac`，分支 `codex/source-expansion-wechat`）：
  - `packages/backend/src/editorial/analyze.ts` 新增 `verifiedEntitySubjects()`：机构必须**拥有该信源**（`owner_entity_id` 匹配）或**原始标题明确点名该机构别名**（`industry/taxonomy.ts` 登记），满足其一才进入机构主题。正文顺带提及、多事件简报不计入。
  - 机构显示标签（`tagsForVerifiedSubjects`）复用同一结果，消除「主题页已清理但卡片仍挂错标签」。
  - 新脚本 `scripts/repair-entity-subjects.ts`（默认 dry-run，`--apply` 才写入并重发布）。
  - 测试：`tests/analyze.test.ts` 已含主体证据用例。
- **部署状态**：✅ 已在服务器（analyze.ts 校验逻辑确认在 `aihot-api-1` 容器内）。

### 根因 2：综合转载栏目误设 owner（本轮提交 `99de2d2`）
- **现象**：生态环境部官网「政策文件」栏目（`web-mee-zcwj`）转载中央综合政策，却设置了 `owner_entity_id = ministry-of-ecology-environment`，导致来源归属被当成文章主体，把退役军人、社会工作、新就业群体、法治宣传教育等无关中央文件带进生态环境部主题。
- **修复**：
  - `industry/sources.json`：移除 `web-mee-zcwj` 的 `owner_entity_id`（环保要闻、新闻发布两个聚焦栏目保留）。
  - `MAINTENANCE.md` / `docs/PROJECT_CONTEXT.md`：明确 `owner_entity_id` 只适用于「每条内容都可视为该机构动态」的专属栏目，综合转载/中央文件转载/媒体聚合等宽栏目不得设置。

## 3. 数据清理结果

### 已完成（codex 额度耗尽前）
- 线上只读预览识别 **64 篇受影响文章、93 条历史分析记录**（民政部 32 次、腾讯公益 19 次、阿里公益 13 次、抖音公益 12 次等被合作方/合集带入）。
- 已先备份数据库，再执行清理。救助儿童会主题从 11 条变为 10 条，爱德纪事已移除，其余 10 条均为救助儿童会自有信源。

### 本轮补充（2026-10-19 接手续做）
1. **发现 codex 遗漏**：codex 只改了 `sources.json` 文件，**未同步 DB 的 `sources.owner_entity_id`**——修复脚本读的是 DB 而非文件，所以修复对历史数据与运行后端均未生效。
2. DB 置空：`UPDATE sources SET owner_entity_id = NULL WHERE id='web-mee-zcwj'`（与 sources.json 现已一致，未来重载 sources 表也不会再把 owner 带回来）。
3. **精准清理 4 篇误归类**（经用户确认保留生态政策内容）：
   - 退役军人服务和保障「十五五」规划
   - 中共中央 国务院印发《关于加强新时代社会工作的意见》
   - 关于加强新就业群体服务管理的意见
   - 中央法治宣传教育第九个五年规划
   
   使用临时脚本（`docker cp` 进 `aihot-api-1` 执行，已删除）仅移除这 4 篇的 `ministry-of-ecology-environment` 主体/标签并重发布；生态环境部主题中其余生态政策内容（美丽中国、碳达峰碳中和、蓝天保卫战、排污许可证、生态环境监测条例、CCER 等）**全部保留**。

## 4. 验证结果

| 检查项 | 结果 |
|---|---|
| 4 篇误归类归零（publications 层） | 0 ✓ |
| 误归类归零（analyses 层） | 0 ✓ |
| web-mee-zcwj 剩余主题文章 | publications 层 7 篇，全部为生态/气候政策 ✓ |
| 线上健康 | `{"ok":true,"db":"ok"}` ✓ |
| DB 备份 | `/tmp/aihot_backup_20261019.sql`（52MB）✓ |

## 5. 遗留事项与注意事项

1. **分支未合 main**：`codex/source-expansion-wechat` 领先 `main` 约 19 个提交（含微信信源扩展等），机构修复尚未合入 main。
2. **部署机制**：`tools/sync.py` 是文件拷贝式部署（`/opt/yihot` 非 git 仓库），服务器跑的是已同步的工作树镜像；本轮 sources.json 已由 codex 同步，analyze.ts 修复已在镜像内。注意容器 `/app` 不是 `/opt/yihot` 的实时挂载——新文件要生效需 `docker cp` 进容器或重建镜像。
3. **建议后续**：
   - 全量扫描其他信源是否还有「综合转载栏目设了 owner」的同类问题（本次只处理了用户抽样发现的生态环境部一例）。
   - 机构主题清理可定期跑 `repair-entity-subjects.ts` dry-run 作为健康检查。
4. **修复脚本日志小瑕疵**：repair 脚本 dry-run 输出里的 `updatedAnalyses` 计数不准（postgres.js 的 `.count` 在结果数组上而非 `res[0]`），不影响 apply 逻辑，后续可顺手修正。
