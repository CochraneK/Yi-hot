// Drains the remaining geo backfill without re-reading what is already done.
//
// The one-shot script takes a batch and hands back a cursor, but a run that was
// killed mid-way leaves holes anywhere in the id range (measured 2026-11-16: the
// 1,448 missing analyses were spread from id 589 to 29,751). Rescanning the whole
// range would re-read ~4,700 finished analyses at ~40/minute, so this drives the
// same code with --missing-only and advances the cursor per batch: every batch
// therefore contains new work, and the run is safe to stop and restart.
import { closeDb } from "@aihot/backend/db";
import { backfillSavedGeoCandidates } from "@aihot/backend/admin/geo-backfill";

const args = process.argv.slice(2);
const valid = args.every(a => a === "--apply" || /^--after=\d+$/.test(a) || /^--batches=\d+$/.test(a));
const option = (key: string) => args.find(x => x.startsWith(key))?.slice(key.length);

try {
  if (!valid) throw Error("Usage: node scripts/geo-backfill-drain.ts [--after=0] [--batches=200] [--apply]. Default: preview.");
  const apply = args.includes("--apply");
  const maxBatches = Number(option("--batches=") ?? 200);
  let after = Number(option("--after=") ?? 0);
  const total = { batches: 0, analyses: 0, inserted: 0, rejected: 0, skippedChanged: 0 };

  for (let i = 1; i <= maxBatches; i++) {
    const r = await backfillSavedGeoCandidates({ afterId: after, limit: 200, apply, missingOnly: true });
    total.batches = i;
    total.analyses += r.scanned;
    total.inserted += r.inserted;
    total.rejected += r.rejected;
    total.skippedChanged += r.skippedChanged;
    console.log(`batch ${i}: scanned=${r.scanned} inserted=${r.inserted} rejected=${r.rejected} skippedChanged=${r.skippedChanged} last=${r.lastAnalysisId}`);
    // Nothing left in range, or this was the final short page.
    if (r.scanned === 0 || !r.morePossible) break;
    after = r.lastAnalysisId;
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "preview", ...total }));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
