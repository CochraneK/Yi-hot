// Runs the strict auto-approval pass over pending location candidates.
//
// Dry-run by default. It only ever approves; anything it cannot decide stays
// pending, so the public map shows strictly fewer places than the model hinted.
// Rows it looked at are stamped (auto_reviewed_at) so the hourly pass advances
// instead of re-reading the head of the queue — clear the stamps with
// --reset-scan --apply after the gazetteer changes.
import { closeDb, sql } from "@aihot/backend/db";
import { autoApprovePending } from "@aihot/backend/editorial/geo-auto-review";

const args = process.argv.slice(2);
const valid = args.every(a => a === "--apply" || a === "--reset-scan" || /^--after=\d+$/.test(a) || /^--limit=\d+$/.test(a));
const option = (key: string) => args.find(x => x.startsWith(key))?.slice(key.length);

try {
  if (!valid) {
    throw Error("Usage: node scripts/geo-auto-approve.ts [--limit=200] [--after=<candidateId>] [--apply] | --reset-scan --apply. Default: dry-run.");
  }
  if (args.includes("--reset-scan")) {
    if (!args.includes("--apply")) throw Error("--reset-scan needs --apply: it clears the scan stamps for the whole table.");
    const cleared = await sql<{ id: number }[]>`UPDATE geo_candidates SET auto_reviewed_at = NULL WHERE auto_reviewed_at IS NOT NULL RETURNING id`;
    console.log(JSON.stringify({ resetScan: cleared.length }, null, 2));
  } else {
    const summary = await autoApprovePending({
      limit: Number(option("--limit=") ?? 200),
      afterId: Number(option("--after=") ?? 0),
      apply: args.includes("--apply"),
    });
    console.log(JSON.stringify(summary, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
