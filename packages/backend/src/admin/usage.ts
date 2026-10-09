// Admin "用量与成本": how many tokens the site's model calls burned and what that cost,
// broken down by day and by purpose.
//
// Source of truth: every live model call stores its usage on `receipt_attempts`
// (`usage->>'prompt_tokens'` / `usage->>'completion_tokens'`). Money is *estimated* from the
// operator-entered unit prices in `service_prices`; a figure is only "actual" when the provider
// itself reported a charge (`cost_basis = 'actual'`). Days are Beijing calendar days.
//
// The price lookup mirrors admin/models.ts on purpose: a price row is matched by
// (service, model), where `service` is resolved from the MODELS registry, and a row with an empty
// model acts as that service's catch-all. A model name that is not in the registry gets no price —
// that is the usual reason a figure shows as "未定价".
import { sql } from "../db.ts";
import { MODELS } from "../providers/llm.ts";

interface PriceRow {
  service: string;
  model: string;
  currency: string;
  input_per_mtok: string | null;
  cached_per_mtok: string | null;
  output_per_mtok: string | null;
  source_url: string | null;
  verified_on: string | null;
}

interface DayModelRow {
  day: string;
  model: string | null;
  calls: number;
  tokens_in: string | null;
  tokens_out: string | null;
}

interface PurposeRow extends DayModelRow {
  purpose: string;
}

const BJ_MS = 8 * 3600_000;

const serviceOf = (model: string | null): string | null =>
  model === null ? null : (Object.values(MODELS).find((m) => m.model === model || m.key === model)?.service ?? null);

const priceFor = (model: string | null, prices: PriceRow[]): PriceRow | null => {
  const service = serviceOf(model);
  if (service === null) return null;
  return prices.find((p) => p.service === service && p.model === model) ?? prices.find((p) => p.service === service && p.model === "") ?? null;
};

const costOf = (tokensIn: number, tokensOut: number, p: PriceRow | null): { amount: number; currency: string } | null =>
  !p || (!p.input_per_mtok && !p.output_per_mtok)
    ? null
    : { amount: (tokensIn / 1e6) * Number(p.input_per_mtok ?? 0) + (tokensOut / 1e6) * Number(p.output_per_mtok ?? 0), currency: p.currency };

/** The last `days` Beijing calendar days as `YYYY-MM-DD` keys, oldest first. */
function dayKeys(days: number): string[] {
  const now = Date.now();
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) keys.push(new Date(now - i * 86400_000 + BJ_MS).toISOString().slice(0, 10));
  return keys;
}

export async function usageOverview(days = 30) {
  const d = Math.min(365, Math.max(1, Math.floor(days)));
  const since = new Date(Date.now() - d * 86400_000);
  const [byDay, byPurpose, prices, lifetime] = await Promise.all([
    sql<DayModelRow[]>`
      SELECT to_char(a.started_at + interval '8 hours', 'YYYY-MM-DD') AS day, a.model,
             count(*)::int AS calls,
             sum((a.usage->>'prompt_tokens')::bigint) AS tokens_in,
             sum((a.usage->>'completion_tokens')::bigint) AS tokens_out
      FROM receipt_attempts a
      WHERE a.started_at >= ${since} AND a.origin = 'live' AND a.usage IS NOT NULL
      GROUP BY 1, 2 ORDER BY 1`,
    sql<PurposeRow[]>`
      SELECT r.purpose, a.model, to_char(a.started_at + interval '8 hours', 'YYYY-MM-DD') AS day,
             count(*)::int AS calls,
             sum((a.usage->>'prompt_tokens')::bigint) AS tokens_in,
             sum((a.usage->>'completion_tokens')::bigint) AS tokens_out
      FROM receipt_attempts a JOIN receipts r ON r.id = a.receipt_id
      WHERE a.started_at >= ${since} AND a.origin = 'live' AND a.usage IS NOT NULL
      GROUP BY 1, 2, 3`,
    sql<PriceRow[]>`
      SELECT service, model, currency, input_per_mtok, cached_per_mtok, output_per_mtok, source_url, verified_on
      FROM service_prices ORDER BY service, model`,
    sql<{ calls: number; tokens_in: string | null; tokens_out: string | null; first: Date | null }[]>`
      SELECT count(*)::int AS calls, sum((usage->>'prompt_tokens')::bigint) AS tokens_in,
             sum((usage->>'completion_tokens')::bigint) AS tokens_out, min(started_at) AS first
      FROM receipt_attempts WHERE origin = 'live' AND usage IS NOT NULL`,
  ]);

  const keys = dayKeys(d);
  const buckets = new Map(keys.map((k) => [k, { calls: 0, tokensIn: 0, tokensOut: 0, amount: 0, currency: "USD" as string, priced: false }]));

  for (const row of byDay) {
    const b = buckets.get(row.day);
    if (!b) continue;
    const tokensIn = Number(row.tokens_in ?? 0);
    const tokensOut = Number(row.tokens_out ?? 0);
    const c = costOf(tokensIn, tokensOut, priceFor(row.model, prices));
    b.calls += row.calls;
    b.tokensIn += tokensIn;
    b.tokensOut += tokensOut;
    if (c) {
      b.amount += c.amount;
      b.currency = c.currency;
      b.priced = true;
    }
  }

  // Purpose × model, so the money column is priced with the right model's rate.
  const purposes = new Map<string, { purpose: string; model: string | null; calls: number; tokensIn: number; tokensOut: number; amount: number; currency: string; priced: boolean }>();
  for (const row of byPurpose) {
    const key = `${row.purpose}|${row.model ?? ""}`;
    const p = purposes.get(key) ?? { purpose: row.purpose, model: row.model, calls: 0, tokensIn: 0, tokensOut: 0, amount: 0, currency: "USD", priced: false };
    const tokensIn = Number(row.tokens_in ?? 0);
    const tokensOut = Number(row.tokens_out ?? 0);
    const c = costOf(tokensIn, tokensOut, priceFor(row.model, prices));
    p.calls += row.calls;
    p.tokensIn += tokensIn;
    p.tokensOut += tokensOut;
    if (c) {
      p.amount += c.amount;
      p.currency = c.currency;
      p.priced = true;
    }
    purposes.set(key, p);
  }

  const daily = keys.map((k) => {
    const b = buckets.get(k)!;
    return { day: k, label: k.slice(5), calls: b.calls, tokensIn: b.tokensIn, tokensOut: b.tokensOut, amount: b.priced ? b.amount : null, currency: b.currency, priced: b.priced };
  });

  const totals = daily.reduce(
    (a, x) => ({ calls: a.calls + x.calls, tokensIn: a.tokensIn + x.tokensIn, tokensOut: a.tokensOut + x.tokensOut, amount: a.amount + (x.amount ?? 0) }),
    { calls: 0, tokensIn: 0, tokensOut: 0, amount: 0 },
  );
  const window = daily.filter((x) => x.calls > 0);
  const activeDays = window.length;
  const currency = daily.find((x) => x.priced)?.currency ?? prices[0]?.currency ?? "USD";
  const lifetimeCost = costOf(Number(lifetime[0]?.tokens_in ?? 0), Number(lifetime[0]?.tokens_out ?? 0), prices.find((p) => p.model !== "") ?? null);

  // Run rate: the trailing week is a far better basis than "average over active days", which the
  // one-off first backfill (and holiday lulls) skew badly. Quoting the basis keeps it honest.
  const recentDays = Math.min(7, d);
  const recent = daily.slice(-recentDays);
  const recentTotals = recent.reduce(
    (a, x) => ({ calls: a.calls + x.calls, tokensIn: a.tokensIn + x.tokensIn, tokensOut: a.tokensOut + x.tokensOut, amount: a.amount + (x.amount ?? 0) }),
    { calls: 0, tokensIn: 0, tokensOut: 0, amount: 0 },
  );
  const recentAmount = recentTotals.amount || null;
  const perDayRecent = recentAmount === null ? null : recentAmount / recentDays;

  return {
    days: d,
    currency,
    priced: prices.length > 0,
    prices,
    daily,
    purposes: [...purposes.values()].sort((a, b) => b.tokensIn + b.tokensOut - (a.tokensIn + a.tokensOut)),
    totals: { ...totals, amount: totals.amount || null },
    averages: {
      callsPerDay: activeDays ? Math.round(totals.calls / activeDays) : 0,
      tokensPerCall: totals.calls ? Math.round((totals.tokensIn + totals.tokensOut) / totals.calls) : 0,
    },
    activeDays,
    recent: { days: recentDays, ...recentTotals, amount: recentAmount, perDay: perDayRecent },
    // Monthly projection = trailing-week daily average × 30. The first-ever backfill is excluded by
    // construction only when it falls outside the trailing week; holiday weeks read low.
    projection: perDayRecent === null ? null : { amount: perDayRecent * 30, currency, basisDays: recentDays },
    lifetime: {
      calls: lifetime[0]?.calls ?? 0,
      tokensIn: Number(lifetime[0]?.tokens_in ?? 0),
      tokensOut: Number(lifetime[0]?.tokens_out ?? 0),
      first: lifetime[0]?.first ?? null,
      amount: lifetimeCost?.amount ?? null,
    },
  };
}
