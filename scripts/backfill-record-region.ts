// 一次性回填：把既有 regulatory_records 的自由文本 region 归一成 region_province / region_city。
// 归一化逻辑见 packages/backend/src/records/region.ts（含脏数据清洗）。重跑安全、幂等。
import { closeDb, sql } from "@aihot/backend/db";
import { normalizeRegion } from "@aihot/backend/records/region";

const rows = await sql<{ id: string; region: string | null }[]>`
  SELECT id::text AS id, region FROM regulatory_records`;

let updated = 0;
await sql.begin(async (tx) => {
  for (const r of rows) {
    const { province, city } = normalizeRegion(r.region);
    const res = await tx`
      UPDATE regulatory_records
      SET region_province = ${province}, region_city = ${city}
      WHERE id = ${r.id}
        AND (region_province IS DISTINCT FROM ${province} OR region_city IS DISTINCT FROM ${city})`;
    if (res.count) updated += 1;
  }
});

console.log(JSON.stringify({ scanned: rows.length, updated }));
await closeDb();
