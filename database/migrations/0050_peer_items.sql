-- 「邻域」：同框架姊妹站的入选条目，本地留档后供日报/周报/月报引用。
--
-- 这里只存**索引级**字段（标题、摘要、来源名、链接、对端分数），不存正文、不复刻排版：
-- 读者点标题回到原站读，署名与原文链接都保留。所以这张表既是缓存也是引用凭证。
--
-- 幂等：同一站同一条目重复抓到只更新 fetched_at 与可能变化的 score/summary，
-- 主键 (peer_id, item_id) 让每小时那次刷新不会产生重复行。
CREATE TABLE IF NOT EXISTS peer_items (
  peer_id      text NOT NULL,
  item_id      text NOT NULL,
  peer_name    text NOT NULL,
  peer_url     text NOT NULL,
  title        text NOT NULL,
  summary      text NOT NULL DEFAULT '',
  -- 对端模型写的「为什么入选」，比摘要更能说明这条为什么值得看；可能没有。
  reason       text,
  category     text,
  -- 对端自己的评分。只在同一站内部可比，跨站不能排序，选择逻辑按站分组后再轮流取。
  score        integer,
  source_name  text,
  item_url     text NOT NULL,
  original_url text,
  published_at timestamptz,
  first_seen   timestamptz NOT NULL DEFAULT now(),
  fetched_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (peer_id, item_id)
);

CREATE INDEX IF NOT EXISTS peer_items_published_idx ON peer_items (published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS peer_items_fetched_idx ON peer_items (fetched_at DESC);

-- 每家站最近一次抓取的结果。没有这张表，一家站静默死掉只能在「版块突然少了一块」时才发现。
CREATE TABLE IF NOT EXISTS peer_status (
  peer_id     text PRIMARY KEY,
  ok          boolean NOT NULL,
  items       integer NOT NULL DEFAULT 0,
  via         text,
  error       text,
  checked_at  timestamptz NOT NULL DEFAULT now()
);
