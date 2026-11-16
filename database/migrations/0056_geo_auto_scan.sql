-- Geo: give the nightly reviewer a scan cursor of its own.
--
-- The hourly pass selected the oldest 800 pending rows every hour and nothing
-- else. Once the head of the queue filled with candidates the rules can never
-- approve (role != event, place outside the gazetteer, institution names), it
-- rescanned the same 800 rows forever: on 2026-11-16 the map gained no city for
-- hours while 3,375 approvable candidates sat behind the block, and moving the
-- cursor by 800 immediately produced 51 approvals.
--
-- Stamping what was looked at drains the queue without rejecting anything. A
-- candidate the rules cannot decide stays `pending` with its evidence intact —
-- it simply leaves the scan set. After a gazetteer update, clear the stamps
-- (scripts/geo-auto-approve.ts --reset-scan) to give those rows a fresh look.
ALTER TABLE geo_candidates ADD COLUMN IF NOT EXISTS auto_reviewed_at timestamptz;

-- The scan always asks the same question: the next pending event candidate that
-- has not been looked at. Matching the predicate to the query keeps the index in
-- play as the table grows past ten thousand rows.
CREATE INDEX IF NOT EXISTS geo_candidates_auto_scan_idx
  ON geo_candidates (id)
  WHERE review_status = 'pending' AND auto_reviewed_at IS NULL AND role = 'event';
