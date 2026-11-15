# YiHot007 · 地理语义候选复用现有结构化 AI（2026-11-16）

## 本轮改变什么

沿用 YiHot 已存在的 `structure_article` 模型调用，在其 JSON 中增加可选 `geography` 数组，字段是 `place / role / evidence`。角色分为：
- `event`：活动、政策发布等**被描述为发生地点**的候选；
- `affected`：受影响、覆盖或服务的地区；
- `publisher`：文章主体机构位置（不等于事件位置）；
- `mentioned`：仅提及或角色无法确认。

例：「北京某公益组织在四川凉山开展儿童教育项目」→ `北京` 应是 `publisher` 线索、`四川凉山` 才是 `event` 线索，各自附原文引文；后者仍只是 **候选**，不是已证实的事件坐标。

实现在 `packages/backend/src/editorial/geography.ts`：要求 `evidence` **确实出现在原始标题/正文/摘要/X帖或正文译文**，且包含 `place`。不通过的候选直接丢弃；去重，最多四项；不从信源名称、作者或网页域名推断。证据验证只表示「引文属实」，并不能独立证明「角色判断为真」。

结果仅保存在既有私有 `analyses.output.geography`，形态为 `{ status: "candidate", origin: "structure", receiptId, candidates }`。旧的 category、tags、subjects、fact 继续按原契约解析。**没有通过公开 `publication` 层输出；不会改变网站地图圆点、当前「当地」标签，也不会在后台把提及地点自动升级为发生地。**

## AI 与成本的边界

- 本次**确实接入现有模型**：只有未来达到原有结构分析门槛的文章才会让已存在的 `structure_article` 请求多输出地理字段。未达到结构门槛的文章仍不会有 AI 地理标签。
- 不新增 `chatJson` 调用、不引入独立服务/Worker/定时任务/数据库迁移/地图 API；保留模型回执、预算熔断与生产安全开关。
- **不是零成本承诺**：system prompt 变长、生成结构字段可能增加输入和输出 token；提示词 hash 改变，明确触发同一文章重新分析时会产生新的 structure 收据（不能把旧 prompt 的回执当新版本复用）。对已有历史数据不自动回填、不批量调用模型。
- 尚未部署腾讯云：没有线上结构模型的真实输出、消费金额或地理准确率可报告。

## 验证和误判控制

`tests/geo-structure.test.ts` 验证跨地城市、机构与项目地区分、无原文支撑的幻觉过滤、重复去除、四项上限、X 帖原文和翻译、跨字段拼接引文拒绝；`tests/analyze.test.ts` 的模拟模型响应验证已有 `structure` 收据即会落库候选，`火星` 幻觉不进入记录，并验证**没有增加第六次收费请求**。

不允许直接用这批候选推断哪条新闻「当地」：先设计数据表 `geo_mentions` 或相应证据源、明确地点解析词典和人工核实审核，尤其校验不同地区名称冲突、背景新闻与主体地址。对已撤下或未发布的资料必须沿用 publication 层读门槛。

## 后续 M1 阶段

1. 建立地点标准化（行政区、名称别名、来源、精度、歧义）和 event/affected/publisher/mentioned 可追踪的数据关系；纠正之前仅有 60 个城市中心点的覆盖限制。
2. 从 `analyses.output.geography` 做**离线、不收费**的 candidate→place 映射，并保留不能确定的候选为待审，建立标注抽样与误报率统计。
3. 人工抽检至少 100 条跨省、跨语言、同名地的已发布新闻（重点考察机构名、事件地、服务覆盖地的混淆），指定可发表的置信度门槛。
4. 只有经过验证的证据才通过 `packages/backend/src/publication/` 进入正式地图和「当地」匹配；支持国家/省市/时间的全量分页筛选。
5. 腾讯云验证实际结构调用结果、token 增量、模型预算与前后端兼容后才可正式上线，失败可回滚 prompt / geography 存储，保留历史 AI 回执。

## 依赖与回滚

关联已合并 PR #51 与 Issue #52。回滚本 PR 时撤去 prompt 的 geography 要求、StructureSchema 可选字段及输入证据校验，原结构字段、数据库、已有资讯与地图页面继续工作。README 不增加宣传成分；本记录属于工程维护说明。
