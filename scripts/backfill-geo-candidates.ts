// Recover saved AI location hints without paying for another analysis.
// Dry-run by default; --apply only creates PENDING candidates, never approvals.
import { closeDb } from "@aihot/backend/db";
import { backfillSavedGeoCandidates } from "@aihot/backend/admin/geo-backfill";

const args = process.argv.slice(2);
const valid = args.every(a => a === "--apply" || a === "--missing-only" || /^--after=\d+$/.test(a) || /^--limit=\d+$/.test(a));
const option = (key: string) => args.find(x => x.startsWith(key))?.slice(key.length);
try {
  if (!valid || args.some((x, i) => args.indexOf(x) !== i)) {
    throw Error("Usage: node scripts/backfill-geo-candidates.ts [--after=0] [--limit=100] [--missing-only] [--apply]. Default: dry-run.");
  }
  const result = await backfillSavedGeoCandidates({
    afterId: Number(option("--after=") ?? 0),
    limit: Number(option("--limit=") ?? 100),
    apply: args.includes("--apply"),
    missingOnly: args.includes("--missing-only"),
  });
  console.log(JSON.stringify(result, null, 2));
  console.log("For a next batch, use --after=" + result.lastAnalysisId + "; no model calls were made.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
