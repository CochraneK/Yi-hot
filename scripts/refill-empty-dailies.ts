// 补做「空日报」：有些期次在生成时，窗口里的内容还没有被评分精选（selected），于是当期 0 条、
// 没有头条标题，归档里只剩「公益日报 2026-09-XX」这种通用名；而空报一旦生成就不会自动重算。
// 这些内容其实都在（进了「全部动态」，也按发布日归进了周报月报），只是可见时间落在后面的日子。
//
// 本脚本按「原始发布日」重新归属这些空期（与周报月报处理迟到导入同一套规则），只碰 0 条的期次，
// 从早到晚逐期重算（早期的期次会覆盖重复内容，后期不重复登），旧内容进 report_revisions 可回滚。
// 用法：node --env-file=.env scripts/refill-empty-dailies.ts [--from=YYYY-MM-DD] [--through=YYYY-MM-DD] [--dry-run]
import { parseArgs } from "node:util";
import { closeDb, sql } from "@aihot/backend/db";
import { composeDaily } from "@aihot/backend/reports/compose";

const { values } = parseArgs({
  options: {
    from: { type: "string" },
    through: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});

const from = values.from ?? null;
const through = values.through ?? null;

const empties = await sql<{ key: string; generated_at: Date }[]>`
  SELECT key, generated_at FROM reports
  WHERE kind = 'daily' AND content->'metrics'->>'totalEvents' = '0'
    AND (${from}::text IS NULL OR key >= ${from})
    AND (${through}::text IS NULL OR key <= ${through})
  ORDER BY key`;

console.log(`empty dailies: ${empties.length}${empties.length ? ` (${empties[0]!.key} … ${empties.at(-1)!.key})` : ""}`);
if (values["dry-run"]) {
  for (const r of empties) console.log("would refill", r.key);
  await closeDb();
  process.exit(0);
}

let filled = 0;
for (const r of empties) {
  const out = await composeDaily(r.key, "refill-empty", { attribution: "published" });
  console.log(out.entries > 0 ? `refilled ${out.key}: ${out.entries} 条` : `still empty ${out.key}`);
  if (out.entries > 0) filled += 1;
}
console.log(JSON.stringify({ refilled: filled, of: empties.length }));
await closeDb();
