// Groups backfilled articles of the last few days that never entered grouping, so that a copy of a
// case already on the site joins that card instead of standing beside it.
//
//   node --env-file=.env scripts/attach-recent-history.ts [--days 7] [--source <id>] [--dry-run]
//
// A first import (a new source's backfill, the search source's 7-day lookback) used to skip grouping
// entirely: every copy of the same case became its own card. Grouping now lets history attach to an
// occurrence but never found one, so the same pass is safe to run over an existing backlog: an item
// that matches nothing stays exactly as it was. Re-runnable; `grouped_at` keeps it from redoing work.
import { parseArgs } from "node:util";
import { closeDb, sql } from "@aihot/backend/db";
import { groupArticle } from "@aihot/backend/events/group";
import { computeHotRanking, backfillStoryHeat } from "@aihot/backend/events/hot";

const { values } = parseArgs({
  options: {
    days: { type: "string", default: "7" },
    source: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});

const days = Number(values.days);
if (!Number.isFinite(days) || days <= 0) {
  console.error("--days must be a positive number");
  process.exit(1);
}

const rows = await sql<{ id: string; source_id: string; title: string; published_at: Date }[]>`
  SELECT a.id, a.source_id, a.title, a.published_at
  FROM articles a
  JOIN analyses an ON an.article_id = a.id AND an.relevance = 'pass'
  WHERE a.grouped_at IS NULL
    AND a.published_at IS NOT NULL
    AND a.published_at > now() - make_interval(days => ${days})
    AND (${values.source ?? null}::text IS NULL OR a.source_id = ${values.source ?? null})
  ORDER BY a.published_at
`;

console.log(`candidates: ${rows.length}${values["dry-run"] ? " (dry run)" : ""}`);
if (values["dry-run"]) {
  for (const r of rows.slice(0, 40)) console.log(`  ${r.published_at.toISOString().slice(0, 16)}  ${r.source_id.padEnd(28)} ${r.title.slice(0, 40)}`);
  await closeDb();
  process.exit(0);
}

const tally: Record<string, number> = {};
const touched = new Set<number>();
for (const [i, r] of rows.entries()) {
  try {
    const result = await groupArticle(r.id);
    const key = result.verdict;
    tally[key] = (tally[key] ?? 0) + 1;
    if (result.storyId) touched.add(result.storyId);
    if (key !== "historical") console.log(`${i + 1}/${rows.length} ${key.padEnd(20)} story ${result.storyId ?? "-"}  ${r.title.slice(0, 34)}`);
  } catch (error) {
    tally.error = (tally.error ?? 0) + 1;
    console.error(`${i + 1}/${rows.length} failed ${r.id}: ${String(error).slice(0, 160)}`);
  }
}

// The joined cards changed: their event pages and the hot ranking should show the new membership.
for (const storyId of touched) {
  try {
    await backfillStoryHeat(storyId, 48);
  } catch (error) {
    console.error(`heat ${storyId}: ${String(error).slice(0, 120)}`);
  }
}
if (touched.size) await computeHotRanking();
console.log(JSON.stringify(tally));
await closeDb();
