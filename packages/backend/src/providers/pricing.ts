// 计价：把 `service_prices` 里的单价变成一笔调用的钱。
//
// 这一份实现同时被两处使用，两边必须算出同一个数：
//   - 调用当时（providers/llm.ts）—— 写进 `receipt_attempts.cost`，那一列不能永远是 NULL；
//   - 事后汇总（admin/usage.ts）—— 价格表被运营修正后要能重算出新数。
// 之前只有后者，adapters 里 llm 那一支把 cost 写死成 null，于是三天 6700 次模型调用一分钱都没记上。
//
// 匹配口径（别再改回去）：用调用当时记录在 `receipt_attempts` 上的 (service, model)，
// 不拿 model 名去注册表反查 service —— 模型改名（deepseek-chat → deepseek-flash）会让整段历史
// 静默变成「未定价」。价格表里为旧名字留一行即可。
//
// 高峰/空闲：北京工作日 09–12、14–18 双倍。高峰价是同一 (service, model) 的另一行，
// model 名加 `@peak` 后缀；没有这一行就退回主行，等于该服务不分时段。
//
// 缓存命中：`usage.prompt_cache_hit_tokens` 按 `cached_per_mtok` 计，未命中部分按 `input_per_mtok`。
// 命中率在站点上约六成，只按未命中价算会高估两倍以上。
import { sql } from "../db.ts";

export interface PriceRow {
  service: string;
  model: string;
  currency: string;
  input_per_mtok: string | null;
  cached_per_mtok: string | null;
  output_per_mtok: string | null;
  per_request: string | null;
}

const BJ_MS = 8 * 3600_000;
const CACHE_TTL_MS = 5 * 60_000;

let cache: { at: number; rows: PriceRow[] } | null = null;

/** The price table, refreshed at most every five minutes (a call per request would be a query per call). */
export async function loadPrices(): Promise<PriceRow[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
  const rows = await sql<PriceRow[]>`
    SELECT service, model, currency, input_per_mtok, cached_per_mtok, output_per_mtok, per_request
    FROM service_prices`;
  cache = { at: Date.now(), rows };
  return rows;
}

/** Drops the cached price table (tests, and the admin page that edits prices). */
export function clearPriceCache(): void {
  cache = null;
}

/**
 * 北京时间工作日 09:00–12:00、14:00–18:00 是 DeepSeek 的高峰价时段（其余时段含周末为半价）。
 * 法定节假日同样按空闲计价：一年十来天的偏差会让金额略微高估，方向是保守的。
 * 与 admin/usage.ts 里 SQL 版的 PEAK_SQL 必须一致（那边用 isodow 1–5、hour 9–11 / 14–17）。
 */
export function isPeakBeijing(at: Date): boolean {
  const bj = new Date(at.getTime() + BJ_MS);
  const dow = bj.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  const hour = bj.getUTCHours();
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18);
}

export const priceFor = (service: string, model: string | null, peak: boolean, prices: PriceRow[]): PriceRow | null => {
  const named = model ?? "";
  const find = (m: string) => prices.find((p) => p.service === service && p.model === m) ?? null;
  // 高峰价是同一 (service, model) 的另一行，靠 `@peak` 后缀区分；没有这一行说明该服务不分时段。
  if (peak) {
    const peakRow = find(`${named}@peak`);
    if (peakRow) return peakRow;
  }
  return find(named) ?? find("");
};

export interface TokenCost {
  /** 缓存命中的输入 token。 */
  hit: number;
  /** 未命中的输入 token。 */
  miss: number;
  out: number;
}

/** A price row's money for one group. Hit and miss are priced apart: one blended rate misreports by 2×. */
export const costOf = (t: TokenCost, calls: number, p: PriceRow | null): { amount: number; currency: string } | null => {
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

const num = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * 一次调用的 token 三分。旧 provider 不报缓存字段，那就整段输入算未命中（保守，与汇总口径一致）；
 * 只报了 `prompt_cache_hit_tokens` 而没有 miss 时，miss = prompt − hit。
 */
export const tokenCostOf = (usage: Record<string, unknown> | null | undefined): TokenCost => {
  const hit = num(usage?.prompt_cache_hit_tokens);
  const miss = usage?.prompt_cache_miss_tokens === undefined || usage?.prompt_cache_miss_tokens === null
    ? Math.max(0, num(usage?.prompt_tokens) - hit)
    : num(usage?.prompt_cache_miss_tokens);
  return { hit, miss, out: num(usage?.completion_tokens) };
};

/**
 * 一次 token 计费调用的钱。`at` 用来判断高峰/空闲，默认就是现在。
 * 返回 null 表示价格表里没有这一行 —— 那不是 0 元，是「不知道多少钱」，调用方必须照 null 存。
 */
export async function estimateCost(args: { service: string; model?: string | null; usage?: Record<string, unknown> | null; at?: Date }): Promise<{ amount: number; currency: string; basis: "estimated" } | null> {
  let prices: PriceRow[];
  try {
    prices = await loadPrices();
  } catch {
    // 读不到价格表（库抖动）绝不能把一次已经付过钱的调用变成失败回执：钱照花、结果却丢了。
    // 记不下金额就记 null，事后的汇总会从 price 表重算。
    return null;
  }
  const row = priceFor(args.service, args.model ?? null, isPeakBeijing(args.at ?? new Date()), prices);
  const cost = costOf(tokenCostOf(args.usage), 1, row);
  if (!cost) return null;
  return { amount: cost.amount, currency: cost.currency, basis: "estimated" };
}
