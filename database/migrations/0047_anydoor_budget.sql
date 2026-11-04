-- AnyDoor 免费池（auto 路由）的请求预算。
-- 作用：压住 yihot 打向免费上游（默认主用 alibaba）的速率，避免一次 sweep
-- 几百个请求瞬间烧穿上游免费额度、触发「频率限制 / 11:46 重置」这类硬锁。
-- 数值留得很宽：真实日量（一次 sweep ~600 调用、全天几千）远碰不到，
-- 只在积压突发时当天花板用，不会拖慢正常运营。
-- ON CONFLICT 保证可重复执行（直接 psql 或 migrate 都不会因主键冲突失败）。
INSERT INTO budgets (service, per_minute, per_hour, per_day, note)
VALUES ('anydoor', 60, 2000, 20000, 'AnyDoor 免费池爆发天花板：正常不触发，只防突发烧穿免费额度')
ON CONFLICT (service) DO UPDATE SET
  per_minute = EXCLUDED.per_minute,
  per_hour   = EXCLUDED.per_hour,
  per_day    = EXCLUDED.per_day,
  note       = EXCLUDED.note,
  updated_at = now();
