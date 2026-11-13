#!/usr/bin/env node
// Offline migration reconciliation. A file/host match is never a permission or production-health check.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { hostOf, urlKey } from "./source-registry-audit.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = "data/source-registry/newsmail-migration.json";
const OUTPUT = "data/source-registry/generated/newsmail-migration.json";
const json = (p, root) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
const unique = (xs, label) => { if (new Set(xs).size !== xs.length) throw new Error(`duplicate ${label}`); };

export function reconcileMigration({ manifest, news, sources, exists = () => true }) {
  if (manifest.schema_version !== 1 || manifest.source_repo !== "CochraneK/NewsMail" || !/^[0-9a-f]{40}$/.test(manifest.source_revision)) throw new Error("invalid NewsMail provenance");
  unique(manifest.assets.map((a) => a.path), "upstream asset");
  unique(news.rows.map((r) => r.legacy_id), "candidate ID");
  unique(sources.map((s) => s.id), "source ID");
  unique(manifest.operational_gates.map((g) => g.id), "operational gate");
  for (const required of ["old_schedules_stopped", "private_runtime_backup_verified", "production_replacements_verified"]) {
    if (!manifest.operational_gates.some((g) => g.id === required)) throw new Error(`missing gate: ${required}`);
  }
  for (const a of manifest.assets) {
    if (!/^[0-9a-f]{40}$/.test(a.blob_sha) || !["preserved", "adapted", "superseded", "dropped", "retained_in_history"].includes(a.decision) || !a.reason || !a.targets.length) throw new Error(`invalid asset: ${a.path}`);
    for (const p of a.targets) if (!exists(p)) throw new Error(`missing replacement: ${p}`);
  }
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const legacyIds = new Set(news.rows.map((r) => r.legacy_id));
  const routes = new Map();
  for (const route of manifest.source_routes) {
    if (!route.reason || !route.target_ids.length || !route.legacy_ids.length) throw new Error("empty source route");
    for (const id of route.target_ids) if (!sourceById.has(id)) throw new Error(`missing target source: ${id}`);
    for (const id of route.legacy_ids) {
      if (!legacyIds.has(id)) throw new Error(`unknown legacy candidate: ${id}`);
      if (routes.has(id)) throw new Error(`duplicate route: ${id}`);
      routes.set(id, route);
    }
  }
  const rows = news.rows.map((row) => {
    const route = routes.get(row.legacy_id);
    const targets = route ? route.target_ids.map((id) => {
      const s = sourceById.get(id);
      return { id, kind: s.kind, seed_enabled: s.enabled ?? true };
    }) : [];
    const endpoint = (s) => s.config?.feedUrl ?? s.config?.url;
    return {
      legacy_id: row.legacy_id, name: row.name, source_line: row.source_line,
      status: route ? "replacement_in_code" : "retained_for_review",
      targets, reason: route?.reason ?? "历史候选保留，尚无逐条裁定；主机相同只作线索。",
      // Exact endpoint matches are still hints: they do not assert current collection rights or health.
      exact_endpoint_hints: sources.filter((s) => urlKey(row.url) && urlKey(row.url) === urlKey(endpoint(s))).map((s) => s.id),
      host_hints: sources.filter((s) => hostOf(row.url) && hostOf(row.url) === hostOf(endpoint(s))).map((s) => s.id),
      production_status: "unverified", collection_authorized_by_audit: false,
    };
  });
  const pending = rows.filter((r) => r.status === "retained_for_review").map((r) => r.legacy_id);
  // Unmapped sources remain a backlog in YiHot, so they no longer require maintaining NewsMail.
  // They need not all be enabled (or investigated) before the old runtime can retire.
  const blockers = [];
  // These checks deliberately remain blockers; this offline tool cannot verify old machines or production.
  for (const gate of manifest.operational_gates) {
    if (gate.status !== "unverified") throw new Error(`operational gate requires external evidence, not an offline flag: ${gate.id}`);
    blockers.push(`${gate.id}: ${gate.reason}`);
  }
  return {
    source_repo: manifest.source_repo, source_revision: manifest.source_revision,
    scope: "offline code inventory; no database, collection, email or archive mutation",
    stats: { assets: manifest.assets.length, candidates: rows.length, replacement_in_code: rows.length - pending.length, retained_for_review: pending.length },
    retirement: { ready: false, blockers }, assets: manifest.assets, candidates: rows,
  };
}

export function produce(root = ROOT) {
  const exists = (p) => {
    const rel = relative(root, resolve(root, p));
    return !isAbsolute(p) && rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\") && existsSync(resolve(root, p));
  };
  return reconcileMigration({ manifest: json(MANIFEST, root), news: json("data/source-registry/imports/newsmail-2026-10-08.json", root), sources: json("industry/sources.json", root).sources, exists });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? "--summary";
  if (!["--summary", "--write", "--check", "--retirement-check"].includes(mode)) throw new Error(`unknown option: ${mode}`);
  const out = produce();
  const serialized = JSON.stringify(out, null, 2) + "\n";
  if (mode === "--write") writeFileSync(resolve(ROOT, OUTPUT), serialized);
  if (mode === "--check" && readFileSync(resolve(ROOT, OUTPUT), "utf8") !== serialized) throw new Error("migration output drift: run npm run newsmail:audit");
  console.log(JSON.stringify({ ...out.stats, retirement: out.retirement }, null, 2));
  // CI checks reproducibility; operators can explicitly ask for the stricter retirement gate.
  if (mode === "--retirement-check") process.exitCode = 2;
}
