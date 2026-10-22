// DeepSeek 网页搜索 / 抓取（/v1/tools/search、/v1/tools/fetch，2026-10-17 上线）。
//
// 与模型调用共用同一把 key，但**不是模型**：两个接口都不走 chat/completions、不产生 token 用量，
// 只按「成功请求」计费（¥5 / 1000 次 = ¥0.005/次，见价格页「网页搜索与抓取价格」）。因此：
//   - usage 记为 null（这些调用没有 token），钱记在 cost 上，走与其他按次服务商相同的 receipts；
//   - 只有 HTTP 200 且结果非空才算一次收费请求，失败与空结果 cost 为 null（不收费）；
//   - 单价仍以 service_prices 为准（service='deepseek-tools' 的 per_request 行），代码里只留一个
//     官方价兜底常量，避免价格表漏行时把「实际花了钱」显示成「未扣费」。
import { credential } from "../config.ts";
import { guardedFetch } from "../lib/http-fetch.ts";
import { sql } from "../db.ts";
import { paidRequest, ProviderRejectedError } from "./receipts.ts";

/** 与模型服务分开记账：两者计费单位不同（token vs 次），混在一个 service 下无法核对。 */
export const DEEPSEEK_TOOLS_SERVICE = "deepseek-tools";

/** 官方价 ¥5/1000 次成功请求。仅当 service_prices 里没有该服务的按次价时使用。 */
const OFFICIAL_PER_REQUEST_CNY = 0.005;

let unitCache: { at: number; value: { amount: number; currency: string } } | null = null;

/**
 * 一次成功请求的钱。价格表是唯一价格来源；进程内缓存 5 分钟，免得每篇正文都去查一次库。
 * 查不到行时退回官方价（并在 note 里写明），因为「实际扣了钱却显示未扣费」比「金额略有偏差」更糟。
 */
async function unitPrice(): Promise<{ amount: number; currency: string }> {
  if (unitCache && Date.now() - unitCache.at < 5 * 60_000) return unitCache.value;
  const [row] = await sql<{ per_request: string; currency: string }[]>`
    SELECT per_request, currency FROM service_prices
    WHERE service = ${DEEPSEEK_TOOLS_SERVICE} AND model = '' AND per_request IS NOT NULL`;
  const value = row
    ? { amount: Number(row.per_request), currency: row.currency }
    : { amount: OFFICIAL_PER_REQUEST_CNY, currency: "CNY" };
  unitCache = { at: Date.now(), value };
  return value;
}

function apiBase(): string {
  const base = credential("models", "LLM_BASE_URL") ?? "https://api.deepseek.com/v1";
  return base.replace(/\/$/, "");
}

function apiKey(): string {
  const key = credential("models", "LLM_API_KEY") ?? credential("models", "DEEPSEEK_API_KEY");
  if (!key) throw new Error("LLM_API_KEY is not configured (DeepSeek Search/Fetch 共用这把 key)");
  return key;
}

export interface SearchHit {
  url: string;
  title: string;
  snippet: string | null;
  /** 600–800 字的结果摘要，足够让评分步骤判断对口与否，不必再抓正文。 */
  summary: string | null;
  /** need_content=true 时返回的页内正文（Markdown），否则为空。 */
  content: string | null;
  siteName: string | null;
  /** 只到日（UTC RFC3339），调用方必须按「日级精度」入库。 */
  date: string | null;
  /** 0–4，≥3 为极权威结果。 */
  authority: number | null;
  /** 0–3，≥1.5 视为强相关。 */
  rerankScore: number | null;
}

export interface SearchResult {
  hits: SearchHit[];
  receiptId: number;
  reused: boolean;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * 一次网页搜索。`window` 是幂等键的一部分：同一查询在同一天只真正请求一次，之后的调度都复用
 * 已保存的响应（不再计费），所以 source 的抓取间隔可以设得比 24 小时短。
 */
export async function deepseekSearch(opts: {
  query: string;
  count?: number;
  needContent?: boolean;
  oriQuestion?: string;
  window: string;
  subject: string;
}): Promise<SearchResult> {
  const key = apiKey();
  const count = Math.min(50, Math.max(1, Math.floor(opts.count ?? 20)));
  const body: Record<string, unknown> = { query: opts.query, count };
  if (opts.needContent) body.need_content = true;
  if (opts.oriQuestion) body.ori_question = opts.oriQuestion;

  const receipt = await paidRequest(
    {
      service: DEEPSEEK_TOOLS_SERVICE,
      model: null,
      purpose: "web_search",
      subject: opts.subject,
      identity: { endpoint: "search", query: opts.query, count, needContent: !!opts.needContent, window: opts.window },
      requestSummary: { endpoint: "search", query: opts.query, count, needContent: !!opts.needContent, window: opts.window },
    },
    async () => {
      const res = await guardedFetch(`${apiBase()}/tools/search`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
        // 一次搜索要等检索 + 重排，20 秒不够；正文随结果返回时 body 也更大。
        timeoutMs: 60_000,
        maxBytes: 24 * 1024 * 1024,
        route: "direct",
      });
      const text = res.text();
      if (res.status === 401 || res.status === 402 || res.status === 422) {
        // 钥匙、余额、参数问题：重试没有意义，也不会产生费用。
        throw new ProviderRejectedError(`deepseek search HTTP ${res.status}: ${text.slice(0, 300)}`, res.status, false);
      }
      if (res.status === 429 || res.status >= 500) {
        throw new ProviderRejectedError(`deepseek search HTTP ${res.status}: ${text.slice(0, 300)}`, res.status, true);
      }
      if (res.status < 200 || res.status >= 300) {
        throw new ProviderRejectedError(`deepseek search HTTP ${res.status}: ${text.slice(0, 300)}`, res.status, false);
      }
      let json: { results?: unknown[] };
      try {
        json = JSON.parse(text) as { results?: unknown[] };
      } catch {
        throw new Error("deepseek search returned invalid JSON");
      }
      const results = Array.isArray(json.results) ? json.results : [];
      // 空结果不计费（官方口径），所以这里不给 cost。
      const cost = results.length > 0 ? { ...(await unitPrice()), basis: "estimated" as const } : null;
      return { response: json, cost };
    },
  );

  const raw = receipt.response as { results?: unknown[] } | null;
  const results = Array.isArray(raw?.results) ? raw!.results! : [];
  const hits: SearchHit[] = [];
  for (const item of results) {
    const o = (item ?? {}) as Record<string, unknown>;
    const url = str(o.url);
    const title = str(o.title);
    if (!url || !title) continue;
    hits.push({
      url,
      title,
      snippet: str(o.snippet),
      summary: str(o.summary),
      content: str(o.content),
      siteName: str(o.site_name),
      date: str(o.date),
      authority: num(o.authority),
      rerankScore: num(o.rerank_score ?? o.rerankScore),
    });
  }
  return { hits, receiptId: receipt.receiptId, reused: receipt.reused };
}

export interface FetchedPage {
  title: string | null;
  /** Markdown 正文。 */
  content: string | null;
  receiptId: number;
  reused: boolean;
}

/**
 * 抓一页正文。与 Search 分开计费，所以只在确实需要正文时调用（Search 的 need_content 更划算：
 * 一次搜索的价钱就能带回所有结果各自的正文）。
 */
export async function deepseekFetch(url: string, opts: { window: string; subject: string }): Promise<FetchedPage> {
  const key = apiKey();
  const receipt = await paidRequest(
    {
      service: DEEPSEEK_TOOLS_SERVICE,
      model: null,
      purpose: "web_fetch",
      subject: opts.subject,
      identity: { endpoint: "fetch", url, window: opts.window },
      requestSummary: { endpoint: "fetch", url, window: opts.window },
    },
    async () => {
      const res = await guardedFetch(`${apiBase()}/tools/fetch`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ url }),
        timeoutMs: 60_000,
        maxBytes: 24 * 1024 * 1024,
        route: "direct",
      });
      const text = res.text();
      if (res.status === 401 || res.status === 402 || res.status === 422) {
        throw new ProviderRejectedError(`deepseek fetch HTTP ${res.status}: ${text.slice(0, 300)}`, res.status, false);
      }
      if (res.status === 429 || res.status >= 500) {
        throw new ProviderRejectedError(`deepseek fetch HTTP ${res.status}: ${text.slice(0, 300)}`, res.status, true);
      }
      if (res.status < 200 || res.status >= 300) {
        // 404 / 不支持的内容类型：provider 侧不计费。
        throw new ProviderRejectedError(`deepseek fetch HTTP ${res.status}: ${text.slice(0, 300)}`, res.status, false);
      }
      let json: { title?: unknown; content?: unknown };
      try {
        json = JSON.parse(text) as { title?: unknown; content?: unknown };
      } catch {
        throw new Error("deepseek fetch returned invalid JSON");
      }
      const content = str(json.content);
      // 没有正文就不算一次成功的抓取，也不收费。
      const cost = content ? { ...(await unitPrice()), basis: "estimated" as const } : null;
      return { response: json, cost };
    },
  );
  const raw = receipt.response as { title?: unknown; content?: unknown } | null;
  return { title: str(raw?.title), content: str(raw?.content), receiptId: receipt.receiptId, reused: receipt.reused };
}
