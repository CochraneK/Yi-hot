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
  assert.ok(backlog.pending.every((x) => x.status === "needs_review" && x.enabled === false));
  assert.ok(backlog.pending.every((x) => /^https?:\/\//.test(x.url)));
  assert.ok(backlog.pending.every((x) => !ids.includes(x.id)));
  assert.equal(backlog.sources, undefined, "avoid using this as import-approved-sources payload");
});
