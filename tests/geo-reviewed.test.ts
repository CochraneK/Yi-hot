// The public geo read path must never expose unreviewed, publisher-only, withdrawn,
// embargoed, or obsolete-revision candidates. No real models or third-party APIs.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { tag } from "./setup.ts";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import { setVisibility } from "@aihot/backend/admin/content";
import { registerGeoPlace, reviewGeoCandidate, validateGeoPlace, validateGeoReview } from "@aihot/backend/admin/geo";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { buildApp } from "../apps/api/src/app.ts";

const T = tag();
const SOURCE = `test-geo-${T}`;
const PLACE = `reviewed-${T}`;
const app = await buildApp();
let seq = 0;

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at)
    VALUES (${SOURCE}, 'Geo editorial test', 'rss', 'T1', 'editorial', '2100-01-01')`;
  await registerGeoPlace({
    id: PLACE, name: "测试城市", countryCode: "CN", region: "四川", city: "测试城市",
    lat: 30.65, lon: 104.07, precision: "city", sourceUrl: "https://example.org/catalog/geo",
  });
});

after(async () => {
  await app.close();
  await stopBoss();
  await closeDb();
});

async function makeArticle(selected = false) {
  const { articleId } = await upsertMaterial({
    sourceId: SOURCE, url: `https://example.org/story/${T}-${++seq}`,
    title: "在测试城市开展社区项目", bodyText: "在测试城市开展社区项目，志愿者参与。",
    bodyStatus: "ok", via: "fetch", publishedAt: new Date(),
  });
  const [article] = await sql<{ revision: number }[]>`SELECT revision FROM articles WHERE id = ${articleId}`;
  const [analysis] = await sql<{ id: number }[]>`INSERT INTO analyses
    (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, score, selected)
    VALUES (${articleId}, ${article!.revision}, 'rule', 'pass', 'project', '社区公益项目', '项目已按计划开展。', 70, ${selected})
    RETURNING id`;
  await publishArticle(articleId);
  return { articleId, analysisId: analysis!.id };
}

async function candidate(articleId: string, analysisId: number, role: "event" | "affected" | "publisher" | "mentioned") {
  const [r] = await sql<{ id: number }[]>`INSERT INTO geo_candidates (article_id, analysis_id, role, place_text, evidence)
    VALUES (${articleId}, ${analysisId}, ${role}, '测试城市', ${`在测试城市开展社区项目${role}`})
    RETURNING id`;
  return r!.id;
}

async function approve(id: number) {
  await reviewGeoCandidate({ id, action: "approve", placeId: PLACE, reviewer: "test-reviewer", reason: "人工逐字核对原文与发生地" });
}

async function get(place = PLACE, page = 1) {
  const res = await app.inject({ method: "GET", url: `/api/site/geo?place=${encodeURIComponent(place)}&page=${page}` });
  return { status: res.statusCode, body: JSON.parse(res.body) as { items?: Array<{ id: string }>; total?: number; page?: number } };
}

test("no approved event => no public result; verified publisher is not an event", async () => {
  const { articleId, analysisId } = await makeArticle();
  const pub = await candidate(articleId, analysisId, "publisher");
  const event = await candidate(articleId, analysisId, "event");
  assert.equal((await get()).body.total, 0, "pending event must remain private");
  await approve(pub);
  assert.equal((await get()).body.total, 0, "verified publisher is not the event site");
  await approve(event);
  assert.deepEqual((await get()).body.items?.map(x => x.id), [articleId]);
  assert.equal((await get()).body.total, 1);
  assert.deepEqual((await get(PLACE, 2)).body.items, [], "real pagination is server-side, not client filtering");

  // Undo an erroneous approval and verify the audit is append-only.
  await reviewGeoCandidate({ id: event, action: "reopen", reviewer: "test-reviewer", reason: "审核发现需要补充证据" });
  assert.equal((await get()).body.total, 0);
  const log = await sql<{ action: string }[]>`SELECT action FROM geo_review_audit WHERE candidate_id = ${event} ORDER BY id`;
  assert.deepEqual(log.map(x => x.action), ["approve", "reopen"]);
  await approve(event);
  await setVisibility(articleId, { visibility: "withdrawn", reason: "test withdrawal", version: 0 }, "test-reviewer");
  assert.equal((await get()).body.total, 0, "withdrawn article disappears immediately");
});

test("an approved but unreleased selection must never leak", async () => {
  const { articleId, analysisId } = await makeArticle(true);
  const event = await candidate(articleId, analysisId, "event");
  await approve(event);
  const [p] = await sql<{ selected: boolean; visible_after: Date | null }[]>`SELECT selected, visible_after FROM publications WHERE article_id=${articleId}`;
  assert.equal(p!.selected, true);
  assert.ok(p!.visible_after && p!.visible_after.getTime() > Date.now());
  assert.equal((await get()).body.total, 0);
  await sql`UPDATE publications SET visible_after = now() - interval '1 second' WHERE article_id = ${articleId}`;
  assert.ok((await get()).body.items?.some(x => x.id === articleId));
});

test("new article revision excludes an approved old place even if old analysis remains linked", async () => {
  const { articleId, analysisId } = await makeArticle();
  const event = await candidate(articleId, analysisId, "event");
  await approve(event);
  assert.ok((await get()).body.items?.some(x => x.id === articleId));
  await sql`UPDATE articles SET revision = revision + 1 WHERE id = ${articleId}`;
  await publishArticle(articleId);
  assert.ok(!(await get()).body.items?.some(x => x.id === articleId), "revision gate rejects obsolete evidence");
  const stale = await candidate(articleId, analysisId, "affected");
  await assert.rejects(() => approve(stale), /revision changed/);
});

test("invalid ids, malformed places and review operations are rejected", async () => {
  assert.equal((await get("invalid@location")).status, 400);
  assert.throws(() => validateGeoPlace({
    id: "strange city", name: "test", countryCode: "CN", lat: 200, lon: 120,
    precision: "city", sourceUrl: "http://insecure.example.org",
  }), /invalid place id/);
  assert.throws(() => validateGeoReview({ id: 1, action: "approve", reviewer: "test", reason: "reason" }), /place id/);
});
