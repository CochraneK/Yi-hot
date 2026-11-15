# YiHot009 · 已保存 AI 地理候选的零模型调用回填（2026-11-16）

## 为什么需要

PR #54 已将 AI 地点候选写入 `analyses.output.geography`，但 PR #57 的 `geo_candidates` 关系表是在之后才加入的。**仅靠未来新文章落库，不能把这段过渡期已完成的结构化分析恢复到审核队列。**

新增 `packages/backend/src/admin/geo-backfill.ts` 与 `scripts/backfill-geo-candidates.ts`：
- 只读已存在的 `analyses.output.geography.candidates`，不调用 LLM、不改变提示词、不重算评分或翻译。
- 只处理 `analyses.input_revision=articles.revision`、当前 `publications.analysis_id` 对应同一分析、`visibility=public AND eligible=true` 的记录。
- 重新通过 `GeoCandidateSchema` 和 `groundGeoCandidates`：必须在当前新闻原文、摘要、X 文本或已存正文译文找到包含地名的直接引文，防止保存内容曾被错误生成。
- **只 INSERT `geo_candidates.review_status=pending`**。不建立或修改 `geo_places`，不把 AI 角色自动认作事件地、不向 public API 直接曝光未审核结果。
- `ON CONFLICT DO NOTHING` 保证重复执行不会插入相同地点。每个 INSERT 使用数据库内的当前版本与当前发布关联条件，防止并发改版或撤稿。

## 运维使用（数据库已迁移到 0052，授权管理环境）

```bash
# 缺省只输出计数，没有任何写入
node scripts/backfill-geo-candidates.ts

# 下一批或指定范围的预览。after 是分析 id，不是新闻 id
node scripts/backfill-geo-candidates.ts --after=0 --limit=100

# 运营者确认数据库、发布范围和审计计划后，才主动写入待审核记录
node scripts/backfill-geo-candidates.ts --after=0 --limit=100 --apply

# 后续批次显式带上前一轮 JSON 输出的 lastAnalysisId
node scripts/backfill-geo-candidates.ts --after=<lastAnalysisId> --limit=100 --apply

# 接下来由人核实，不自动批准
node scripts/review-geo.ts list 30
```

- 每批 `limit` 为 1～200，`after` 必须非负整数；默认 100，默认 dry-run。
- 输出 `mode / scanned / grounded / inserted / rejected / skippedChanged / lastAnalysisId / morePossible`。如已到结尾 `morePossible=false`；为 true 仅代表这一批已达 limit，并不保证下一页一定有数据。
- 无自动运行或后台任务；上次范围重复跑也安全（已审核的候选不会降回 pending）。
- 若审核数据中有错误，使用 `review-geo.ts` 的人工拒绝或 reopen 功能；源材料撤稿后公开索引随发布层自动过滤。
- 从未运行过 PR #54 新版结构模型的文章没有 `geography`，本脚本**不会为它们补造 AI 标签**；后续另议免费规则回填或预算受控批次。
- 当前脚本只恢复当前可公开池中的文章；隐藏文章、精选未通过公开门槛等候选不进入读者索引。精选仅待发布时间释放但 visibility=public 的私有待审核候选可能进入审核队列，不会提前出现在公共接口。

## 质量闸门与验收

`tests/geo-backfill.test.ts` 验证：
- 预览零写入、零模型回执；
- 执行写 pending 而非 verified；北京/成都的角色保留，原文没有的「火星」自动丢弃；
- 重复执行无重复记录；
- 文章原文版本变化后不从旧输出回填；
- 超限参数拒绝，不让无意操作扫全库。

生产迁移、数据库操作与 100 条真实新闻审核尚未执行，不可视为覆盖率或模型地理准确性验收。Issue #52 后续仍需行政区地名标准化、人工审核工作台、样本评估与可扩展实地图。

## 部署与回滚

前置：PR #57 / migration 0052 已在目标库部署并验证。此脚本按需调用，无常驻进程，不改 Web/API 及发布规则；回滚脚本不会删除或撤销已批准的地理记录，所有数据库核对可经审核 CLI 单独处理。
