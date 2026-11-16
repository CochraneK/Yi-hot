// Aligns already-registered place names with the current gazetteer.
//
// The first build took Chinese names from an unordered alias column, so a few
// rows were registered under a sub-place name (宝安 for 深圳, 天府 for 成都,
// 玉山 for 昆山). The ids and coordinates were right; only the label was wrong.
// This rewrites the label from the rebuilt gazetteer and touches nothing else —
// no candidate, no verification state, no coordinates.
import { readFileSync } from "node:fs";
import path from "node:path";
import { closeDb, sql } from "@aihot/backend/db";
import { REPO_ROOT } from "@aihot/backend/config";

interface Entry { id: string; name: string }

const apply = process.argv.includes("--apply");
const gazetteer = JSON.parse(readFileSync(path.join(REPO_ROOT, "industry/geo/gazetteer.json"), "utf8")) as { places: Entry[] };
const byId = new Map(gazetteer.places.map(place => [place.id, place]));

try {
  const rows = await sql<{ id: string; name: string }[]>`SELECT id, name FROM geo_places ORDER BY id`;
  const changes = rows
    .map(row => ({ id: row.id, from: row.name, to: byId.get(row.id)?.name ?? null }))
    .filter(row => row.to && row.to !== row.from);

  if (apply) {
    for (const change of changes) {
      await sql`UPDATE geo_places SET name = ${change.to!}, city = ${change.to!} WHERE id = ${change.id}`;
    }
  }
  console.log(JSON.stringify({
    mode: apply ? "apply" : "preview",
    registered: rows.length,
    unchanged: rows.length - changes.length,
    renamed: changes.length,
    sample: changes.slice(0, 15),
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
