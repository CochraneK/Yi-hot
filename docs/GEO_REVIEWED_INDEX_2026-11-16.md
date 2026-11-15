# YiHot008 · 审核后地理索引与公开筛选（2026-11-16）

## 用户可见变化

承接 PR #51（城市示意图）和 PR #54（AI 候选）：
- `/cities?city=chengdu` 保持现有**地名线索**视图，仍为文本搜索，不能证明发生地。
- 在城市页主动切换 `/cities?city=chengdu&reviewed=1` 后，新建的 `/api/site/geo?place=chengdu&page=1` 返回**人工审核通过、role=event**、且当前仍在公共动态池中的报道。后端按全库分页，不是只筛当页。未审核的新闻不会出现在已审核视图；没有结果显示空状态。
- 地图仍是城市代表点示意，非新闻现场的精确地图；「当地」标签仍沿用 PR #51 的原规则，**尚未升级为经核实事件地**。不能宣传为全面地图或全量省市定位。

## 唯一审核数据与可信路径

迁移 `database/migrations/0052_geo_reviewed_places.sql`：
- `geo_places`：人工维护地点 id、名称、国家代码、省/城市、代表经纬度、精度和**来源 URL**。这只是可复用的行政地点代表坐标；不能因被录入就证明新闻发生在此。
- `geo_candidates`：文章 id + 具体分析 id + 原文地名、role、原文引文、审核状态、对应地点 id。AI 提出候选时只会写 `pending`；人工同意才置 `verified`，拒绝为 `rejected`。
- `geo_review_audit`：批准、拒绝、重新打开等人工动作、审核人、原因的追加记录，恢复审核状态也保留日志。

新文章经已有 `structure_article` 收据做抽取并过滤无原文证据的幻觉；本轮仅增加 PostgreSQL 写入步骤，**不新增模型调用或后台排程，不自动重新分析历史**。将最新文章版本的候选与其 `analyses.id` 一起写入事务，避免旧版本数据被新模型处理覆盖。

公共读取只通过 `packages/backend/src/publication/geo.ts`。同时要求：
1. `geo_candidates.review_status='verified'` 且 `role='event'`，`place_id` 精确匹配。
2. `publications.analysis_id=geo_candidates.analysis_id` 且 `articles.revision=analyses.input_revision`，新闻原文改版不能沿用旧审核。注意 `publications.revision` 是公开投影自己的版本计数，不等于文章原文版本。
3. `publications.visibility='public'`、`eligible=true`，精选的 `visible_after` 发布时间门槛通过。
4. 不返回待审核的模型原文、审核员身份或内部审核记录；不泄漏被撤回、尚未公开和非编辑池材料。

列表分页 40/页，最多 50 页及 2000 条计数上限（与原动态池相同）；这是真实数据库范围内的地点过滤，但**不是**不受上限的全站精确计数，也尚无行政区树/多边形/距离检索。

## 授权管理员的审核流程

必须在能访问数据库的授权运行环境使用 CLI，**不用网页匿名接口做审核**，不要把 `DATABASE_URL`、个人位置、新闻内部资料写到仓库里。

```bash
node scripts/migrate.ts
node scripts/review-geo.ts list 30
# 只在核查行政实体、代表坐标和公开来源后注册地点。
# 下列名称和链接仅演示参数写法；实际记录以真实核验结果替换。
node scripts/review-geo.ts place <id> <name> <ISO-3166-country-code> <lat> <lon> city <https-source-url> <region> <city>
node scripts/review-geo.ts approve <candidate-id> <place-id> <reviewer-identifier> "<original-evidence-and-role-check>"
node scripts/review-geo.ts reject <candidate-id> <reviewer-identifier> "<reason>"
node scripts/review-geo.ts reopen <candidate-id> <reviewer-identifier> "<reason>"
```

`approve` 不只验引文存在：人工还必须核对新闻具体事件、主体机构与受影响地区是否被混淆。同名省市、区域粒度、海内外重名、事件跨多个城市都需核对。审核工具拒绝过时的文章版本；撤销批准后该地点立即从公共 SQL 结果消失，CDN 缓存最多延迟 60 秒。地点目录拒绝无可信 HTTPS 来源的注册。

## 真实发布风险及剩余工程

- GitHub CI 验证不等于腾讯云已迁移：在生产服务上线新后端 API **之前**，必须先运行 0052 migration；旧服务在新增表尚未安装时不能使用新端点。
- 现有 `/cities` 只列约 60 个城市。新增审核目录能支持更多地点 id，但前端地点选择和底图尚未扩展到全国区县；没有恢复所谓 368 个地点资产。
- `geo_places` 无自动可信外部填充；一条人工验证新闻可出现在城市页，必须先经授权管理员创建该城市的有来源地点，再批准候选。数据源与审核量实际为空时不要宣传覆盖率。
- 「当地」标签目前仍是 PR #51 的启发式文本标签，后续 Issue #52 需明确区分它与 `已审核事件地点`；生产上线可优先减少错误标签。
- 暂不引入自动反复 LLM 判断、IP 地理匹配或地图 SDK；需要人工样本不少于 100 条、审核准确率/误报评估、候选回填计划才考虑推广。
- 回滚 UI 和新 API 不会影响原新闻，数据库新表可保留用于审计；不要删除已有审核记录、付费收据或文章内容。

## 验收

`tests/geo-reviewed.test.ts`：待审核不可公开、机构地不算发生地、审核动作日志、重新打开/撤稿、精选延迟发布、文章改版后的旧地理信息排除、无效参数和审批验证；`tests/analyze.test.ts`：已有结构调用即时写入 pending 候选且不增加回执。

合并前必须等 CI 的 TypeScript、Backend tests、Web tests/build、Docker 和公众号渲染全绿；本次不执行真实生产迁移与真实模型调用。Issue #52 继续跟踪核验规模、地图图层、地点词典、近邻筛选与生产验收。
