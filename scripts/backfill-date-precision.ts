// Repairs date-only publication times by reading each article's own byline.
//
// Collectors read the listing page, and some listings print only the day ("2026/10/21") while the
// article page carries the time ("2026/10/21 17:45"). The detail pass in collect.ts only runs for
// material it has not seen yet, so rows stored before that pass covered a source keep their midnight
// date forever. This walks them and refines the ones whose page agrees.
//
// node --env-file-if-exists=/app/.env scripts/backfill-date-precision.ts <sourceId> [limit]
// node --env-file-if-exists=/app/.env scripts/backfill-date-precision.ts --all [limit]
import { closeDb, sql } from "@aihot/backend/db";
import { dayInOffset, fetchDetail } from "@aihot/backend/sources/web-list";
import { decideTimeline } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import type { SourceRow } from "@aihot/backend/sources/types";

const sourceArg = process.argv[2];
if (!sourceArg) {
  console.error("usage: backfill-date-precision.ts <sourceId|--all> [limit]");
  process.exit(1);
}
const all = sourceArg === "--all";
const limit = Number(process.argv[3] ?? (all ? "400" : "40"));

const sources = all
  ? await sql<SourceRow[]>`
      SELECT id, name, kind, config, tier, participation_mode, first_party, interval_minutes, enabled,
        cursor, fail_count
      FROM sources`
  : await sql<SourceRow[]>`
      SELECT id, name, kind, config, tier, participation_mode, first_party, interval_minutes, enabled,
        cursor, fail_count
      FROM sources WHERE id = ${sourceArg}`;
const byId = new Map(sources.map((s) => [s.id, s]));
if (!all && !byId.size) {
  console.error(`missing source ${sourceArg}`);
  process.exit(1);
}

interface Row {
  id: string;
  source_id: string;
  url: string;
  published_at: Date;
  discovered_at: Date;
  backfill_reason: string | null;
}
const rows = all
  ? await sql<Row[]>`
      SELECT id, source_id, url, published_at, discovered_at, backfill_reason
      FROM articles
      WHERE published_at_precision = 'date' AND published_at IS NOT NULL
      ORDER BY discovered_at DESC
      LIMIT ${limit}`
  : await sql<Row[]>`
      SELECT id, source_id, url, published_at, discovered_at, backfill_reason
      FROM articles
      WHERE published_at_precision = 'date' AND published_at IS NOT NULL AND source_id = ${sourceArg}
      ORDER BY discovered_at DESC
      LIMIT ${limit}`;

let fixed = 0;
let skipped = 0;
let failed = 0;
const touchedSources = new Set<string>();
for (const a of rows) {
  const source = byId.get(a.source_id);
  if (!source) {
    skipped += 1;
    continue;
  }
  try {
    // A search result's day comes from the retrieval index and is often a day off: the page decides.
    const expectDay = source.kind === "search" ? null : dayInOffset(a.published_at);
    const got = await fetchDetail(a.url, source, { date: true, title: false, summary: false, expectDay });
    if (!got.publishedAt || got.publishedAtPrecision !== "datetime") {
      skipped += 1;
      continue;
    }
    // Only a time on the same day refines the listing's day; a different day is a different claim,
    // and overwriting it here would silently move the article.
    if (expectDay && dayInOffset(got.publishedAt) !== expectDay) {
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
    touchedSources.add(a.source_id);
    fixed += 1;
  } catch {
    failed += 1;
  }
}
console.log(JSON.stringify({ scope: all ? "all" : sourceArg, scanned: rows.length, fixed, skipped, failed, sources: touchedSources.size }));
await closeDb();
