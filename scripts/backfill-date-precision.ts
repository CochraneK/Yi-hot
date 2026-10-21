// Repairs date-only publication times for one source by reading each article's own byline.
//
// Collectors read the listing page, and some listings print only the day ("2026/10/21") while the
// article page carries the time ("2026/10/21 17:45"). The detail pass in collect.ts only runs for
// material it has not seen yet, so rows stored before `detail.upgradeDatePrecision` was configured
// keep their midnight date forever. This walks them once and refines the ones whose page agrees.
//
// node --env-file-if-exists=/app/.env scripts/backfill-date-precision.ts <sourceId> [limit]
import { closeDb, sql } from "@aihot/backend/db";
import { fetchDetail } from "@aihot/backend/sources/web-list";
import { decideTimeline } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import type { SourceRow } from "@aihot/backend/sources/types";

const sourceId = process.argv[2];
const limit = Number(process.argv[3] ?? "40");
if (!sourceId) {
  console.error("usage: backfill-date-precision.ts <sourceId> [limit]");
  process.exit(1);
}

const [source] = await sql<SourceRow[]>`
  SELECT id, name, kind, config, tier, participation_mode, first_party, interval_minutes, enabled,
    cursor, fail_count
  FROM sources WHERE id = ${sourceId}`;
if (!source) {
  console.error(`missing source ${sourceId}`);
  process.exit(1);
}

const rows = await sql<{
  id: string;
  url: string;
  published_at: Date;
  discovered_at: Date;
  backfill_reason: string | null;
}[]>`
  SELECT id, url, published_at, discovered_at, backfill_reason
  FROM articles
  WHERE source_id = ${sourceId} AND published_at_precision = 'date' AND published_at IS NOT NULL
  ORDER BY discovered_at DESC
  LIMIT ${limit}`;

// The site prints its own local time; the stored date is the same day in that offset.
const dayInOffset = (d: Date) => new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 10);

let fixed = 0;
let skipped = 0;
let failed = 0;
for (const a of rows) {
  try {
    const got = await fetchDetail(a.url, source, { date: true, title: false, summary: false });
    if (!got.publishedAt || got.publishedAtPrecision !== "datetime") {
      skipped += 1;
      continue;
    }
    // Only a time on the same day refines the listing's day; a different day is a different claim,
    // and overwriting it here would silently move the article.
    if (dayInOffset(got.publishedAt) !== dayInOffset(a.published_at)) {
      skipped += 1;
      continue;
    }
    const t = decideTimeline(got.publishedAt, a.discovered_at, a.backfill_reason);
    await sql`
      UPDATE articles SET published_at = ${t.publishedAt}, published_at_claim = ${got.publishedAt},
        published_at_precision = 'datetime', timeline_at = ${t.timelineAt}, backfill = ${t.backfill},
        backfill_reason = ${t.backfillReason}, updated_at = now()
      WHERE id = ${a.id}`;
    // The feed reads publications.published_at, which keeps its own copy of the time.
    await publishArticle(a.id);
    fixed += 1;
  } catch {
    failed += 1;
  }
}
console.log(JSON.stringify({ sourceId, scanned: rows.length, fixed, skipped, failed }));
await closeDb();
