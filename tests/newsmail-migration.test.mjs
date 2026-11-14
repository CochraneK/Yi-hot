import { test } from "node:test";
import assert from "node:assert/strict";
import { produce, reconcileMigration } from "../scripts/newsmail-migration.mjs";

const fixture = () => ({
  manifest: { schema_version: 1, source_repo: "CochraneK/NewsMail", source_revision: "a".repeat(40),
    assets: [{ path: "info_sources.md", blob_sha: "b".repeat(40), decision: "preserved", targets: ["data/snapshot.json"], reason: "keep candidates" }], source_routes: [],
    operational_gates: ["old_schedules_stopped", "private_runtime_backup_verified", "production_replacements_verified"].map((id) => ({ id, status: "unverified", reason: "requires runtime verification" })) },
  news: { rows: [{ legacy_id: "old:1", name: "Different publisher", url: "https://shared.example/", source_line: 1 }] },
  sources: [{ id: "current", kind: "web_list", enabled: false, config: { url: "https://shared.example/news" } }],
});

test("a shared hostname suggests review and never closes a migration or enables a source", () => {
  const r = reconcileMigration(fixture());
  assert.deepEqual(r.candidates[0].host_hints, ["current"]);
  assert.equal(r.candidates[0].status, "retained_for_review");
  assert.equal(r.candidates[0].collection_authorized_by_audit, false);
  assert.equal(r.retirement.ready, false);
});

test("explicit replacement keeps seed and runtime states distinct", () => {
  const f = fixture();
  f.manifest.source_routes.push({ legacy_ids: ["old:1"], target_ids: ["current"], reason: "reviewed code route" });
  const r = reconcileMigration(f);
  assert.equal(r.stats.retained_for_review, 0);
  assert.equal(r.candidates[0].targets[0].seed_enabled, false);
  assert.equal(r.candidates[0].production_status, "unverified");
  assert.equal(r.retirement.ready, false, "code replacement cannot prove old jobs stopped");
});

test("stale targets, duplicate decisions and invented candidate IDs fail closed", () => {
  const f = fixture();
  f.manifest.source_routes.push({ legacy_ids: ["old:1"], target_ids: ["missing"], reason: "route" });
  assert.throws(() => reconcileMigration(f), /missing target source/);
  f.manifest.source_routes[0].target_ids = ["current"];
  f.manifest.source_routes.push(f.manifest.source_routes[0]);
  assert.throws(() => reconcileMigration(f), /duplicate route/);
  f.manifest.source_routes.pop();
  f.manifest.source_routes[0].legacy_ids = ["invented"];
  assert.throws(() => reconcileMigration(f), /unknown legacy/);
  assert.throws(() => reconcileMigration({ ...fixture(), exists: () => false }), /missing replacement/);
});

test("offline flags cannot certify runtime evidence or remove mandatory gates", () => {
  const f = fixture();
  f.manifest.operational_gates[0].status = "verified";
  assert.throws(() => reconcileMigration(f), /external evidence/);
  f.manifest.operational_gates = [];
  assert.throws(() => reconcileMigration(f), /missing gate/);
});

test("the real 99-row inventory is preserved individually with pinned upstream file hashes", () => {
  const r = produce();
  assert.equal(r.stats.assets, 14);
  assert.equal(r.stats.candidates, 99);
  assert.equal(r.stats.replacement_in_code, 5);
  assert.equal(r.stats.retained_for_review, 94);
  const copies = r.candidates.filter((x) => ["newsmail:015", "newsmail:049"].includes(x.legacy_id));
  assert.equal(copies.length, 2);
  assert.deepEqual(copies[0].targets, copies[1].targets);
  assert.equal(r.retirement.ready, false);
  assert.equal(r.retirement.blockers.length, 3, "preserved source backlog does not require retaining a second runtime");
});
