// Exa 网页搜索（https://api.exa.ai/search）：与 DeepSeek 搜索并列的第二条搜索通道。
//
// 为什么单开一个 service 记账：Exa 的额度单位是**美元信用**，不是人民币按次。新注册每月赠 $10
// （Lite $4/1000 次 ≈ 2,500 次/月，Auto $7/1000 次 ≈ 1,400 次），额度用尽即停。若与
// deepseek-tools 记在同一个 service 下，「买了多少钱」和「还剩多少免费额度」两笔账会混在一起，
// 预算熔断也会互相误伤。
//
// 与 deepseek-tools 的三处差异，改这个文件时别按那边的习惯抄错：
//   1. **时间精度**：Exa 的 `publishedDate` 是完整 ISO 时间戳，不必像 DeepSeek 那样退到日级；
//      但仍有结果不带日期，缺失时留 null 交给正文抽取，不要编造。
//   2. **日期窗口**：Exa 用 `startPublishedDate` 参数，不能在 query 末尾拼 `after:`。
//   3. **成本**：响应带 `costDollars.total`（真实美元），优先用它记 actual；缺失才按价格表估算。
//
// 计价口径（2026-11-14 核对 https://exa.ai/pricing）：Search Lite $4/1000 次（含 10 条结果，
// 每多一条 +$1/1000）；Contents 的 text / highlights / summary 各自 $1/1000 页。因此**默认不取
// 正文**——一次 10 条结果若带 highlights，费用约为搜索本身的 2.5 倍，免费额度会被迅速吃掉。
import { credential } from "../config.ts";
import { guardedFetch } from "../lib/http-fetch.ts";
import { sql } from "../db.ts";
import { paidRequest, ProviderRejectedError } from "./receipts.ts";

/** 与模型、deepseek-tools 分开记账：额度单位不同（美元信用 vs 人民币按次）。 */
export const EXA_SERVICE = "exa";

/** 官方 Lite 价 $4/1000 次。仅当价格表缺行且响应未带 costDollars 时兜底。 */
const OFFICIAL_PER_SEARCH_USD = 0.004;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function apiBase(): string {
  return (credential("collectors", "EXA_BASE_URL") ?? "https://api.exa.ai").replace(/\/$/, "");
}

function apiKey(): string {
  const key = credential("collectors", "EXA_API_KEY");
  if (!key) throw new Error("EXA_API_KEY is not configured (Exa 搜索需要它)");
  return key;
}

/** 站点名从 URL 取：Exa 不返回 publisher 字段，用域名比空着更有用。 */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export interface ExaHit {
  url: string;
  title: string;
  snippet: string | null;
  summary: string | null;
  /** needContent=true 时返回的页内正文（纯文本），否则为空。 */
  content: string | null;
  siteName: string | null;
  /** 完整 ISO 时间戳（比 deepseek-tools 的日级精度更细）；缺失为 null。 */
  date: string | null;
  /** Exa 的相关度，0–1。注意与 DeepSeek 的 rerank_score（0–3）不是同一把尺子。 */
  score: number | null;
}

export interface ExaSearchResult {
  hits: ExaHit[];
  receiptId: number;
  reused: boolean;
}

let unitCache: { at: number; value: number } | null = null;

/** 一次成功搜索的美元价。价格表是唯一价格来源；查不到行时退回官方价。 */
async function unitPrice(): Promise<number> {
  if (unitCache && Date.now() - unitCache.at < 5 * 60_000) return unitCache.value;
  const [row] = await sql<{ per_request: string }[]>`
    SELECT per_request FROM service_prices
    WHERE service = ${EXA_SERVICE} AND model = '' AND per_request IS NOT NULL`;
  const value = row ? Number(row.per_request) : OFFICIAL_PER_SEARCH_USD;
  unitCache = { at: Date.now(), value };
  return value;
}

export interface ExaSearchOptions {
  query: string;
  count?: number;
  /** auto（默认，推荐）/ lite（最便宜）/ fast / instant / deep。 */
  type?: string;
  /** Exa 的类目过滤，新闻场景用 "news"。 */
  category?: string;
  /** 只要这之后发布的（ISO 8601）。 */
  startPublishedDate?: string;
  endPublishedDate?: string;
  /** 取正文（额外 $1/1000 页）。默认 false。 */
  needContent?: boolean;
  /** 取 highlights 段落（额外 $1/1000 页）。默认 false；开了才有 snippet，否则为空。 */
  highlights?: boolean;
  /** 幂等键的一部分：同一 query 同一天只真请求一次。 */
  window: string;
  subject: string;
}

/** 把请求参数拼成 Exa 的 body。抽成纯函数，方便断言「默认不取正文」。 */
export function buildExaBody(opts: ExaSearchOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    query: opts.query,
    numResults: Math.min(100, Math.max(1, Math.floor(opts.count ?? 10))),
    type: opts.type ?? "auto",
  };
  if (opts.category) body.category = opts.category;
  if (opts.startPublishedDate) body.startPublishedDate = opts.startPublishedDate;
  if (opts.endPublishedDate) body.endPublishedDate = opts.endPublishedDate;
  // 只有明确要了才加 contents：highlights / text 都按页计费，默认不开。
  const contents: Record<string, unknown> = {};
  if (opts.highlights) contents.highlights = true;
  if (opts.needContent) contents.text = { maxCharacters: 50_000 };
  if (Object.keys(contents).length > 0) body.contents = contents;
  return body;
}

/** Exa 响应 → 统一 hit 结构。缺 url 或 title 的结果直接丢弃（与 deepseek-tools 一致）。 */
export function parseExaResults(raw: unknown): ExaHit[] {
  const results = Array.isArray((raw as { results?: unknown[] } | null)?.results)
    ? ((raw as { results: unknown[] }).results)
    : [];
  const hits: ExaHit[] = [];
  for (const item of results) {
    const o = (item ?? {}) as Record<string, unknown>;
    const url = str(o.url);
    const title = str(o.title);
    if (!url || !title) continue;
    const highlights = Array.isArray(o.highlights)
      ? o.highlights.map((h) => String(h ?? "").trim()).filter(Boolean)
      : [];
    hits.push({
      url,
      title,
      snippet: highlights.length ? highlights.join("\n\n").slice(0, 2000) : str(o.summary),
      summary: str(o.summary),
      content: str(o.text),
      siteName: hostOf(url),
      date: str(o.publishedDate),
      score: num(o.score),
    });
  }
  return hits;
}

/**
 * 一次网页搜索。`window` 是幂等键的一部分：同一查询在同一天只真正请求一次，之后的调度复用
 * 已保存的响应（不再计费），所以 source 的抓取间隔可以设得比 24 小时短。
 */
export async function exaSearch(opts: ExaSearchOptions): Promise<ExaSearchResult> {
  const key = apiKey();
  const body = buildExaBody(opts);
  const receipt = await paidRequest(
    {
      service: EXA_SERVICE,
      model: null,
      purpose: "web_search",
      subject: opts.subject,
      identity: { endpoint: "search", query: opts.query, ...body, window: opts.window },
      requestSummary: { endpoint: "search", query: opts.query, type: body.type, numResults: body.numResults, window: opts.window },
    },
    async () => {
      const res = await guardedFetch(`${apiBase()}/search`, {
        method: "POST",
        headers: { "x-api-key": key, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
        // 与 DeepSeek 搜索一致：检索 + 重排要时间，正文随结果返回时 body 也更大。
        timeoutMs: 60_000,
        maxBytes: 24 * 1024 * 1024,
        // 海外 API：走 egress 代理（config.egressProxyUrl），不要写 direct。
        route: "egress",
      });
      const text = res.text();
      if (res.status === 401 || res.status === 402 || res.status === 403 || res.status === 422) {
        // 钥匙、额度、参数问题：重试没有意义，也不会产生费用。
        throw new ProviderRejectedError(`exa search HTTP ${res.status}: ${text.slice(0, 300)}`, res.status, false);
      }
      if (res.status === 429 || res.status >= 500) {
        throw new ProviderRejectedError(`exa search HTTP ${res.status}: ${text.slice(0, 300)}`, res.status, true);
      }
      if (res.status < 200 || res.status >= 300) {
        throw new ProviderRejectedError(`exa search HTTP ${res.status}: ${text.slice(0, 300)}`, res.status, false);
      }
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        throw new Error("exa search returned invalid JSON");
      }
      const results = Array.isArray(json.results) ? json.results : [];
      // 响应自带 costDollars（真实花费），优先记 actual；没有才按价格表估算。
      const reported = num((json.costDollars as { total?: unknown } | undefined)?.total);
      const cost = results.length > 0
        ? {
            amount: reported ?? (await unitPrice()),
            currency: "USD",
            basis: reported !== null ? ("actual" as const) : ("estimated" as const),
          }
        : null;
      return { response: json, requestId: str(json.requestId), cost };
    },
  );

  return {
    hits: parseExaResults(receipt.response),
    receiptId: receipt.receiptId,
    reused: receipt.reused,
  };
}
