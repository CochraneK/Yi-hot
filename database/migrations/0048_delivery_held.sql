-- 内容群从「每条一张卡」改为「一天一张热榜」。
-- 单条入选不再立刻投递，而是先在 deliveries 里攒着等当天那张汇总卡；这类行需要自己的状态，
-- 否则 ops.recover（markStaleDeliveries）会把 15 分钟没发出去的 pending 判成 failed。
-- 只加一个取值，历史行的 status 不受影响。
ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_status_check;
ALTER TABLE deliveries ADD CONSTRAINT deliveries_status_check
  CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'unknown', 'skipped', 'held'));
