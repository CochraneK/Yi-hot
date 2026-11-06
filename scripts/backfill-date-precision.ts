// Repairs date-only publication times by reading each article's own byline.
//
// Collectors read the listing page, and some listings print only the day ("2026/10/21") while the
// article page carries the time ("2026/10/21 17:45"). The detail pass in collect.ts only runs for
// material it has not seen yet, so rows stored before that pass covered a source keep their midnight
// date forever — and a run that met more day-only items than its clock budget could read left the
// rest at midnight for good. This walks them and refines the ones whose page agrees.
//
// 2026-11-02 抽样 30 条：19 条页面确实印了钟点、7 条只有日、4 条取不到。也就是说这批"只到日"
// 里约三分之二不是页面没写，而是我们没读。
//
// node --env-file-if-exists=/app/.env scripts/backfill-date-precision.ts <sourceId> [limit]
// node --env-file-if-exists=/app/.env scripts/backfill-date-precision.ts --all [limit]
//   --days=N        只看最近 N 天入库的
//   --selected      只看已入选的（读者真正看得到的那批）
//   --concurrency=N 并发抓取，默认 4
import { closeDb, sql } from "@aihot/backend/db";
import { dayInOffset, fetchDetail } from "@aihot/backend/sources/web-list";
import { decideTimeline } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import type { SourceRow } from "@aihot/backend/sources/types";

const argv = process.argv.slice(2);
const flag = (name: string): string | null => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const positional = argv.filter((a) => !a.startsWith("--"));
const all = argv.includes("--all");
// `<sourceId|--all> [limit]`: the id is the non-numeric positional, the limit the numeric one.
const sourceArg = positional.find((a) => !/^\d+$/.test(a)) ?? (all ? "--all" : null);
if (!sourceArg) {
  console.error("usage: backfill-date-precision.ts <sourceId|--all> [limit] [--days=N] [--selected] [--concurrency=N]");
  process.exit(1);
}
const limit = Number(positional.filter((a) => /^\d+$/.test(a)).at(-1) ?? (all ? "400" : "40"));
const days = Number(flag("days") ?? 0);
const onlySelected = argv.includes("--selected");
const concurrency = Math.max(1, Number(flag("concurrency") ?? 4));

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
  published_at: Date | null;
  discovered_at: Date;
  backfill_reason: string | null;
}
const rows = await sql<Row[]>`
  SELECT a.id, a.source_id, a.url, a.published_at, a.discovered_at, a.backfill_reason
  FROM articles a
  -- Both cases the feed cannot show a real publication instant for: a bare day, and no date at all
  -- (the latter otherwise prints nothing but our own collection clock).
  -- The outer parentheses matter: without them AND binds tighter than OR and the --selected /
  -- --days filters below would apply only to the second branch, sweeping the whole archive.
  WHERE ((a.published_at_precision = 'date' AND a.published_at IS NOT NULL) OR a.published_at IS NULL)
    ${all ? sql`` : sql`AND a.source_id = ${sourceArg}`}
    ${days > 0 ? sql`AND a.discovered_at >= now() - ${`${days} days`}::interval` : sql``}
    ${onlySelected ? sql`AND EXISTS (SELECT 1 FROM publications p WHERE p.article_id = a.id AND p.selected)` : sql``}
  ORDER BY a.discovered_at DESC
  LIMIT ${limit}`;

let fixed = 0;
let skipped = 0;
let failed = 0;
const touchedSources = new Set<string>();
let cursor = 0;

async function one(a: Row): Promise<void> {
  const source = byId.get(a.source_id);
  if (!source) {
    skipped += 1;
    return;
  }
  try {
    // A search result's day comes from the retrieval index and is often a day off: the page decides,
    // but only within a day or two. Without that leash one stale byline (a page still printing 2021
    // under a 2026 listing) dragged the article back five years. With no date at all there is no
    // day to anchor to, so the discovery moment becomes the leash instead.
    const expectDay = a.published_at && source.kind !== "search" ? dayInOffset(a.published_at) : null;
    const got = await fetchDetail(a.url, source, { date: true, title: false, summary: false, expectDay });
    if (!got.publishedAt || got.publishedAtPrecision !== "datetime") {
      skipped += 1;
      return;
    }
    // A midnight stamp is a date in disguise, not a clock.
    if (new Date(got.publishedAt.getTime() + 8 * 3600_000).toISOString().slice(11, 16) === "00:00") {
      skipped += 1;
      return;
    }
    // Only a time on the same day refines the listing's day; a different day is a different claim,
    // and overwriting it here would silently move the article.
    if (expectDay && dayInOffset(got.publishedAt) !== expectDay) {
      skipped += 1;
      return;
    }
    if (a.published_at && source.kind === "search" && Math.abs(got.publishedAt.getTime() - a.published_at.getTime()) > 2 * 86_400_000) {
      skipped += 1;
      return;
    }
    if (!a.published_at) {
      const t = got.publishedAt.getTime();
      const now = a.discovered_at.getTime();
      if (t > now + 86_400_000 || t < now - 7 * 86_400_000) {
        skipped += 1;
        return;
      }
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

async function worker(): Promise<void> {
  while (cursor < rows.length) {
    const a = rows[cursor++];
    await one(a);
    if ((fixed + skipped + failed) % 100 === 0) {
      console.log(JSON.stringify({ done: fixed + skipped + failed, of: rows.length, fixed, skipped, failed }));
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));
console.log(JSON.stringify({ scope: all ? "all" : sourceArg, days, onlySelected, scanned: rows.length, fixed, skipped, failed, sources: touchedSources.size }));
await closeDb();
