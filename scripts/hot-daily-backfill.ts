// Seeds hot_daily from the five-minute rankings still on disk.
//
// hot_rankings keeps 30 days, which is the only history that exists before the daily table started
// filling itself. This pass takes the last board of each Beijing calendar day from that window, so a
// yearly report begins a month earlier than today instead of a month later.
//
// Dry-run by default. Usage: node scripts/hot-daily-backfill.ts [--apply]
import { closeDb, sql } from "@aihot/backend/db";

const apply = process.argv.includes("--apply");
const unknownArg = process.argv.slice(2).find(a => a !== "--apply");

interface DayRow {
  day_text: string;
  computed_at: Date;
  rule_version: string;
  entries: number;
}

if (unknownArg) {
  console.error(`Unknown argument: ${unknownArg}. Usage: node scripts/hot-daily-backfill.ts [--apply]`);
  process.exitCode = 1;
} else {
  try {
    // The last board of each day, from the snapshots that are still there. The date is formatted as
    // text in the outer select so ORDER BY day still means the date, not the label.
    const candidates = await sql<DayRow[]>`
      SELECT DISTINCT ON (day) to_char(day, 'YYYY-MM-DD') AS day_text, computed_at, rule_version,
             jsonb_array_length(entries) AS entries
      FROM (
        SELECT (computed_at AT TIME ZONE 'Asia/Shanghai')::date AS day, computed_at, rule_version, entries
        FROM hot_rankings WHERE published
      ) r
      ORDER BY day, computed_at DESC`;

    const [existing] = await sql<{ days: number }[]>`SELECT count(*)::int AS days FROM hot_daily`;

    if (apply && candidates.length) {
      await sql`
        INSERT INTO hot_daily (day, computed_at, rule_version, entries, evidence)
        SELECT DISTINCT ON (day) day, computed_at, rule_version, entries, evidence
        FROM (
          SELECT (computed_at AT TIME ZONE 'Asia/Shanghai')::date AS day, computed_at, rule_version, entries, evidence
          FROM hot_rankings WHERE published
        ) r
        ORDER BY day, computed_at DESC
        ON CONFLICT (day) DO UPDATE
          SET computed_at = EXCLUDED.computed_at, rule_version = EXCLUDED.rule_version,
              entries = EXCLUDED.entries, evidence = EXCLUDED.evidence, inserted_at = now()
          WHERE hot_daily.computed_at < EXCLUDED.computed_at`;
    }

    console.log(JSON.stringify({
      apply,
      existingDays: existing?.days ?? 0,
      daysInWindow: candidates.length,
      first: candidates[0] ? { day: candidates[0].day_text, entries: candidates[0].entries, rule: candidates[0].rule_version } : null,
      last: candidates.length ? { day: candidates.at(-1)!.day_text, entries: candidates.at(-1)!.entries, rule: candidates.at(-1)!.rule_version } : null,
      emptyBoards: candidates.filter(c => c.entries === 0).map(c => c.day_text),
    }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
