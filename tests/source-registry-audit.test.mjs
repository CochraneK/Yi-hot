import assert from "node:assert/strict";
import { test } from "node:test";
import { exportCsv, hostOf, markdown, produce, reconcile, urlKey } from "../scripts/source-registry-audit.mjs";

test("host/URL normalization is conservative", () => {
  assert.equal(hostOf("https://www.example.org/a"), "example.org");
  assert.equal(hostOf("not-an-url"), null);
  assert.equal(urlKey("https://www.example.org/a/#fragment"), urlKey("https://example.org/a"));
  assert.notEqual(urlKey("https://example.org/news"), urlKey("https://example.org/press"));
  assert.notEqual(urlKey("https://example.org/feed?format=rss"), urlKey("https://example.org/feed?format=atom"));
});

test("the 2026-10-08 three-repo inventory has a reproducible baseline", () => {
  const out = produce();
  assert.equal(out.stats.seed_rows, 16);
  assert.equal(out.stats.newsmail_rows, 99);
  assert.equal(out.stats.newsmail_url_rows, 82);
  assert.equal(out.stats.discovery_only_rows, 17);
  assert.equal(out.stats.newsmail_unique_hosts, 67);
  assert.equal(out.stats.charity_registry_rows, 101);
  assert.equal(out.stats.seed_host_overlap_rows, 10);
  assert.deepEqual(out.stats.charity_statuses, { blocked: 6, conditional: 68, pending_retest: 27 });
  assert.equal(out.stats.newsmail_url_collision_groups, 4);
  assert.equal(out.stats.newsmail_distinct_name_conflicts, 2);
  assert.equal(out.stats.enabled_by_audit, 0);
});

test("no candidate is approved, enabled or misrepresented as verified", () => {
  const out = produce();
  for (const row of out.candidates) {
    assert.equal(row.enable_collection, false);
    assert.equal(row.approved, false);
    assert.equal(row.evidence_status, "UNVERIFIED");
    assert.ok(row.legacy_id.startsWith("newsmail:"));
    assert.ok(row.source_file.endsWith("/info_sources.md"));
    assert.ok(row.source_line > 0);
  }
});

test("same URL with different organization labels remains an unresolved conflict", () => {
  const out = produce();
  const cctf = out.url_collisions.find(x => x.normalized_url === "https://cctf.org.cn/");
  assert.ok(cctf);
  assert.deepEqual(cctf.names, ["中华少年儿童慈善救助基金会", "中国儿童少年基金会"]);
  assert.equal(cctf.review_reason, "POTENTIAL_ENTITY_CONFLICT");
  for (const row of out.candidates.filter(x => x.normalized_url === cctf.normalized_url)) {
    assert.ok(row.review_reasons.includes("POTENTIAL_ENTITY_CONFLICT"));
    assert.equal(row.enable_collection, false);
  }
});

test("source labels and host matches never imply same legal organization", () => {
  const candidate = { legacy_id: "newsmail:demo", name: "Shared homepage?", url: "https://shared.org/", kind_label: "官网" };
  const out = reconcile({
    seed: { sources: [{ id: "existing", name: "Another publisher", kind: "web_list", config: { url: "https://shared.org/news" } }] },
    news: { rows: [candidate] },
    charity: { rows: [] },
  });
  assert.equal(out.candidates[0].matching_seed_ids[0], "existing");
  assert.ok(out.candidates[0].review_reasons.includes("EXISTING_SEED_HOST_REVIEW"));
  assert.equal(out.candidates[0].approved, false);
});

test("exports have provenance and a clearly marked disabled flag", () => {
  const out = produce();
  const md = markdown(out);
  const csv = exportCsv(out);
  assert.match(md, /静态 Git 仓库快照/);
  assert.match(md, /所有新候选默认禁用/);
  assert.ok(csv.startsWith("legacy_id,name,kind_label"));
  assert.match(csv, /source_file,source_line,enable_collection/);
  assert.ok(csv.includes('"false"'));
  assert.deepEqual(produce(), out);
});
