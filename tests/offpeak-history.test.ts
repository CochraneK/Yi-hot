// Peak hours are billed at double. Today's news still gets the hourly trickle (someone is waiting for
// it), but a backfilled article is weeks old by definition: it should wait for the half-price window
// instead of spending the peak rate. Measured 2026-10-24: ¥9.93 of the previous 30 days' ¥31.67 of
// backfill cost landed inside peak hours, all of it avoidable.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { getBoss, stopBoss } from "@aihot/backend/jobs/queue";
import { holdsHistoryForOffPeak, sweepUnprocessed } from "@aihot/backend/jobs/content";

const T = tag();
const SOURCE = `test-offpeak-${T}`;
// Beijing 2026-10-21 (Wednesday) 10:00 = UTC 02:00 — inside the 09:00–12:00 peak window.
const PEAK = Date.UTC(2026, 9, 21, 2, 0, 0);
// Beijing 2026-10-21 20:00 = UTC 12:00 — half price.
const OFF_PEAK = Date.UTC(2026, 9, 21, 12, 0, 0);

const queued = async (id: string) =>
  (await sql<{ at: Date | null }[]>`SELECT processing_queued_at AS at FROM articles WHERE id = ${id}`)[0]!.at !== null;

/** One new article; `publishedDaysAgo` decides whether it counts as history (see isHistorical). */
async function article(id: string, publishedDaysAgo: number): Promise<void> {
  const history = publishedDaysAgo > 2;
  await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, published_at, timeline_at,
                                  revision, content_hash, body_text, body_status, processing_state, backfill, backfill_reason, created_at)
            VALUES (${id}, ${SOURCE}, ${id}, ${`https://example.com/${id}`}, ${`title ${id}`},
                    now() - interval '1 hour', now() - make_interval(days => ${publishedDaysAgo}), now(),
                    1, NULL, 'body', 'ok', 'new',
                    ${history}, ${history ? "first-import" : null}, now() - interval '1 hour')`;
}

before(async () => {
  await getBoss();
  await sql`INSERT INTO sources (id, name, kind, next_fetch_at) VALUES (${SOURCE}, 'Test off-peak', 'rss', '2100-01-01')`;
  process.env.ANALYZE_OFFPEAK_ONLY = "true";
});
after(async () => {
  await sql`DELETE FROM articles WHERE source_id = ${SOURCE}`;
  await sql`DELETE FROM sources WHERE id = ${SOURCE}`;
  delete process.env.ANALYZE_OFFPEAK_ONLY;
  await stopBoss();
  await closeDb();
});

test("the peak window is the weekday 09-12 and 14-18 in Beijing time", () => {
  assert.equal(holdsHistoryForOffPeak(PEAK), true, "Wednesday 10:00 is peak");
  assert.equal(holdsHistoryForOffPeak(Date.UTC(2026, 9, 21, 7, 0, 0)), true, "Wednesday 15:00 is peak");
  assert.equal(holdsHistoryForOffPeak(OFF_PEAK), false, "Wednesday 20:00 is half price");
  assert.equal(holdsHistoryForOffPeak(Date.UTC(2026, 9, 24, 2, 0, 0)), false, "Saturday 10:00 is half price all day");
});

test("peak sweep takes today's news and leaves history for the half-price window", async () => {
  const live = `live-${T}`;
  const old = `old-${T}`;
  await article(live, 0);
  await article(old, 30);

  await sweepUnprocessed(PEAK);
  assert.equal(await queued(live), true, "today's news still moves during peak hours");
  assert.equal(await queued(old), false, "a 30-day-old backfill does not spend the peak rate");

  await sweepUnprocessed(OFF_PEAK);
  assert.equal(await queued(old), true, "the same article is picked up as soon as the price halves");
});
