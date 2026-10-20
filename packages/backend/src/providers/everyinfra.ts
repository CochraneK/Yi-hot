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
        timeoutMs: 60_000,
        maxBytes: 16 * 1024 * 1024,
        route: "direct",
      });
      const text = res.text();
      if (res.status === 401 || res.status === 402 || res.status === 422) {
        throw new ProviderRejectedError(`everyinfra HTTP ${res.status}: ${text.slice(0, 300)}`, res.status, false);
      }
      if (res.status === 429 || res.status === 503 || res.status >= 500) {
        throw new ProviderRejectedError(`everyinfra HTTP ${res.status}`, res.status, true);
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
