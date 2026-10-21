// EveryInfra 统一公开内容 API（决策见 docs/PAID_CHANNEL_PROVIDERS.md）。Key 只在后端读取，
// 每一次计费调用都走与其他付费服务相同的 receipts 记账与 budgets 熔断，不因为是新 provider 就绕开。
// P1 只接小红书关键词搜索（summaryIsBody，不拉详情）；公众号接口等 WeRSS 节奏跑稳后再评估。
import { credential } from "../config.ts";
import { guardedFetch } from "../lib/http-fetch.ts";
import { paidRequest, ProviderRejectedError, type CallOutcome } from "./receipts.ts";

export interface EveryInfraEnvelope<T = unknown> {
  id?: string;
  results?: T;
  billing?: { charged_usd?: number; charged?: boolean; [key: string]: unknown };
  [key: string]: unknown;
}

function apiBase(): string {
  return (credential("collectors", "EVERYINFRA_BASE_URL") ?? "https://api.everyinfra.com").replace(/\/$/, "");
}

function apiKey(): string {
  const key = credential("collectors", "EVERYINFRA_API_KEY");
  if (!key) throw new Error("EVERYINFRA_API_KEY is not configured");
  return key;
}

function responseCost(json: EveryInfraEnvelope): CallOutcome["cost"] {
  const amount = json.billing?.charged_usd;
  return typeof amount === "number" ? { amount, currency: "USD", basis: "actual" } : null;
}

/**
 * 从错误响应体里读出「什么时候可以再来」。EveryInfra 的 503 长这样：
 * `{error:{reason:"capacity_exhausted", retry_after:900, message:"... has no capacity right now"}}`
 * 解析失败不影响主流程，只是退回到普通的可重试错误。
 */
function providerErrorInfo(text: string): { message: string; retryAfterSeconds: number | null } {
  try {
    const j = JSON.parse(text) as { error?: { reason?: unknown; message?: unknown; retry_after?: unknown } };
    const reason = typeof j?.error?.reason === "string" ? j.error.reason : "";
    const msg = typeof j?.error?.message === "string" ? j.error.message : "";
    const raw = j?.error?.retry_after;
    const secs = typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null;
    return { message: [reason, msg].filter(Boolean).join(": ").slice(0, 160), retryAfterSeconds: secs };
  } catch {
    return { message: "", retryAfterSeconds: null };
  }
}

/**
 * 一次 EveryInfra 能力调用。结果不确定时不重试：provider 可能已经计费了。
 * 401/402/422 是钥匙、参数或余额问题，重试没有意义；429/503/5xx 稍后重试。
 */
export async function everyInfraCall<T = unknown>(opts: {
  platform: string;
  action: string;
  params?: Record<string, unknown>;
  subject: string;
  purpose: string;
  window?: string;
}): Promise<{ results: T; receiptId: number; reused: boolean; response: EveryInfraEnvelope<T> }> {
  const key = apiKey();
  const params = opts.params ?? {};
  const receipt = await paidRequest(
    {
      service: "everyinfra",
      purpose: opts.purpose,
      subject: opts.subject,
      identity: { platform: opts.platform, action: opts.action, params, window: opts.window ?? null },
      requestSummary: { platform: opts.platform, action: opts.action, params },
    },
    async () => {
      const res = await guardedFetch(`${apiBase()}/api/v1/social`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ platform: opts.platform, action: opts.action, params }),
        // 公众号大号（红十字会 / 青基会 / 救助儿童会 / UNICEF 等）文章量多，EveryInfra 聚合返回常超过 60s，
        // 之前的 60s 超时会把它们掐掉、留空且不进动态。放宽到 120s 给足余量。
        timeoutMs: 120_000,
        maxBytes: 16 * 1024 * 1024,
        route: "direct",
      });
      const text = res.text();
      if (res.status === 401 || res.status === 402 || res.status === 422) {
        throw new ProviderRejectedError(`everyinfra HTTP ${res.status}: ${text.slice(0, 300)}`, res.status, false);
      }
      if (res.status === 429 || res.status === 503 || res.status >= 500) {
        // 503 最常见的原因不是「坏了」，而是 provider 对该动作暂时没有容量
        // （"capacity_exhausted"，本次不计费）。响应体里带 retry_after 秒数，
        // 带出去之后调度器才能按 provider 的节奏重试，而不是按普通失败的退避推到几小时后。
        const info = providerErrorInfo(text);
        throw new ProviderRejectedError(
          `everyinfra HTTP ${res.status}${info.message ? ` (${info.message})` : ""}`,
          res.status,
          true,
          info.retryAfterSeconds,
        );
      }
      if (res.status < 200 || res.status >= 300) {
        throw new ProviderRejectedError(`everyinfra HTTP ${res.status}: ${text.slice(0, 300)}`, res.status, false);
      }
      let json: EveryInfraEnvelope<T>;
      try {
        json = JSON.parse(text) as EveryInfraEnvelope<T>;
      } catch {
        throw new Error("everyinfra returned invalid JSON");
      }
      return { response: json, requestId: typeof json.id === "string" ? json.id : null, cost: responseCost(json) };
    },
  );
  const response = receipt.response as EveryInfraEnvelope<T>;
  return { results: response.results as T, receiptId: receipt.receiptId, reused: receipt.reused, response };
}

/**
 * article_detail 返回的是排版用的 `content_html`（实测没有 `content_text`），直接把它丢给分析
 * 会带上大量标签噪声；这里保留段落换行地剥标签，供没有纯文本字段时兜底。
 */
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|section|div|li|h[1-6]|blockquote|pre|tr|figure)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 公众号文章正文：列表接口只给标题和链接（实测没有摘要字段），正文只能按文章 URL 单独取。 */
export async function everyInfraWechatArticle(articleUrl: string, opts: { subject: string; identity: string }) {
  const call = await everyInfraCall<Record<string, unknown>>({
    platform: "wechat_oa",
    action: "article_detail",
    params: { url: articleUrl },
    subject: opts.subject,
    purpose: "wechat_article",
    window: opts.identity,
  });
  const row = call.results && typeof call.results === "object" ? call.results : {};
  const text = typeof row.content_text === "string" && row.content_text.trim()
    ? row.content_text
    : typeof row.content_html === "string"
      ? htmlToText(row.content_html)
      : null;
  return {
    title: typeof row.title === "string" ? row.title : null,
    text: text && text.length > 0 ? text : null,
    // 摘要在正文取不到时还能喂给分析，比直接 unknown 好。
    digest: typeof row.digest === "string" && row.digest.trim() ? row.digest.trim() : null,
    author: typeof row.author === "string" ? row.author : null,
    postedAt: typeof row.posted_at === "string" ? row.posted_at : null,
    raw: row,
    receiptId: call.receiptId,
  };
}

/** 小红书笔记详情（P3 才开：只对通过预筛、且列表没有正文的笔记调用）。 */
export async function everyInfraXhsNote(noteUrl: string, opts: { subject: string; identity: string }) {
  const call = await everyInfraCall<Record<string, unknown>>({
    platform: "xiaohongshu",
    action: "note",
    params: { url: noteUrl },
    subject: opts.subject,
    purpose: "xhs_note",
    window: opts.identity,
  });
  const row = call.results && typeof call.results === "object" ? call.results : {};
  return {
    title: typeof row.title === "string" ? row.title : null,
    text: typeof row.text === "string" ? row.text : null,
    author: typeof row.author_name === "string" ? row.author_name : null,
    postedAt: typeof row.posted_at === "string" ? row.posted_at : null,
    raw: row,
    receiptId: call.receiptId,
  };
}
