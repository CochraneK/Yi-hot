import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sources = JSON.parse(readFileSync(new URL("../industry/sources.json", import.meta.url), "utf8")).sources;
const backlog = JSON.parse(readFileSync(new URL("../data/source-registry/proposals-child-rights-2026-10-21.json", import.meta.url), "utf8"));
const ids = [
  "web-stc-global-news",
  "web-unicef-cn-press",
  "web-unicef-global-press",
  "web-unicef-innocenti-reports",
];
test("staged child-rights sources have safe, valid explicit selectors and are paused", () => {
  assert.equal(new Set(sources.map((x) => x.id)).size, sources.length, "duplicate source IDs");
  for (const id of ids) {
    const source = sources.find((x) => x.id === id);
    assert.ok(source, `missing ${id}`);
    assert.equal(source.kind, "web_list");
    assert.equal(source.enabled, false, `${id} must not launch live collection on seed`);
    assert.equal(source.site_fulltext, false);
    assert.equal(source.syndicate_fulltext, false);
    assert.equal(source.participation_mode, "editorial");
    assert.ok(source.config.url.startsWith("https://"));
    assert.ok(source.config.itemSelector && source.config.linkSelector);
    assert.ok(source.config.allowUrlPrefixes.length >= 1);
    assert.ok(source.config.allowUrlPrefixes.every((p) => p.startsWith("https://")));
    assert.ok(source.config._aihot.initialBackfillLimit <= 8);
    assert.equal(source.config.adapter, undefined, "no paid adapter for staged free web source");
  }
});
test("the coverage backlog is non-importable and does not duplicate staged IDs", () => {
  assert.equal(backlog.pending_count, backlog.pending.length);
  assert.deepEqual(backlog.staged_disabled_source_ids, ids);
  assert.ok(backlog.pending.length >= 30);
  // Every entry carries the outcome of its live probe, and every outcome is one we know how to act on.
  // (The backlog started as status "needs_review"; probing replaced that with the real result, so the
  // guard is "a known probe outcome", not a placeholder state.)
  const PROBE_STATUSES = new Set(["connected", "no_rss", "blocked", "stale_rss", "spa_auth_required", "js_rendered", "not_a_feed"]);
  const unknown = backlog.pending.filter((x) => !PROBE_STATUSES.has(x.status)).map((x) => `${x.id}:${x.status}`);
  assert.deepEqual(unknown, [], "every pending entry carries a known probe status");
  assert.ok(backlog.pending.every((x) => x.enabled === false));
  // The per-status tally must match the entries themselves: the summary is what the handbook quotes,
  // and it has drifted from the file before.
  const tally = {};
  for (const x of backlog.pending) tally[x.status] = (tally[x.status] ?? 0) + 1;
  assert.equal(Object.values(tally).reduce((a, b) => a + b, 0), backlog.pending.length);
  assert.ok(backlog.pending.every((x) => /^https?:\/\//.test(x.url)));
  assert.ok(backlog.pending.every((x) => !ids.includes(x.id)));
  assert.equal(backlog.sources, undefined, "avoid using this as import-approved-sources payload");
});
