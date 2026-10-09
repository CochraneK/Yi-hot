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
  per_request: string | null;
  source_url: string | null;
  verified_on: string | null;
  note: string | null;
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

/**
 * Estimated money for one (tokens, calls) group. A price row may carry per-token rates, a
 * per-request rate, or both — a service that bills per call has no token rates at all, so the
 * per-request side must be applied or such a row would silently contribute nothing.
 */
const costOf = (tokensIn: number, tokensOut: number, calls: number, p: PriceRow | null): { amount: number; currency: string } | null => {
  if (!p) return null;
  const perCall = p.per_request === null ? 0 : Number(p.per_request);
  const hasTokenRates = p.input_per_mtok !== null || p.output_per_mtok !== null;
  if (!hasTokenRates && perCall === 0) return null;
  const amount = (tokensIn / 1e6) * Number(p.input_per_mtok ?? 0) + (tokensOut / 1e6) * Number(p.output_per_mtok ?? 0) + perCall * calls;
  return { amount, currency: p.currency };
};

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
  const [byDay, byPurpose, prices, lifetime, seen] = await Promise.all([
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
      SELECT service, model, currency, input_per_mtok, cached_per_mtok, output_per_mtok, per_request, source_url, verified_on, note
      FROM service_prices ORDER BY service, model`,
    sql<{ model: string | null; calls: number; tokens_in: string | null; tokens_out: string | null; first: Date | null }[]>`
      SELECT a.model, count(*)::int AS calls, sum((a.usage->>'prompt_tokens')::bigint) AS tokens_in,
             sum((a.usage->>'completion_tokens')::bigint) AS tokens_out, min(a.started_at) AS first
      FROM receipt_attempts a WHERE a.origin = 'live' AND a.usage IS NOT NULL
      GROUP BY 1`,
    // The names that actually show up in receipts, so a price row can be created against a name
    // that exists rather than one guessed from the model registry.
    sql<{ model: string | null; calls: number }[]>`
      SELECT a.model, count(*)::int AS calls
      FROM receipt_attempts a
      WHERE a.started_at >= ${since} AND a.origin = 'live'
      GROUP BY 1 ORDER BY 2 DESC`,
  ]);

  const keys = dayKeys(d);
  const buckets = new Map(keys.map((k) => [k, { calls: 0, tokensIn: 0, tokensOut: 0, amount: 0, currency: "USD" as string, priced: false }]));

  for (const row of byDay) {
    const b = buckets.get(row.day);
    if (!b) continue;
    const tokensIn = Number(row.tokens_in ?? 0);
    const tokensOut = Number(row.tokens_out ?? 0);
    const c = costOf(tokensIn, tokensOut, row.calls, priceFor(row.model, prices));
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
    const c = costOf(tokensIn, tokensOut, row.calls, priceFor(row.model, prices));
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
  // Lifetime is priced per model, not with "the first price row that has a model" — that shortcut
  // silently changes the total when an unrelated row sorts first.
  const lifeCalls = lifetime.reduce((n, r) => n + r.calls, 0);
  const lifeIn = lifetime.reduce((n, r) => n + Number(r.tokens_in ?? 0), 0);
  const lifeOut = lifetime.reduce((n, r) => n + Number(r.tokens_out ?? 0), 0);
  const lifeFirst = lifetime.reduce<Date | null>((min, r) => (r.first && (!min || r.first < min) ? r.first : min), null);
  let lifeAmount = 0;
  let lifePriced = false;
  for (const r of lifetime) {
    const c = costOf(Number(r.tokens_in ?? 0), Number(r.tokens_out ?? 0), r.calls, priceFor(r.model, prices));
    if (c) {
      lifeAmount += c.amount;
      lifePriced = true;
    }
  }

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
  // Two lenses on purpose: the calendar average is dragged down by quiet days (holidays, weekends)
  // and the active-day average back up by whatever spike happened, so neither is authoritative on
  // its own — the page shows both rather than picking one.
  const recentActive = recent.filter((x) => x.calls > 0).length;
  const perDayActive = recentActive ? recentTotals.amount / recentActive : null;

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
    recent: { days: recentDays, ...recentTotals, amount: recentAmount, perDay: perDayRecent, activeDays: recentActive, perDayActive },
    // Monthly projection = trailing-week calendar daily average × 30. Treat it as an order of
    // magnitude, not a forecast: the site's history is short and holiday weeks read low.
    projection: perDayRecent === null ? null : { amount: perDayRecent * 30, currency, basisDays: recentDays },
    projectedActive: perDayActive === null ? null : { amount: perDayActive * 30, currency, basisDays: recentDays },
    lifetime: {
      calls: lifeCalls,
      tokensIn: lifeIn,
      tokensOut: lifeOut,
      first: lifeFirst,
      amount: lifePriced ? lifeAmount : null,
    },
    // Model names that actually appear in receipts during the window, plus the service the registry
    // maps them to. A name with `service: null` is not in MODELS, so no price row can ever match it —
    // surfacing this is how the operator finds out *why* a figure reads "未定价".
    seenModels: seen.filter((r) => r.model).map((r) => ({ model: r.model as string, service: serviceOf(r.model), calls: r.calls })),
    services: [...new Set(Object.values(MODELS).map((m) => m.service))].sort(),
  };
}
