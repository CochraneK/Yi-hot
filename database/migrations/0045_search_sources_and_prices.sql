-- 网页搜索型信源（kind='search'）与 DeepSeek 真实单价。
--
-- 在此之前的两处偏差：
--   1. 价格表里是 USD 0.3 / 1.2，那是 deepseek-chat 时代的报价；现在 deepseek-flash 的官方价是
--      人民币「缓存命中 0.02 / 未命中 1 / 输出 4」（每百万 token，空闲时段），高峰翻倍。
--      拿旧价估算，既错了币种也错了量级。
--   2. 只有 (llm, deepseek-chat) 和 (llm, '') 两行，而调用记录里的名字已经变成 deepseek-flash。
--      usage.ts 过去靠注册表反查 service，模型改名后老名字查不到，7937 次历史调用整段变成
--      「未定价」。现在改为按 receipt_attempts 上记录的 (service, model) 直接匹配，这两行都要在。
--
-- 高峰价用 `@peak` 后缀单独一行（usage.ts 的约定）：model 名后加 @peak 的那行只在
-- 北京工作日 09:00–12:00 / 14:00–18:00 生效，没有这一行就等于该服务不分时段。
-- 价格来源：https://api-docs.deepseek.com/zh-cn/quick_start/pricing （2026-10-22 核对）

ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_kind_check;
ALTER TABLE sources ADD CONSTRAINT sources_kind_check
  CHECK (kind = ANY (ARRAY['rss'::text, 'web_list'::text, 'json_list'::text, 'x_search'::text, 'search'::text, 'mp_account'::text, 'external'::text]));

INSERT INTO service_prices (service, model, currency, input_per_mtok, cached_per_mtok, output_per_mtok, per_request, source_url, verified_on, note)
VALUES
  ('llm', '', 'CNY', 1, 0.02, 4, NULL,
   'https://api-docs.deepseek.com/zh-cn/quick_start/pricing', '2026-10-22',
   '兜底行：service=llm 下未单独定价的模型按 DeepSeek Flash 空闲价估算。'),
  ('llm', 'deepseek-flash', 'CNY', 1, 0.02, 4, NULL,
   'https://api-docs.deepseek.com/zh-cn/quick_start/pricing', '2026-10-22',
   '空闲时段价：输入未命中 1、命中 0.02、输出 4（元/百万 token）。高峰价见 deepseek-flash@peak。'),
  ('llm', 'deepseek-flash@peak', 'CNY', 2, 0.04, 8, NULL,
   'https://api-docs.deepseek.com/zh-cn/quick_start/pricing', '2026-10-22',
   '高峰时段价（北京工作日 9–12、14–18）：未命中 2、命中 0.04、输出 8。@peak 后缀由 usage.ts 识别。'),
  ('llm', 'deepseek-chat', 'CNY', 1, 0.02, 4, NULL,
   'https://api-docs.deepseek.com/zh-cn/quick_start/pricing', '2026-10-22',
   '旧模型名，请求现由 DeepSeek-V4.1-Flash-1017 承接，与 deepseek-flash 同价。保留这一行，历史调用才算得出钱。'),
  ('llm', 'deepseek-chat@peak', 'CNY', 2, 0.04, 8, NULL,
   'https://api-docs.deepseek.com/zh-cn/quick_start/pricing', '2026-10-22',
   'deepseek-chat 的高峰价，同上。'),
  ('deepseek-tools', '', 'CNY', NULL, NULL, NULL, 0.005,
   'https://api-docs.deepseek.com/zh-cn/quick_start/pricing', '2026-10-22',
   '网页搜索/抓取：¥5 / 1000 次成功请求 = ¥0.005/次，按次计费、不产生 token。空结果与失败不收费。')
ON CONFLICT (service, model) DO UPDATE SET
  currency = EXCLUDED.currency, input_per_mtok = EXCLUDED.input_per_mtok, cached_per_mtok = EXCLUDED.cached_per_mtok,
  output_per_mtok = EXCLUDED.output_per_mtok, per_request = EXCLUDED.per_request, source_url = EXCLUDED.source_url,
  verified_on = EXCLUDED.verified_on, note = EXCLUDED.note, updated_at = now();

-- 搜索按「每天每组查询一次」的日级幂等窗口计费（同一查询同一天复用响应，不重复收费）。
-- 计划量：8 组查询/天 + 少量正文抓取 ≈ 12 次/天。熔断取约三倍余量：40 次/天 ≈ 最坏 ¥6/月。
INSERT INTO budgets (service, per_minute, per_hour, per_day, note) VALUES
  ('deepseek-tools', 10, 60, 40, '网页搜索/抓取（按次计费 ¥0.005/次）：8 组查询/天 ≈ ¥1.2/月，40 次/天为熔断上限')
ON CONFLICT (service) DO NOTHING;
