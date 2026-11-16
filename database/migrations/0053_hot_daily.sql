-- One board per calendar day (Beijing), holding that day's last computed ranking.
--
-- hot_rankings keeps five-minute snapshots for 30 days — enough for the page and for asking
-- "what did the board look like an hour ago", and small enough to delete on a schedule. A yearly
-- report needs something else: one board per day, kept for years. A day's board is ~4 KB, so a
-- year costs a couple of megabytes instead of ~450 MB of intraday snapshots.
CREATE TABLE hot_daily (
  day          date PRIMARY KEY,
  computed_at  timestamptz NOT NULL,
  rule_version text NOT NULL,
  entries      jsonb NOT NULL,
  evidence     jsonb,
  inserted_at  timestamptz NOT NULL DEFAULT now()
);

-- The report reads a date range, newest first.
CREATE INDEX hot_daily_computed_at_idx ON hot_daily (computed_at DESC);
