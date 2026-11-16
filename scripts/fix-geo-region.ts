// Fills geo_places.region for rows written while toResolved() dropped it.
//
// A city's province is what lets the heat map count it into 四川, and the picker
// group it under a province. Rows written before the fix carry NULL, which left
// the province view with four dots instead of thirty. The value is derivable, so
// it is derived rather than guessed: gazetteer id first, then a name that only
// one province claims, then the prefecture a county sits in.
//
// Dry-run by default. Usage: node scripts/fix-geo-region.ts [--apply]
import { closeDb, sql } from "@aihot/backend/db";
import { gazetteerEntries } from "@aihot/backend/editorial/geo-gazetteer";

/** Overseas territories the catalogue labels in simplified Chinese, by country code. */
const SPECIAL: Record<string, string> = { HK: "中国香港", MO: "中国澳门", TW: "中国台湾" };

interface Row {
  id: string;
  name: string;
  country_code: string;
  parent_id: string | null;
}

const apply = process.argv.slice(2).includes("--apply");

const byId = new Map<string, string>();
const byName = new Map<string, Set<string>>();
for (const entry of gazetteerEntries()) {
  const province = entry.province ?? null;
  if (!province) continue;
  byId.set(entry.id, province);
  const bucket = byName.get(entry.name) ?? new Set<string>();
  bucket.add(province);
  byName.set(entry.name, bucket);
}

const rows = await sql<Row[]>`
  SELECT id, name, country_code, parent_id FROM geo_places
  WHERE coalesce(region, '') = ''
  ORDER BY country_code, name`;
const filled = await sql<{ id: string; region: string }[]>`
  SELECT id, region FROM geo_places WHERE coalesce(region, '') <> ''`;
const parentRegion = new Map(filled.map(row => [row.id, row.region]));

const plan: Array<{ id: string; name: string; region: string; via: string }> = [];
const skipped: Row[] = [];
for (const row of rows) {
  const special = SPECIAL[row.country_code];
  if (special) { plan.push({ ...row, region: special, via: "special" }); continue; }
  if (row.parent_id) {
    const inherited = parentRegion.get(row.parent_id);
    if (inherited) { plan.push({ ...row, region: inherited, via: "parent" }); continue; }
  }
  const direct = byId.get(row.id);
  if (direct) { plan.push({ ...row, region: direct, via: "id" }); continue; }
  const named = byName.get(row.name);
  // Two provinces claiming one name is exactly the case a guess gets wrong.
  if (named && named.size === 1) { plan.push({ ...row, region: [...named][0]!, via: "name" }); continue; }
  skipped.push(row);
}

const counts = plan.reduce<Record<string, number>>((all, item) => {
  all[item.via] = (all[item.via] ?? 0) + 1;
  return all;
}, {});
console.log(`blank=${rows.length} fillable=${plan.length} skipped=${skipped.length}`);
console.log("by source:", counts);
for (const item of plan.slice(0, 8)) console.log(`  ${item.name} (${item.id}) → ${item.region} [${item.via}]`);
if (skipped.length) {
  console.log("skipped:", skipped.slice(0, 10).map(row => `${row.name}/${row.country_code}`).join(", "));
}

if (!apply) {
  console.log("dry-run; pass --apply to write");
} else {
  await sql.begin(async tx => {
    for (const item of plan) {
      await tx`UPDATE geo_places SET region = ${item.region} WHERE id = ${item.id} AND coalesce(region, '') = ''`;
    }
  });
  console.log(`updated ${plan.length}`);
  const [after] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM geo_places WHERE coalesce(region, '') = ''`;
  console.log(`blank after: ${after?.n ?? 0}`);
}

await closeDb();
process.exit(0);
