// Admin "用量与成本": how many tokens the site's model calls burned and what that cost,
// broken down by day and by purpose.
//
// Source of truth: every live model call stores its usage on `receipt_attempts`
// (`usage->>'prompt_tokens'` / `usage->>'completion_tokens'`). Money is *estimated* from the
// operator-entered unit prices in `service_prices`; a figure is only "actual" when the provider
// itself reported a charge (`cost_basis = 'actual'`). Days are Beijing calendar days.
//
// 价格匹配用 `receipt_attempts` 上记录的 (service, model) —— 那是调用当时的事实 —— 而不是拿
// model 名去 MODELS 注册表反查 service。反查会随注册表变动而失效：模型改名（deepseek-chat →
// deepseek-flash）后，历史行会被解析成另一个 service，价格明明在表里却永远匹配不上，整段历史
// 静默变成「未定价」。注册表只用来提示「这个名字已经不在注册表里了」。
//
// 高峰/空闲：DeepSeek 工作日 9–12、14–18（北京）按双倍计价。约定高峰价单独一行，model 名加
// `@peak` 后缀（如 `deepseek-flash@peak`）；没有这一行就退回主行，等于该服务不分时段。
//
// 缓存命中：usage 里带 `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`，命中部分按
// `cached_per_mtok` 计。命中率在站点上约六成，只按未命中价算会高估两倍以上。
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
  service: string;
  model: string | null;
  peak: boolean;
  calls: number;
  /** prompt_tokens（= 命中 + 未命中），只为展示。 */
  tokens_in: string | null;
  cache_hit: string | null;
  cache_miss: string | null;
  tokens_out: string | null;
}

interface PurposeRow extends DayModelRow {
  purpose: string;
}

/**
 * A paid provider that bills per request rather than per token (EveryInfra, Dajiala, SocialData,
 * Jina…). The distinguishing mark is `usage IS NULL`: those adapters never receive token counts,
 * and the provider's own charge lands in `receipts.cost` with `cost_basis = 'actual'`. They were
 * invisible on this page until now because every query here filtered on `usage IS NOT NULL`.
 */
interface PerCallRow {
  service: string;
  calls: number;
  failed: number;
  billed: number;
  amount: string | null;
  currency: string | null;
}

interface PerCallDayRow {
  day: string;
  service: string;
  calls: number;
  amount: string | null;
  currency: string | null;
}

const BJ_MS = 8 * 3600_000;

/**
 * 北京时间工作日 09:00–12:00、14:00–18:00 是 DeepSeek 的高峰价时段（其余时段含周末为半价）。
 * 法定节假日同样按空闲计价，这里不查节假日表：一年十来天的偏差会让金额略微高估，方向是保守的。
 */
const PEAK_SQL = sql`(extract(isodow from a.started_at + interval '8 hours') BETWEEN 1 AND 5
  AND (extract(hour from a.started_at + interval '8 hours') BETWEEN 9 AND 11
       OR extract(hour from a.started_at + interval '8 hours') BETWEEN 14 AND 17))`;

/** 该模型名是否仍在注册表里（只用于提示，不参与计价）。 */
const stillRegistered = (model: string | null): boolean =>
  model === null ? false : Object.values(MODELS).some((m) => m.model === model || m.key === model);

const priceFor = (service: string, model: string | null, peak: boolean, prices: PriceRow[]): PriceRow | null => {
  const named = model ?? "";
  const find = (m: string) => prices.find((p) => p.service === service && p.model === m) ?? null;
  // 高峰价是同一 (service, model) 的另一行，靠 `@peak` 后缀区分；没有这一行说明该服务不分时段。
  if (peak) {
    const peakRow = find(`${named}@peak`);
    if (peakRow) return peakRow;
  }
  return find(named) ?? find("");
};

interface TokenCost {
  /** 缓存命中的输入 token。 */
  hit: number;
  /** 未命中的输入 token。 */
  miss: number;
  out: number;
}

/** A price row's money for one group. Hit and miss are priced apart: one blended rate misreports by 2×. */
const costOf = (t: TokenCost, calls: number, p: PriceRow | null): { amount: number; currency: string } | null => {
  if (!p) return null;
  const perCall = p.per_request === null ? 0 : Number(p.per_request);
  const hasTokenRates = p.input_per_mtok !== null || p.cached_per_mtok !== null || p.output_per_mtok !== null;
  if (!hasTokenRates && perCall === 0) return null;
  // A row without a cache-hit rate (older rows) prices hits at the miss rate — that is what was paid.
  const hitRate = Number(p.cached_per_mtok ?? p.input_per_mtok ?? 0);
  const missRate = Number(p.input_per_mtok ?? 0);
  const outRate = Number(p.output_per_mtok ?? 0);
  const amount = (t.hit / 1e6) * hitRate + (t.miss / 1e6) * missRate + (t.out / 1e6) * outRate + perCall * calls;
  return { amount, currency: p.currency };
};

/** Token split of one aggregated row; a record without the cache fields counts as fully missed. */
const tokensOf = (r: { tokens_in: string | null; cache_hit: string | null; cache_miss: string | null; tokens_out: string | null }): TokenCost => ({
  hit: Number(r.cache_hit ?? 0),
  miss: r.cache_miss === null ? Number(r.tokens_in ?? 0) : Number(r.cache_miss),
  out: Number(r.tokens_out ?? 0),
});

/**
 * token 估算与按次实付常常来自不同币种：模型按人民币记账，EveryInfra 的回执是美元。直接把两个
 * 数字相加会得到一个既不是元也不是美元的合计数，所以按 USD_CNY_RATE 折算。没配汇率就分开如实报，
 * 不硬编码一个很快就会过时的汇率；返回 null 表示这一笔没能折进主币种。
 */
function converter(main: string): (amount: number, from: string) => number | null {
  const rate = Number(process.env.USD_CNY_RATE ?? 0);
  return (amount, from) => {
    if (from === main) return amount;
    if (!Number.isFinite(rate) || rate <= 0) return null;
    if (from === "USD" && main === "CNY") return amount * rate;
    if (from === "CNY" && main === "USD") return amount / rate;
    return null;
  };
}

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
  // Services billed by token are the registry's own. A failed model call also has `usage IS NULL`,
  // so without this exclusion a few dead LLM requests would file themselves under per-request
  // providers with a charge of zero and read as a billing problem that is not there.
  const tokenServices = [...new Set(Object.values(MODELS).map((m) => m.service))];
  const [byDay, byPurpose, prices, lifetime, seen, perCall, perCallDay, perCallLife] = await Promise.all([
    sql<DayModelRow[]>`
      SELECT to_char(a.started_at + interval '8 hours', 'YYYY-MM-DD') AS day,
             a.service, a.model, ${PEAK_SQL} AS peak,
             count(*)::int AS calls,
             sum((a.usage->>'prompt_tokens')::bigint) AS tokens_in,
             sum(coalesce((a.usage->>'prompt_cache_hit_tokens')::bigint, 0)) AS cache_hit,
             sum(CASE WHEN a.usage->>'prompt_cache_miss_tokens' IS NULL
                      THEN (a.usage->>'prompt_tokens')::bigint
                      ELSE (a.usage->>'prompt_cache_miss_tokens')::bigint END) AS cache_miss,
             sum((a.usage->>'completion_tokens')::bigint) AS tokens_out
      FROM receipt_attempts a
      WHERE a.started_at >= ${since} AND a.origin = 'live' AND a.usage IS NOT NULL
      GROUP BY 1, 2, 3, 4 ORDER BY 1`,
    sql<PurposeRow[]>`
      SELECT r.purpose, a.service, a.model, to_char(a.started_at + interval '8 hours', 'YYYY-MM-DD') AS day,
             ${PEAK_SQL} AS peak,
             count(*)::int AS calls,
             sum((a.usage->>'prompt_tokens')::bigint) AS tokens_in,
             sum(coalesce((a.usage->>'prompt_cache_hit_tokens')::bigint, 0)) AS cache_hit,
             sum(CASE WHEN a.usage->>'prompt_cache_miss_tokens' IS NULL
                      THEN (a.usage->>'prompt_tokens')::bigint
                      ELSE (a.usage->>'prompt_cache_miss_tokens')::bigint END) AS cache_miss,
             sum((a.usage->>'completion_tokens')::bigint) AS tokens_out
      FROM receipt_attempts a JOIN receipts r ON r.id = a.receipt_id
      WHERE a.started_at >= ${since} AND a.origin = 'live' AND a.usage IS NOT NULL
      GROUP BY 1, 2, 3, 4, 5`,
    sql<PriceRow[]>`
      SELECT service, model, currency, input_per_mtok, cached_per_mtok, output_per_mtok, per_request, source_url, verified_on, note
      FROM service_prices ORDER BY service, model`,
    sql<Array<DayModelRow & { first: Date | null }>>`
      SELECT a.service, a.model, ${PEAK_SQL} AS peak,
             count(*)::int AS calls,
             sum((a.usage->>'prompt_tokens')::bigint) AS tokens_in,
             sum(coalesce((a.usage->>'prompt_cache_hit_tokens')::bigint, 0)) AS cache_hit,
             sum(CASE WHEN a.usage->>'prompt_cache_miss_tokens' IS NULL
                      THEN (a.usage->>'prompt_tokens')::bigint
                      ELSE (a.usage->>'prompt_cache_miss_tokens')::bigint END) AS cache_miss,
             sum((a.usage->>'completion_tokens')::bigint) AS tokens_out,
             min(a.started_at) AS first
      FROM receipt_attempts a WHERE a.origin = 'live' AND a.usage IS NOT NULL
      GROUP BY 1, 2, 3`,
    // The (service, model) pairs that actually show up in receipts — the pair a price row must
    // match. `service` here is the one recorded at call time, not one re-derived from the registry.
    sql<{ model: string | null; service: string; calls: number }[]>`
      SELECT a.model, a.service, count(*)::int AS calls
      FROM receipt_attempts a
      WHERE a.started_at >= ${since} AND a.origin = 'live'
      GROUP BY 1, 2 ORDER BY 3 DESC`,
    // Per-request services. `sum(cost)` stays NULL when no attempt carried a charge, which is how a
    // service that was called but never billed (402, rejected key) is told apart from one that was
    // simply not used — the row still shows calls, with no amount.
    sql<PerCallRow[]>`
      SELECT a.service, count(*)::int AS calls,
             count(*) FILTER (WHERE a.status = 'failed')::int AS failed,
             count(*) FILTER (WHERE a.cost IS NOT NULL)::int AS billed,
             sum(a.cost) AS amount, max(a.currency) AS currency
      FROM receipt_attempts a
      WHERE a.started_at >= ${since} AND a.origin = 'live' AND a.usage IS NULL AND NOT (a.service = ANY(${tokenServices}))
      GROUP BY 1 ORDER BY 2 DESC`,
    sql<PerCallDayRow[]>`
      SELECT to_char(a.started_at + interval '8 hours', 'YYYY-MM-DD') AS day, a.service,
             count(*)::int AS calls, sum(a.cost) AS amount, max(a.currency) AS currency
      FROM receipt_attempts a
      WHERE a.started_at >= ${since} AND a.origin = 'live' AND a.usage IS NULL AND NOT (a.service = ANY(${tokenServices}))
      GROUP BY 1, 2`,
    sql<PerCallRow[]>`
      SELECT a.service, count(*)::int AS calls,
             count(*) FILTER (WHERE a.status = 'failed')::int AS failed,
             count(*) FILTER (WHERE a.cost IS NOT NULL)::int AS billed,
             sum(a.cost) AS amount, max(a.currency) AS currency
      FROM receipt_attempts a
      WHERE a.origin = 'live' AND a.usage IS NULL AND NOT (a.service = ANY(${tokenServices}))
      GROUP BY 1 ORDER BY 2 DESC`,
  ]);

  const keys = dayKeys(d);
  // 主币种取 token 侧价格表的币种（DeepSeek 按人民币计价）。按次实付若是别的币种，靠 USD_CNY_RATE
  // 折进来；折不动时单独报出来，绝不能把两个币种的数字加成一个。
  const mainCurrency = prices.find((p) => p.currency)?.currency ?? "CNY";
  const toMain = converter(mainCurrency);
  const buckets = new Map(keys.map((k) => [k, { calls: 0, tokensIn: 0, tokensOut: 0, amount: 0, priced: false }]));
  /** 未能折进主币种的按次实付，按币种累计（原值）。 */
  const unconverted = new Map<string, number>();

  // Per-request charges, keyed by Beijing day so they can sit on the same axis as the token
  // estimate. Kept separate from `amount` rather than summed into it: one is the provider's actual
  // debit, the other is our own arithmetic from a price table, and merging them would hide which.
  const paidByDay = new Map<string, number>();
  for (const row of perCallDay) {
    if (row.amount === null) continue;
    const currency = row.currency ?? "USD";
    const converted = toMain(Number(row.amount), currency);
    if (converted === null) {
      unconverted.set(currency, (unconverted.get(currency) ?? 0) + Number(row.amount));
      continue;
    }
    paidByDay.set(row.day, (paidByDay.get(row.day) ?? 0) + converted);
  }

  for (const row of byDay) {
    const b = buckets.get(row.day);
    if (!b) continue;
    const t = tokensOf(row);
    const c = costOf(t, row.calls, priceFor(row.service, row.model, row.peak, prices));
    b.calls += row.calls;
    b.tokensIn += t.hit + t.miss;
    b.tokensOut += t.out;
    if (c) {
      b.amount += c.amount;
      b.priced = true;
    }
  }

  // Purpose × model, so the money column is priced with the right model's rate.
  const purposes = new Map<string, { purpose: string; model: string | null; calls: number; tokensIn: number; tokensOut: number; amount: number; currency: string; priced: boolean }>();
  for (const row of byPurpose) {
    const key = `${row.purpose}|${row.model ?? ""}`;
    const p = purposes.get(key) ?? { purpose: row.purpose, model: row.model, calls: 0, tokensIn: 0, tokensOut: 0, amount: 0, currency: mainCurrency, priced: false };
    const t = tokensOf(row);
    const c = costOf(t, row.calls, priceFor(row.service, row.model, row.peak, prices));
    p.calls += row.calls;
    p.tokensIn += t.hit + t.miss;
    p.tokensOut += t.out;
    if (c) {
      p.amount += c.amount;
      p.currency = c.currency;
      p.priced = true;
    }
    purposes.set(key, p);
  }

  const daily = keys.map((k) => {
    const b = buckets.get(k)!;
    return {
      day: k,
      label: k.slice(5),
      calls: b.calls,
      tokensIn: b.tokensIn,
      tokensOut: b.tokensOut,
      amount: b.priced ? b.amount : null,
      paid: paidByDay.get(k) ?? null,
      currency: mainCurrency,
      priced: b.priced,
    };
  });

  const totals = daily.reduce(
    (a, x) => ({ calls: a.calls + x.calls, tokensIn: a.tokensIn + x.tokensIn, tokensOut: a.tokensOut + x.tokensOut, amount: a.amount + (x.amount ?? 0), paid: a.paid + (x.paid ?? 0) }),
    { calls: 0, tokensIn: 0, tokensOut: 0, amount: 0, paid: 0 },
  );

  // One row per per-request service. `unit` is the average actual charge per billed call — the
  // number to compare against the provider's advertised price when a receipt looks off. A service
  // with calls but `amount: null` was called and never charged (402, rejected key, or a run that
  // failed before the provider answered), which is a different situation from "not used".
  const perCallRows = perCall.map((r) => {
    const amount = r.amount === null ? null : Number(r.amount);
    return {
      service: r.service,
      calls: r.calls,
      failed: r.failed,
      billed: r.billed,
      unbilled: r.calls - r.billed,
      amount,
      currency: r.currency ?? "USD",
      unit: amount !== null && r.billed > 0 ? amount / r.billed : null,
    };
  });
  const apiBilled = perCallRows.reduce((n, r) => n + r.billed, 0);
  const apiCalls = perCallRows.reduce((n, r) => n + r.calls, 0);
  // 每个服务保留自己的币种（表格按行显示，行内一致所以是对的）；合计则一律折进主币种。
  let apiAmount = 0;
  let apiConverted = false;
  for (const r of perCallRows) {
    if (r.amount === null) continue;
    const converted = toMain(r.amount, r.currency);
    if (converted === null) continue;
    apiAmount += converted;
    apiConverted = true;
  }
  const window = daily.filter((x) => x.calls > 0);
  const activeDays = window.length;
  const currency = mainCurrency;
  // Lifetime is priced per (service, model, peak) row, not with "the first price row that has a
  // model" — that shortcut silently changes the total when an unrelated row sorts first.
  const lifeCalls = lifetime.reduce((n, r) => n + r.calls, 0);
  const lifeIn = lifetime.reduce((n, r) => n + Number(r.tokens_in ?? 0), 0);
  const lifeOut = lifetime.reduce((n, r) => n + Number(r.tokens_out ?? 0), 0);
  const lifeFirst = lifetime.reduce<Date | null>((min, r) => (r.first && (!min || r.first < min) ? r.first : min), null);
  let lifeAmount = 0;
  let lifePriced = false;
  for (const r of lifetime) {
    const c = costOf(tokensOf(r), r.calls, priceFor(r.service, r.model, r.peak, prices));
    if (c) {
      lifeAmount += c.amount;
      lifePriced = true;
    }
  }
  const lifeApiCalls = perCallLife.reduce((n, r) => n + r.calls, 0);
  const lifeApiBilled = perCallLife.reduce((n, r) => n + r.billed, 0);
  let lifeApiAmount = 0;
  for (const r of perCallLife) {
    if (r.amount === null) continue;
    const converted = toMain(Number(r.amount), r.currency ?? "USD");
    if (converted !== null) lifeApiAmount += converted;
  }

  // Run rate: the trailing week is a far better basis than "average over active days", which the
  // one-off first backfill (and holiday lulls) skew badly. Quoting the basis keeps it honest.
  const recentDays = Math.min(7, d);
  const recent = daily.slice(-recentDays);
  const recentTotals = recent.reduce(
    (a, x) => ({ calls: a.calls + x.calls, tokensIn: a.tokensIn + x.tokensIn, tokensOut: a.tokensOut + x.tokensOut, amount: a.amount + (x.amount ?? 0), paid: a.paid + (x.paid ?? 0) }),
    { calls: 0, tokensIn: 0, tokensOut: 0, amount: 0, paid: 0 },
  );
  const recentAmount = recentTotals.amount || null;
  // Daily average and the 30-day projection both use token estimate + paid API, since a month of
  // keyword searches costs real money even though it burns no tokens.
  const recentApiSpend = recentTotals.paid || null;
  const recentTotalSpend = recentAmount === null && recentApiSpend === null ? null : (recentAmount ?? 0) + (recentApiSpend ?? 0);
  const perDayRecent = recentTotalSpend === null ? null : recentTotalSpend / recentDays;
  // Two lenses on purpose: the calendar average is dragged down by quiet days (holidays, weekends)
  // and the active-day average back up by whatever spike happened, so neither is authoritative on
  // its own — the page shows both rather than picking one.
  const recentActive = recent.filter((x) => x.calls > 0).length;
  // 活跃日均要和上面的日历日均用同一个分子（token 估算 + 按次实付），否则两个端点会错位：
  // 只拿 token 部分除以活跃天数，算出来的"上界"反而比"下界"还低。
  const perDayActive = recentActive > 0 && recentTotalSpend !== null ? recentTotalSpend / recentActive : null;

  // Two kinds of money on this page and they must not be added silently: `tokenSpend` is our own
  // arithmetic from the price table, `apiSpend` is what providers actually debited — now both folded
  // into the main currency. Anything that could not be converted is reported as `unconverted` rather
  // than being dropped or, worse, added at face value.
  const tokenSpend = totals.amount || null;
  const apiSpend = apiConverted ? apiAmount : null;
  const totalSpend = tokenSpend === null && apiSpend === null ? null : (tokenSpend ?? 0) + (apiSpend ?? 0);
  const unconvertedRows = [...unconverted.entries()].map(([cur, amount]) => ({ currency: cur, amount }));

  return {
    days: d,
    currency,
    priced: prices.length > 0,
    prices,
    daily,
    purposes: [...purposes.values()].sort((a, b) => b.tokensIn + b.tokensOut - (a.tokensIn + a.tokensOut)),
    totals: { ...totals, amount: tokenSpend, paid: apiSpend },
    spend: { token: tokenSpend, api: apiSpend, total: totalSpend, currency, unconverted: unconvertedRows },
    // Per-request providers, the ones that never report tokens. Without this block they were
    // invisible here: every other query on the page filters on `usage IS NOT NULL`.
    perCall: {
      rows: perCallRows,
      calls: apiCalls,
      billed: apiBilled,
      amount: apiSpend,
      currency,
      lifetime: { calls: lifeApiCalls, billed: lifeApiBilled, amount: lifeApiBilled > 0 ? lifeApiAmount : null },
    },
    averages: {
      callsPerDay: activeDays ? Math.round(totals.calls / activeDays) : 0,
      tokensPerCall: totals.calls ? Math.round((totals.tokensIn + totals.tokensOut) / totals.calls) : 0,
    },
    activeDays,
    recent: {
      days: recentDays,
      ...recentTotals,
      amount: recentAmount,
      paid: recentApiSpend,
      spend: recentTotalSpend,
      perDay: perDayRecent,
      activeDays: recentActive,
      perDayActive,
    },
    // Monthly projection = trailing-week calendar daily average × 30. Treat it as an order of
    // magnitude, not a forecast: the site's history is short and holiday weeks read low. The paid
    // leg is projected the same way, then added, so a month of paid API calls is not hidden behind
    // a token estimate that rounds to zero.
    projection: recentTotalSpend === null ? null : { amount: (recentTotalSpend / recentDays) * 30, currency, basisDays: recentDays },
    projectedActive: perDayActive === null ? null : { amount: perDayActive * 30, currency, basisDays: recentDays },
    lifetime: {
      calls: lifeCalls,
      tokensIn: lifeIn,
      tokensOut: lifeOut,
      first: lifeFirst,
      amount: lifePriced ? lifeAmount : null,
      apiCalls: lifeApiCalls,
      apiAmount: lifeApiBilled > 0 ? lifeApiAmount : null,
    },
    // The (service, model) pairs actually seen in receipts, with whether a price row matches them.
    // `registered: false` means the name is no longer in MODELS (a retired model name such as
    // deepseek-chat) — that no longer blocks pricing, because matching uses the recorded service,
    // but it is still worth showing: a new model name needs a price row of its own.
    seenModels: seen.filter((r) => r.model).map((r) => {
      const priced = prices.some((p) => p.service === r.service && (p.model === r.model || p.model === "" || p.model === `${r.model}@peak`));
      return { model: r.model as string, service: r.service, calls: r.calls, registered: stillRegistered(r.model), priced };
    }),
    services: [...new Set([...tokenServices, ...seen.map((r) => r.service)])].sort(),
  };
}
