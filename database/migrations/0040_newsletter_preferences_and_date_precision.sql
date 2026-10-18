ALTER TABLE newsletter_subscriptions
  ADD COLUMN daily boolean NOT NULL DEFAULT false,
  ADD COLUMN pending_weekly boolean,
  ADD COLUMN pending_monthly boolean,
  ADD COLUMN pending_daily boolean;
ALTER TABLE articles
  ADD COLUMN published_at_precision text NOT NULL DEFAULT 'datetime'
    CHECK (published_at_precision IN ('date', 'datetime'));
UPDATE articles SET published_at_precision = 'date'
WHERE published_at IS NOT NULL
  AND (published_at AT TIME ZONE 'Asia/Shanghai')::time = TIME '00:00:00';
