// 回填历史模型调用的钱。
//
// providers/llm.ts 以前把 cost 写死成 null，于是模型调用（站点上唯一真花钱的一项）在
// receipt_attempts 上一分钱都没有：三天六千多次调用全是 NULL。修好写入之后，历史那些行
// 依然空着 —— 汇总页（admin/usage.ts）是从价格表重算的，所以那里的数字一直是对的，
// 但 per-attempt 的 cost 列、以及任何按调用查钱的口径看不到历史。
//
// 这里用与调用当时同一份计价实现（providers/pricing.ts）按 `started_at` 判断高峰/空闲重算一遍，
// 所以价格表被修正后重跑即可刷新。只补 NULL，不覆盖已有值。
//
// node --env-file-if-exists=/app/.env scripts/backfill-llm-cost.ts [limit] [--dry]
import { closeDb, sql } from "@aihot/backend/db";
import { costOf, loadPrices, priceFor, tokenCostOf, isPeakBeijing } from "@aihot/backend/providers/pricing";

const limit = Number(process.argv[2] ?? "5000");
const dry = process.argv.includes("--dry");

interface Row {
  id: string;
  service: string;
  model: string | null;
  started_at: Date;
  usage: Record<string, unknown> | null;
}

const rows = await sql<Row[]>`
  SELECT id, service, model, started_at, usage
  FROM receipt_attempts
  WHERE cost IS NULL AND status = 'received' AND usage IS NOT NULL
  ORDER BY id DESC
  LIMIT ${limit}`;

const prices = await loadPrices();
let priced = 0;
let unpriced = 0;
let amount = 0;
const missing = new Map<string, number>();
for (const r of rows) {
  const row = priceFor(r.service, r.model, isPeakBeijing(r.started_at), prices);
  const cost = costOf(tokenCostOf(r.usage), 1, row);
  if (!cost) {
    unpriced += 1;
    const key = `${r.service}/${r.model ?? "-"}`;
    missing.set(key, (missing.get(key) ?? 0) + 1);
    continue;
  }
  if (!dry) {
    await sql`
      UPDATE receipt_attempts
      SET cost = ${cost.amount}, currency = ${cost.currency}, cost_basis = 'estimated'
      WHERE id = ${r.id} AND cost IS NULL`;
  }
  priced += 1;
  amount += cost.amount;
}
console.log(JSON.stringify({
  scanned: rows.length,
  priced,
  unpriced,
  amount: Number(amount.toFixed(4)),
  currency: "CNY",
  dry,
  // 价格表里缺行、所以算不出钱的 (service/model) —— 这些是要补价格行的，不是 0 元。
  missingPriceRows: [...missing.entries()].map(([key, calls]) => ({ key, calls })),
}));
await closeDb();
