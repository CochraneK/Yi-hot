// Rebuild complete weekly and monthly issues from the eligible publication pool. Late imports are
// attributed to their original publication dates by the report composer.
import { parseArgs } from "node:util";
import { addDays, isoWeekRange } from "@aihot/contracts/time";
import { closeDb, sql } from "@aihot/backend/db";
import { composeMonthly, composeWeekly } from "@aihot/backend/reports/compose";

const { values } = parseArgs({
  options: {
    from: { type: "string", default: "2026-01-01" },
    through: { type: "string" },
  },
});
if (!values.through || !/^\d{4}-\d{2}-\d{2}$/.test(values.through)) {
  throw new Error("usage: node scripts/recompose-period-history.ts --from=YYYY-MM-DD --through=YYYY-MM-DD");
}

const labels = await sql<{ week: string; month: string }[]>`
  SELECT DISTINCT
    to_char(date_trunc('week', timezone('Asia/Shanghai', coalesce(published_at, timeline_at))), 'IYYY-"W"IW') AS week,
    to_char(timezone('Asia/Shanghai', coalesce(published_at, timeline_at)), 'YYYY-MM') AS month
  FROM publications
  WHERE visibility = 'public' AND eligible
    AND coalesce(published_at, timeline_at) >= ${values.from}
    AND coalesce(published_at, timeline_at) < ${values.through}
  ORDER BY week, month`;

const weeks = [...new Set(labels.map((r) => r.week))].filter((label) => {
  const range = isoWeekRange(label);
  return range && addDays(range.end, 1) <= values.through!;
});
const months = [...new Set(labels.map((r) => r.month))].filter((label) => {
  const [year, month] = label.split("-").map(Number) as [number, number];
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return next <= values.through!;
});

for (const label of weeks) console.log("weekly", await composeWeekly(label, "historical-rebuild"));
for (const label of months) console.log("monthly", await composeMonthly(label, "historical-rebuild"));
console.log(JSON.stringify({ weeks: weeks.length, months: months.length }));
await closeDb();
