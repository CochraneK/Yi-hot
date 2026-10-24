-- 队列可持续（Queue Sustainability）：归档态、归档原因、搜索 query 级归因。
--
-- 背景：2026-10-24 实测每日入稿 1,400–2,100 篇（其中 70% 是「发现即陈旧」的历史稿），
-- 每篇固定 5 次模型调用。按 ¥0.0065/篇算，满速消化约 ¥10–14/天，是目标（≤¥3/天）的 3–4 倍。
-- 只靠「高峰限流」和「历史排低谷」只是把付费推迟到夜里，不改变一天要付的总量；
-- 队列会随入稿速度线性变长。所以需要一个明确的**准入与退出**：超量的历史候选在花钱之前
-- 归档（保留原文、来源、原因，可随时重新入队），而不是无限排队。
--
-- 'archived' 与 'skipped' 的区别：skipped 是「本来就不需要分析」（非编辑型信源、讨论帖），
-- archived 是「需要分析但被容量闸门挡下」，只可能由 backpressure / 配额产生，可批量恢复。

ALTER TABLE articles DROP CONSTRAINT IF EXISTS articles_processing_state_check;
ALTER TABLE articles ADD CONSTRAINT articles_processing_state_check
  CHECK (processing_state = ANY (ARRAY['new'::text, 'analyzed'::text, 'skipped'::text, 'failed'::text, 'blocked'::text, 'archived'::text]));

-- 归档的审计线索：什么时候、因为哪条闸门（backlog / quota / stale-age）被挡下。
ALTER TABLE articles ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS archive_reason text;
CREATE INDEX IF NOT EXISTS articles_archived_idx ON articles (archived_at DESC) WHERE processing_state = 'archived';

-- 搜索 query 级归因：同一条 URL 可能被多条 query 命中，只记「首次带来它的那条」，
-- 这样按 query 汇总时不会把同一篇文章的付费算两遍。
ALTER TABLE article_discoveries ADD COLUMN IF NOT EXISTS query text;
CREATE INDEX IF NOT EXISTS article_discoveries_query_idx ON article_discoveries (query) WHERE query IS NOT NULL;
