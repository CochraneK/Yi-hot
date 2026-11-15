-- 新增信源类型 peer：姊妹站条目作为信源进主流水线。
--
-- 与「邻域」板块的区别：板块是固定摘编（对端已经筛过一遍，按对端的标准），
-- 信源是让这些条目跟本站其他候选一样参与评分——只有过了本站口径的才会出现在正文分类里。
--
-- 适配器读的是 peer_items（见 sources/peer.ts），不新增任何出网请求。
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_kind_check;
ALTER TABLE sources ADD CONSTRAINT sources_kind_check CHECK (
  kind = ANY (ARRAY['rss', 'web_list', 'json_list', 'x_search', 'search', 'mp_account', 'external', 'peer'])
);
