import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const seed = JSON.parse(readFileSync(new URL("industry/sources.json", root), "utf8")).sources;
const backlog = JSON.parse(readFileSync(new URL("data/source-registry/opportunity-candidates-2026-11-15.json", root), "utf8"));
const stagedIds = [
  "search-opportunity-events",
  "search-opportunity-funding",
  "search-opportunity-partnership",
  "search-opportunity-policy",
  "search-opportunity-evidence",
  "rss-un-news-asia-pacific",
];

test("opportunity sources are unique, isolated and disabled by default", () => {
  assert.equal(new Set(seed.map(x => x.id)).size, seed.length);
  for (const id of stagedIds) {
    const source = seed.find(x => x.id === id);
    assert.ok(source, id);
    assert.equal(source.enabled, false, id);
    assert.equal(source.participation_mode, "isolated", id);
    assert.equal(source.site_fulltext, false, id);
    assert.equal(source.syndicate_fulltext, false, id);
    assert.ok(source.interval_minutes >= 360, id);
    assert.ok(source.config._aihot.initialBackfillLimit <= 4, id);
    assert.ok(!JSON.stringify(source).match(/apiKey|secret|bearer|cookie/i), id);
  }
});

test("dedicated searches never inherit generic news filters that drop useful opportunities", () => {
  const oldQueries = new Set(seed.filter(x => x.kind === "search" && !stagedIds.includes(x.id))
    .flatMap(x => x.config.queries || []));
  const newQueries = [];
  for (const id of stagedIds.filter(x => x.startsWith("search-"))) {
    const source = seed.find(x => x.id === id);
    assert.equal(source.kind, "search");
    assert.ok(source.config.queries.length >= 3 && source.config.queries.length <= 6);
    assert.ok(source.config.count <= 20);
    assert.ok(source.config.lookbackDays <= 7);
    assert.ok(!source.config.ingestNoiseFilter.dropMarkers.some(x =>
      /招聘|征稿|报名|培训|招募|招标|采购|资助/.test(x)), id);
    for (const q of source.config.queries) {
      assert.ok(q.length >= 8);
      assert.ok(!oldQueries.has(q), `duplicate existing query: ${q}`);
      newQueries.push(q);
    }
  }
  assert.equal(new Set(newQueries).size, newQueries.length);
  assert.equal(newQueries.length, 21);
});

test("only independently documented UN Asia-Pacific RSS is staged, never a guessed feed", () => {
  const source = seed.find(x => x.id === "rss-un-news-asia-pacific");
  assert.equal(source.kind, "rss");
  assert.equal(source.config.feedUrl,
    "https://news.un.org/feed/subscribe/en/news/region/asia-pacific/feed/rss.xml");
  assert.deepEqual(source.config.allowUrlPrefixes, ["https://news.un.org/"]);
  const elsewhere = seed.filter(x => x.id !== source.id && x.config?.feedUrl === source.config.feedUrl);
  assert.equal(elsewhere.length, 0);
});

test("opportunity backlog is review-only and cannot be passed as a seed import", () => {
  assert.equal(backlog.schema_version, 1);
  assert.equal(backlog.automatic_import, false);
  assert.equal(backlog.sources_enabled_by_this_file, 0);
  assert.equal(backlog.candidates.length, 8);
  assert.equal(new Set(backlog.candidates.map(x => x.id)).size, backlog.candidates.length);
  assert.equal(backlog.sources, undefined);
  for (const entry of backlog.candidates) {
    assert.equal(entry.enabled, false);
    assert.ok(entry.priority === "P0" || entry.priority === "P1" || entry.priority === "P2");
    assert.ok(entry.collection_status !== "approved");
    assert.ok(entry.needs.length >= 2);
    assert.ok(entry.homepage.startsWith("https://"));
    assert.ok(!seed.some(x => x.id === entry.id));
  }
  assert.ok(backlog.already_registered["web-unicef-innocenti-reports"]);
  assert.ok(backlog.already_registered["rss-gov-cn"]);
});
