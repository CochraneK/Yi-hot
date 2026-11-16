// Offline reuse of saved geography JSON. Every candidate remains pending; no provider is invoked.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { tag } from "./setup.ts";
import { sql, closeDb } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import { backfillSavedGeoCandidates, validateGeoBackfillOptions } from "@aihot/backend/admin/geo-backfill";
import { stopBoss } from "@aihot/backend/jobs/queue";

const T = tag();
const SOURCE = `geo-backfill-test-${T}`;
let articleId = "";
let analysisId = 0;

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at)
    VALUES (${SOURCE}, 'Geo backfill test', 'rss', 'T1', 'editorial', '2100-01-01')`;
  const material = await upsertMaterial({
    sourceId: SOURCE, url: `https://example.org/backfill-${T}`,
    title: "北京机构在成都开展儿童服务活动",
    bodyText: "北京机构在成都开展儿童服务活动，持续帮助当地家庭。",
    bodyStatus: "ok", via: "fetch", publishedAt: new Date(),
  });
  articleId = material.articleId;
  const [article] = await sql<{ revision: number }[]>`SELECT revision FROM articles WHERE id = ${articleId}`;
  const [analysis] = await sql<{ id: number }[]>`INSERT INTO analyses
    (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, score, selected, output)
    VALUES (${articleId}, ${article!.revision}, 'replay', 'pass', 'project', '儿童服务项目', '项目在成都开展。', 60, false,
      ${sql.json({ geography: { status: "candidate", origin: "structure", receiptId: 1,
        candidates: [
          { place: "成都", role: "event", evidence: "在成都开展儿童服务活动" },
          { place: "北京", role: "publisher", evidence: "北京机构" },
          { place: "火星", role: "event", evidence: "在火星开展儿童服务活动" },
        ],
      } } as never)})
    RETURNING id`;
  analysisId = analysis!.id;
  await publishArticle(articleId);
});

after(async () => {
  await stopBoss();
  await closeDb();
});

test("dry run never writes, apply creates pending and is idempotent", async () => {
  const args = { afterId: analysisId - 1, limit: 10 };
  const beforeReceipts = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM receipts`;
  const preview = await backfillSavedGeoCandidates(args);
  assert.deepEqual([preview.mode, preview.scanned, preview.grounded, preview.inserted, preview.rejected],
    ["preview", 1, 2, 0, 1]);
  assert.equal((await sql`SELECT 1 FROM geo_candidates WHERE analysis_id = ${analysisId}`).length, 0);
  const applied = await backfillSavedGeoCandidates({ ...args, apply: true });
  assert.deepEqual([applied.mode, applied.inserted, applied.lastAnalysisId], ["apply", 2, analysisId]);
  const stored = await sql<{ place_text: string; role: string; review_status: string }[]>`
    SELECT place_text, role, review_status FROM geo_candidates WHERE analysis_id = ${analysisId} ORDER BY id`;
  assert.deepEqual(stored.map(x => [x.place_text, x.role, x.review_status]),
    [["成都", "event", "pending"], ["北京", "publisher", "pending"]]);
  const replay = await backfillSavedGeoCandidates({ ...args, apply: true });
  assert.equal(replay.inserted, 0, "rerunning with the same cursor never duplicates rows");
  const hole = await backfillSavedGeoCandidates({ ...args, limit: 1, missingOnly: true });
  assert.equal(hole.scanned, 0, "missing-only skips an analysis that already has candidates");
  assert.equal((await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM receipts`)[0]!.n, beforeReceipts[0]!.n,
    "no new paid model receipts");
});

test("stale article versions are excluded from saved-output replay", async () => {
  await sql`UPDATE articles SET revision = revision + 1 WHERE id = ${articleId}`;
  await publishArticle(articleId);
  const result = await backfillSavedGeoCandidates({ afterId: analysisId - 1, limit: 10, apply: true });
  assert.equal(result.scanned, 0);
});

test("backfill limits fail closed rather than causing accidental full-table work", () => {
  assert.throws(() => validateGeoBackfillOptions({ afterId: -1 }), /afterId/);
  assert.throws(() => validateGeoBackfillOptions({ limit: 0 }), /limit/);
  assert.throws(() => validateGeoBackfillOptions({ limit: 99999 }), /limit/);
  assert.deepEqual(validateGeoBackfillOptions({}), { afterId: 0, limit: 100, apply: false, missingOnly: false });
});
