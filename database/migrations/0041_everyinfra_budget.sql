-- EveryInfra（第三方公开内容 API，见 docs/PAID_CHANNEL_PROVIDERS.md）的预算熔断行。
-- 计费口径（2026-10-20 核实）：小红书 search 约 $0.0056/次、note 详情约 $0.013/次，失败与空结果不计费。
-- 计划量：P1 三个关键词每天各一次搜索 ≈ 3 次/天；P3 起每天最多 30 次详情，合计约 35 次/天。
-- 熔断值取计划量的约两倍（重试与突发有余量，失控才断）：60 次/天 ≈ 最坏 $0.8/天 ≈ ¥170/月，
-- 而按计划跑约 $4.4/月。要更严就调低 per_day；调 0 即停用该服务。
INSERT INTO budgets (service, per_minute, per_hour, per_day, note) VALUES
  ('everyinfra', 5, 20, 60, '小红书公开内容采集（按次计费，P1 只搜索不拉详情）')
ON CONFLICT (service) DO NOTHING;
