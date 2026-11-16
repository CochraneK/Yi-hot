// Runs the strict auto-approval pass over pending location candidates.
//
// Dry-run by default. It only ever approves; anything it cannot decide stays
// pending, so the public map shows strictly fewer places than the model hinted.
import { closeDb } from "@aihot/backend/db";
import { autoApprovePending } from "@aihot/backend/editorial/geo-auto-review";

const args = process.argv.slice(2);
const valid = args.every(a => a === "--apply" || /^--after=\d+$/.test(a) || /^--limit=\d+$/.test(a));
const option = (key: string) => args.find(x => x.startsWith(key))?.slice(key.length);

try {
  if (!valid) throw Error("Usage: node scripts/geo-auto-approve.ts [--limit=200] [--after=<candidateId>] [--apply]. Default: dry-run.");
  const summary = await autoApprovePending({
    limit: Number(option("--limit=") ?? 200),
    afterId: Number(option("--after=") ?? 0),
    apply: args.includes("--apply"),
  });
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
