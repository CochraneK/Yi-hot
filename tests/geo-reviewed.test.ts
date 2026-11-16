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

test("global map, country/region and nearby query all reviewed publications; multi-place articles count once", async () => {
  const region = `geo-${T}`;
  const places = [
    { suffix: "east", lat: 0, lon: 179.9, precision: "city" as const },
    { suffix: "west", lat: 0, lon: -179.9, precision: "city" as const },
    { suffix: "region", lat: 0, lon: 179.9, precision: "region" as const },
    { suffix: "far", lat: 30, lon: 100, precision: "city" as const },
  ];
  for (const p of places) await registerGeoPlace({ id: `nz-${T}-${p.suffix}`, name: `地点-${p.suffix}`,
    countryCode: "NZ", region, city: p.precision === "city" ? `地点-${p.suffix}` : null,
    lat: p.lat, lon: p.lon, precision: p.precision, sourceUrl: "https://example.org/places" });
  async function at(article: { articleId: string; analysisId: number }, suffix: string) {
    const [c] = await sql<{ id: number }[]>`INSERT INTO geo_candidates (article_id, analysis_id, role, place_text, evidence)
      VALUES (${article.articleId}, ${article.analysisId}, 'event', ${`地点-${suffix}`}, ${`在地点-${suffix}开展社区项目`}) RETURNING id`;
    await reviewGeoCandidate({ id: c!.id, action: "approve", placeId: `nz-${T}-${suffix}`, reviewer: "test-reviewer", reason: "核对合成原文中的事件地点" });
  }
  const multi = await makeArticle();
  await at(multi, "east"); await at(multi, "west");
  const regional = await makeArticle(); await at(regional, "region");
  const distant = await makeArticle(); await at(distant, "far");
  const pending = await makeArticle(); await candidate(pending.articleId, pending.analysisId, "event");
  const load = async (query: string) => {
    const response = await app.inject({ method: "GET", url: `/api/site/geo?${query}` });
    assert.equal(response.statusCode, 200, response.body);
    return response.json();
  };
  const scope = `country=NZ&region=${encodeURIComponent(region)}`;
  const all = await load(scope);
  assert.equal(all.total, 3);
  assert.ok(all.countries.includes("NZ"));
  assert.ok(all.regions.includes(region));
  assert.equal(all.places.length, 4);
  assert.equal(all.places.reduce((n: number, p: { count: number }) => n + p.count, 0), 4);
  assert.ok(all.catalog.some((p: { id: string }) => p.id === `nz-${T}-east`));
  const feed = all.items.find((p: { id: string }) => p.id === multi.articleId);
  assert.equal(feed.eventPlaces.length, 2);
  assert.ok(feed.eventPlaces.every((p: Record<string, unknown>) => !("evidence" in p) && !("reviewed_by" in p)));
  const near = await load(`${scope}&lat=0&lon=179.95&radius=50`);
  assert.deepEqual(near.items.map((i: { id: string }) => i.id), [multi.articleId], "dateline is handled and articles deduplicated");
  assert.equal(near.total, 1);
  assert.equal(near.places.length, 2, "region centres and distant cities are excluded");
  assert.equal((await load(`${scope}&lat=0&lon=0&radius=25`)).total, 0);
  const secondPage = await load(`${scope}&page=2`);
  assert.equal(secondPage.items.length, 0);
  assert.equal(secondPage.places.length, 4, "map counts are scoped across all pages");
  assert.ok((await load("")).items.every((i: { id: string }) => i.id !== pending.articleId));
  await setVisibility(multi.articleId, { visibility: "withdrawn", reason: "synthetic withdrawal", version: 0 }, "test-reviewer");
  const withdrawn = await load(`${scope}&lat=0&lon=179.95&radius=50`);
  assert.equal(withdrawn.total, 0);
  assert.equal(withdrawn.places.length, 0);
  assert.ok(!withdrawn.catalog.some((p: { id: string }) => p.id === `nz-${T}-east`));
  for (const query of ["country=China", "region=alone", "lat=0&lon=0&radius=1001", "lat=NaN&lon=0&radius=100", "lat=0&radius=10"])
    assert.equal((await app.inject({ method: "GET", url: `/api/site/geo?${query}` })).statusCode, 400);
});
