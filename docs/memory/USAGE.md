<!-- 本文件由 tools/sync_memory.py 从 .workbuddy/memory/USAGE.md 单向生成，请勿直接编辑。 -->
<!-- 源目录 .workbuddy/ 在 .gitignore 里，所以这里是为「换机器 / 换 AI 接手」准备的脱敏镜像。 -->
<!-- 要改：改 .workbuddy/memory/USAGE.md → 重跑 `python tools/sync_memory.py`。 -->

# Yi-Hot 用量与费用（10-09 建档）

- 数据在 **`receipt_attempts`**（`usage` jsonb＝`prompt_tokens`/`completion_tokens`；另有 `model`/`cost`/`cost_basis`/`currency`/`origin`/`latency_ms`/`started_at`）。链路：`LLM_MODEL=deepseek-chat` → `MODELS.default` → service=**`llm`**（`providers/llm.ts`）。
- **价格表 `service_prices` 原为空** → 后台费用列全显示"未定价"。已插 `('llm','deepseek-chat','USD',0.30,0.006,1.20)` + 兜底 `('llm','','USD',…)`（**高峰价**；来源 api-docs.deepseek.com，2026-10-09 核对）。**`models.ts` 的 `serviceOf()` 靠 `MODELS[*].model|key` 匹配 → model 名对不上就查不到价**。
- 展示页：**`/yihot/admin/usage`（"用量与成本"，10-09 新建）**＝4 张 Stat（调用/token/估算费用/月化）+ 每日 token 堆叠图 + 每日费用折线 + 按用途明细 + 用量占比 + 计价方式 + 至今累计；后端 `admin/usage.ts` 的 `usageOverview(days)`，API `GET /api/admin/usage?days=`（≤365，默认 30）。另有 `/yihot/admin/models`（"模型与评测"）＝按用途×模型的调用/成功率/p50-p95/token/费用 + 模型切换。
- **单价可在后台在线编辑（10-09 加）**：`/admin/usage` 的「计价方式」卡 → 右上「新增单价」/ 每行「编辑·删除」，走 `ReasonDialog`（原因写审计）→ `POST /api/admin/usage/prices`（body `{price, reason}`）/ `DELETE /api/admin/usage/prices?service=&model=&reason=`（model 空＝兜底行；不存在返回 **404**）。后端 `admin/models.ts` 的 `savePrice`/`deletePrice`（upsert + audit `price.create/update/delete`），校验：service 必填、三个价至少填一个、非负数字。卡里还有**「实际在用」区**：列出窗口内 `receipt_attempts.model` 实际出现的名字 + 注册表映射的 service，标注「已定价 / 未定价 / 不在注册表」，可直接「补价」——这是排查"为什么一直显示未定价"的最快入口。
- 累计 ≈**$0.99 / ¥7**（10 天，1317 次）；近 7 天 $0.53；**月化区间 $2.28–$3.98**（上限口径，非高峰减半）。
- ⚠️ **计价口径（10-09 修）**：`costOf(tokensIn, tokensOut, calls, price)` = `输入单价×输入/1e6 + 输出单价×输出/1e6 + **按次单价×调用次数**`；**按次单价此前只存不算**（填了没效果），已接上；`cached_per_mtok`（缓存命中单价）**仍不参与估算**（调用记录没区分缓存命中 token，`usage` 只有 `prompt_tokens`/`completion_tokens`），表单里如实标注"暂不参与估算、先留档"。**改这段前先读 `usage.ts` 的 `costOf` 注释。**
- **验证按次计价的手法（可复用）**：`deploy/verify-percall.py` —— 登录后取 `/api/admin/usage`，对**实际在用的那一行**（`seenModels[0]` 映射的 service/model，**不是兜底行**：`priceFor` 优先精确匹配，改兜底行对已有精确行的模型无效）临时设 `perRequest=0.0001`，断言 Δ＝`0.0001×calls`（窗口合计与 lifetime 都要对），再原样还原并复查。实测 Δ=0.134100 = 0.0001×1341 ✅。
- ⚠️ **月化不可用单一均值**：日历日均×30 会被**节假日空窗**压低（如国庆 10-03~10-07），活跃日均×30 会被**首次全量回填尖峰**（09-30）抬高 → 代码同时给 `projection`（日历）与 `projectedActive`（活跃），页面展示为**区间**并注明口径。**改动这段前先读 `admin/usage.ts` 的 `recent` 注释。**
- ⚠️ **`lifetime`（至今累计）金额必须按 model 逐组计价**（10-09 修）：原实现用 `prices.find(p => p.model !== "")` 拿"第一条非空 model 的价格"硬套全部历史——只要有任何一条别的价格行排到前面（如我插的自检行 `__selftest__`），累计金额就会凭空变化。现已改为 lifetime 查询 `GROUP BY model` 后逐组 `priceFor()` 累加。
- **新增后台页的完整链路（可复用）**：①后端模块 ②API 路由 ③web 页面 ④`routes.ts` 注册 ⑤`layout.tsx` 的 NAV ⑥**跑 typegen 生成 `+types`**（否则 tsc 报错）⑦3 端 tsc ⑧传 5 文件 → build → `up -d` ⑨登录后验 200 / 匿名验 302。typegen 命令：`cd apps/web && node ../../node_modules/@react-router/dev/bin.cjs typegen`（**不是** `react-router/bin.js`）。
- 图表直接用现成的 `apps/web/app/features/admin/charts.tsx`（`LineChart`/`StackedBars`/`ShareBars`，无依赖 SVG，支持 `null` 断线）；系列色传 `"var(--accent)"`/`"var(--amber)"` 即自适应明暗主题。
- **`docs/PROJECT_CONTEXT.md`（10-09 建）**＝本记忆的**脱敏版交接文档**（凭据剔除），供换机器/换 AI 时 clone 仓库即可接手。**改动了关键事实记得同步更新它。**
