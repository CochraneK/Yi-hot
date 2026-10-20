// Import parser-verified public sources (from charity-intelligence's channel probe) into Yi-Hot.
//
// The configs have already been checked against Yi-Hot's own web_list parser; this script only
// re-asserts the config contract, refuses duplicates, and (optionally) switches the new rows on.
//
//   node --env-file=.env scripts/import-approved-sources.mjs <approved.json> --dry-run
//   node --env-file=.env scripts/import-approved-sources.mjs <approved.json>
//   node --env-file=.env scripts/import-approved-sources.mjs <approved.json> --enable
//
// Without --enable the rows land paused (enabled=false, health='paused', next_fetch_at=NULL), the same
// default the admin "new source" form uses. --enable is the explicit editorial decision to collect.
import { readFileSync } from "node:fs";
import { assertSupportedConfig } from "@aihot/backend/sources/config-keys";
import { createSource } from "@aihot/backend/admin/sources";
import { closeDb, sql } from "@aihot/backend/db";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const enable = args.includes("--enable");
const actor = "script:import-approved-sources";

if (!file) {
  console.error("用法：node --env-file=.env scripts/import-approved-sources.mjs <approved.json> [--dry-run] [--enable]");
  process.exit(1);
}

const payload = JSON.parse(readFileSync(file, "utf8"));
const rows = Array.isArray(payload) ? payload : payload.sources;
if (!Array.isArray(rows) || !rows.length) {
  console.error("清单里没有 sources");
  process.exit(1);
}

const CREATE_FIELDS = ["id", "name", "kind", "config", "tier", "participation_mode", "interval_minutes", "first_party", "tags", "site_fulltext", "syndicate_fulltext"];

let created = 0;
let duplicated = 0;
let rejected = 0;
const createdIds = [];

for (const row of rows) {
  const input = Object.fromEntries(CREATE_FIELDS.filter((k) => row[k] !== undefined).map((k) => [k, row[k]]));
  try {
    // Refuse a config Yi-Hot would silently ignore (e.g. a selector the collector does not implement).
    assertSupportedConfig(input.kind, input.config);
  } catch (err) {
    rejected += 1;
    console.log(`  ✗ ${row.name}：${err.message}`);
    continue;
  }
  if (dryRun) {
    console.log(`  · ${row.id}  ${row.name}  ${input.config.url}`);
    created += 1;
    continue;
  }
  try {
    const result = await createSource(input, actor);
    if (result.created) {
      created += 1;
      createdIds.push(row.id);
      console.log(`  + ${row.id}  ${row.name}`);
    } else {
      duplicated += 1;
      console.log(`  = ${row.name}：已存在同地址信源 ${result.duplicate?.id ?? ""}`);
    }
  } catch (err) {
    rejected += 1;
    console.log(`  ✗ ${row.name}：${err.message}`);
  }
}

if (!dryRun && enable && createdIds.length) {
  // Explicit editorial switch-on: without next_fetch_at the worker would not pick these up.
  await sql`
    UPDATE sources
       SET enabled = true, health = 'unknown', fail_count = 0,
           next_fetch_at = now(), last_error = NULL, updated_at = now()
     WHERE id = ANY(${createdIds})`;
  console.log(`已启用 ${createdIds.length} 条，下一轮 worker 会立即抓取`);
}

console.log(`\n新建 ${created} 条，重复 ${duplicated} 条，被拒 ${rejected} 条${dryRun ? "（dry-run，未写库）" : ""}`);
if (!dryRun) await closeDb();
process.exit(rejected ? 2 : 0);
