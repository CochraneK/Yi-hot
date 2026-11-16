// Adds geography hints to articles analysed before the structure step asked for them.
//
// It calls only the structure step: no prefilter, no scoring, no reader-facing
// writing. Published titles, summaries, scores and publications.analysis_id are
// never touched — this is a read of the article text plus one paid call, then a
// jsonb merge into the existing analysis row.
//
// Dry-run by default. Every candidate it writes is still unverified; approval is
// the separate job in geo-auto-review.ts.
import { closeDb, sql } from "@aihot/backend/db";
import { runStructure } from "@aihot/backend/editorial/analyze";
import { loadAnalyzeInput } from "@aihot/backend/editorial/input";

const args = process.argv.slice(2);
const valid = args.every(a => a === "--apply" || /^--after=.+$/.test(a) || /^--limit=\d+$/.test(a));
const option = (key: string) => args.find(x => x.startsWith(key))?.slice(key.length);
const apply = args.includes("--apply");
const after = option("--after=") ?? "";
const limit = Math.min(Math.max(Number(option("--limit=") ?? 50), 1), 20000);

interface Row { article_id: string; analysis_id: number; revision: number }

try {
  if (!valid) throw Error("Usage: node scripts/backfill-geo-history.ts [--limit=50] [--after=<articleId>] [--apply]. Default: dry-run.");

  const rows = await sql<Row[]>`
    SELECT p.article_id, p.analysis_id, a.revision
    FROM publications p
    JOIN articles a ON a.id = p.article_id
    JOIN analyses an ON an.id = p.analysis_id
    WHERE p.visibility = 'public' AND p.eligible
      AND an.input_revision = a.revision
      AND NOT (an.output ? 'geography')
      AND p.article_id > ${after}
    ORDER BY p.article_id ASC
    LIMIT ${limit}`;

  const result = {
    mode: apply ? "apply" : "preview",
    candidates: rows.length,
    processed: 0,
    withHints: 0,
    hints: 0,
    written: 0,
    skippedChanged: 0,
    skippedNoInput: 0,
    failed: 0,
    lastArticleId: after,
    morePossible: rows.length === limit,
    failures: [] as string[],
  };

  for (const row of rows) {
    result.lastArticleId = row.article_id;
    try {
      const input = await loadAnalyzeInput(row.article_id);
      if (!input) { result.skippedNoInput += 1; continue; }
      if (input.revision !== row.revision) { result.skippedChanged += 1; continue; }
      if (!apply) { result.processed += 1; continue; }

      const structure = await runStructure(input, { attemptTag: "geo-backfill" });
      const hints = structure.geography ?? [];
      result.processed += 1;
      if (hints.length) { result.withHints += 1; result.hints += hints.length; }

      await sql.begin(async tx => {
        // The revision may have moved while the model was thinking.
        const [current] = await tx<{ revision: number }[]>`SELECT revision FROM articles WHERE id = ${row.article_id} FOR UPDATE`;
        if (!current || current.revision !== row.revision) { result.skippedChanged += 1; return; }

        await tx`UPDATE analyses
          SET output = output || ${tx.json({
            geography: { status: "candidate", origin: "structure", receiptId: structure.receiptId, backfilled: true, candidates: hints },
          } as never)}
          WHERE id = ${row.analysis_id}`;

        for (const hint of hints) {
          await tx`INSERT INTO geo_candidates (article_id, analysis_id, place_text, role, evidence)
            VALUES (${row.article_id}, ${row.analysis_id}, ${hint.place}, ${hint.role}, ${hint.evidence})
            ON CONFLICT (analysis_id, place_text, role, evidence) DO NOTHING`;
        }
        result.written += 1;
      });
    } catch (error) {
      result.failed += 1;
      if (result.failures.length < 5) result.failures.push(`${row.article_id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    // A long batch runs for hours; without a line every so often the log looks dead
    // and there is no way to tell a slow crawl from a stalled one.
    if (result.processed % 50 === 0) {
      console.error(`[geo-backfill] ${result.processed}/${rows.length} processed, ${result.withHints} with hints, ${result.hints} hints, ${result.failed} failed`);
    }
  }

  console.log(JSON.stringify(result, null, 2));
  console.log(`Next batch: --after=${result.lastArticleId}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
