// 加源窗口开关：把「一天的调用额度」临时抬高，跑完回落。
//
// 平时 llm 的额度是 1500/小时、6000/24 小时（约 ¥9–11 封顶）。批量加新源那天，首采回填会在
// 一两小时内把额度吃掉，后面的新稿就只能排队。与其临时手敲 UPDATE（容易忘、容易写错表），
// 不如用两个具名档位：
//
//   node --env-file-if-exists=/app/.env scripts/cost-window.ts            # 看现在多少、今天花了多少
//   node --env-file-if-exists=/app/.env scripts/cost-window.ts batch      # 在"已用"之上再给 6000 次
//   node --env-file-if-exists=/app/.env scripts/cost-window.ts batch 9000 # 再给 9000 次
//   node --env-file-if-exists=/app/.env scripts/cost-window.ts normal     # 回落 1500 / 6000
//
// 额度是滚动 24 小时算的：`per_day` 比的是**过去 24 小时**的调用数，不加"今天已用多少"。
// 所以批量日之后的一天，窗口里还压着昨天那批的量，直接设 6000 会把白天的稿全卡住。
// batch 档因此写成"已用 + 定额"——给的是**新增额度**，而不是一个与历史无关的绝对值。
//
// 额度开着的每一分钟都在允许更多花费，**跑完立刻回落 normal**。忘关时 status 会提醒。
//
// 注意：这里只动「调用次数上限」，不动每篇的成本。真要省钱靠 initialBackfillLimit 与避开高峰。
import { closeDb, sql } from "@aihot/backend/db";
import { isPeakBeijing } from "@aihot/backend/providers/pricing";

const NORMAL = { perHour: 1500, perDay: 6000 };
const BATCH_PER_HOUR = 3000;
const BATCH_ALLOWANCE = 6000;

const mode = (process.argv[2] ?? "status").toLowerCase();

const [before] = await sql<{ day: number }[]>`
  SELECT count(*)::int AS day FROM receipt_attempts
  WHERE service = 'llm' AND origin = 'live' AND started_at > now() - interval '24 hours'`;

const setLimits = async (perHour: number, perDay: number, note: string) => {
  await sql`UPDATE budgets SET per_hour = ${perHour}, per_day = ${perDay}, note = ${note}, updated_at = now() WHERE service = 'llm'`;
};

if (mode === "batch") {
  const allowance = Number(process.argv[3] ?? BATCH_ALLOWANCE);
  if (!Number.isFinite(allowance) || allowance <= 0) {
    console.log("用法：cost-window.ts batch [新增调用次数，默认 6000]");
    await closeDb();
    process.exit(1);
  }
  const perDay = (before?.day ?? 0) + allowance;
  await setLimits(BATCH_PER_HOUR, perDay, `加源窗口：已用 ${before?.day ?? 0} + 新增 ${allowance}`);
  console.log(`已切到加源窗口：llm ${BATCH_PER_HOUR}/小时、${perDay}/24小时（已用 ${before?.day ?? 0} + 新增 ${allowance}）`);
  console.log(`新增额度约 ${Math.floor(allowance / 5)} 篇（每篇 5 次调用），约 ¥${((allowance / 5) * 0.004).toFixed(2)}`);
  console.log("跑完批量请执行：node scripts/cost-window.ts normal（窗口滚动后才会真正落到 6000）");
} else if (mode === "normal") {
  await setLimits(NORMAL.perHour, NORMAL.perDay, "常态额度");
  console.log(`已回落常态：llm ${NORMAL.perHour}/小时、${NORMAL.perDay}/24小时`);
  if ((before?.day ?? 0) >= NORMAL.perDay) {
    console.log(`⚠️  过去 24 小时已用 ${before?.day ?? 0} 次，已超过常态上限——现在回落会卡住新稿。`);
    console.log(`   等窗口滚出这批（约 ${Math.ceil(((before?.day ?? 0) - NORMAL.perDay) / 500)} 小时后）再回落，或用 batch 顶一段。`);
  }
} else if (mode !== "status") {
  console.log("用法：cost-window.ts [status|batch [次数]|normal]");
  await closeDb();
  process.exit(1);
}

const [budget] = await sql<{ per_minute: number; per_hour: number; per_day: number; note: string | null; updated_at: Date }[]>`
  SELECT per_minute, per_hour, per_day, note, updated_at FROM budgets WHERE service = 'llm'`;

const [used] = await sql<{ hour: number; day: number; cost: number }[]>`
  SELECT count(*) FILTER (WHERE started_at > now() - interval '1 hour')::int AS hour,
         count(*)::int AS day,
         coalesce(round(sum(cost), 2), 0)::float8 AS cost
  FROM receipt_attempts
  WHERE service = 'llm' AND origin = 'live' AND started_at > now() - interval '24 hours'`;

const [today] = await sql<{ cost: number }[]>`
  SELECT coalesce(round(sum(cost), 2), 0)::float8 AS cost
  FROM receipt_attempts
  WHERE started_at > date_trunc('day', now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'`;

const left = Math.max(0, (budget?.per_day ?? 0) - (used?.day ?? 0));
console.log(`当前：${budget?.per_hour}/小时 · ${budget?.per_day}/24小时（${budget?.note ?? "无备注"}，改于 ${budget?.updated_at?.toISOString().slice(0, 16).replace("T", " ")}Z）`);
console.log(`已用（滚动 24h）：${used?.day ?? 0} 次 / ¥${used?.cost ?? 0}；今天至今 ¥${today?.cost ?? 0}`);
console.log(`剩余可分析约 ${Math.floor(left / 5)} 篇（每篇 5 次调用），约 ¥${((left / 5) * 0.004).toFixed(2)}`);

if ((budget?.per_day ?? 0) > NORMAL.perDay) {
  console.log("⚠️  额度高于常态（加源窗口开着）。跑完批量请执行：node scripts/cost-window.ts normal");
}
if (isPeakBeijing(new Date())) {
  console.log("⚠️  现在是高峰时段（工作日 9–12 / 14–18），单价 ×2。批量回填建议留到夜间或周末。");
}

await closeDb();
