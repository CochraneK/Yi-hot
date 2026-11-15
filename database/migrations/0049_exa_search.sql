-- Exa 网页搜索（kind='search' 的第二条引擎，config.engine='exa'）。
--
-- 为什么单独记账：Exa 的额度单位是美元信用，不是人民币按次。新账号每月赠 $10（Lite $4/1000 次
-- ≈ 2,500 次/月），额度耗尽即停。与 deepseek-tools 混在一个 service 下，「买花多少」和「还剩
-- 多少免费额度」两笔账会混，预算熔断也会互相误伤。
--
-- 价格口径（2026-11-14 核对 https://exa.ai/pricing）：
--   Search Lite  $4 / 1000 次（含 10 条结果，每多一条 +$1/1000）
--   Search Auto  $7 / 1000 次
--   Contents     text / highlights / summary 各 $1 / 1000 页
-- 因此默认 auto 时按 $0.007 估算会偏高，但 exa.ts 优先用响应里的 costDollars 记 actual，
-- 这一行只是「响应没带价格」时的兜底，取 Lite 价（最便宜的合法值，不会虚报花费）。
--
-- 日上限 60：60 × 30 = 1,800 次/月 × $0.004 = $7.2，给 contents（若某源开了 highlights 或
-- needContent）留 28% 余量。超过就熔断，宁可少抓一天也不要月中把免费额度打空后整月无搜索。

INSERT INTO service_prices (service, model, currency, input_per_mtok, cached_per_mtok, output_per_mtok, per_request, source_url, verified_on, note)
VALUES
  ('exa', '', 'USD', NULL, NULL, NULL, 0.004,
   'https://exa.ai/pricing', '2026-11-14',
   'Lite 搜索 $4/1000 次（含 10 条结果）；Auto $7/1000。免费额度 $10/月。响应带 costDollars 时以实测为准。')
ON CONFLICT (service, model) DO UPDATE SET
  currency = EXCLUDED.currency, input_per_mtok = EXCLUDED.input_per_mtok, cached_per_mtok = EXCLUDED.cached_per_mtok,
  output_per_mtok = EXCLUDED.output_per_mtok, per_request = EXCLUDED.per_request, source_url = EXCLUDED.source_url,
  verified_on = EXCLUDED.verified_on, note = EXCLUDED.note, updated_at = now();

INSERT INTO budgets (service, per_minute, per_hour, per_day, note) VALUES
  ('exa', 6, 20, 60, 'Exa 网页搜索（免费额度 $10/月，Lite $4/1000 次 ≈ 2500 次/月）：60 次/天 ≈ 1800 次/月，余量留给 contents')
ON CONFLICT (service) DO NOTHING;
