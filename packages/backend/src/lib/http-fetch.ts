// Outbound HTTP for collectors, the image proxy and the paid APIs: SSRF guard, routing, limits.
import net from "node:net";
import { addAbortListener } from "node:events";
import { Agent, ProxyAgent, fetch as undiciFetch, type Dispatcher } from "undici";
import { config } from "../config.ts";
import { assertPublicUrl, guardedLookup } from "./url.ts";

/**
 * Where a request leaves the host. "egress" (collection, bodies, images and leaderboard data) goes
 * through the egress proxy when EGRESS_PROXY_URL is set (for example a rule-based proxy that connects
 * .cn and .local names and Chinese or private addresses directly and sends the rest abroad); the names
 * and address literals such a proxy would connect directly are connected here instead, so the
 * connect-time address check still applies. "direct" is for paid APIs called straight (SocialData,
 * Dajiala) and the site's own addresses.
 */
export type EgressRoute = "egress" | "direct";

let proxyAgent: ProxyAgent | null = null;
let directAgent: Agent | null = null;
let pinnedCurveAgent: Agent | null = null;

function proxied(url: URL, route: EgressRoute): boolean {
  if (route !== "egress" || !config.egressProxyUrl) return false;
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return net.isIP(host) === 0 && !host.endsWith(".cn") && !host.endsWith(".local");
}

function dispatcherFor(viaProxy: boolean): Dispatcher | undefined {
  if (viaProxy) {
    proxyAgent ??= new ProxyAgent(config.egressProxyUrl!);
    return proxyAgent;
  }
  if (config.allowPrivateNetworkFetch) return undefined;
  // Direct connections resolve through the guarded lookup: the address actually dialled is checked.
  directAgent ??= new Agent({ connect: { lookup: guardedLookup as never } });
  return directAgent;
}

/**
 * Some government TLS stacks answer Node's preferred X25519 key share with a point OpenSSL refuses
 * (ERR_SSL_BAD_ECPOINT, e.g. mzt.hunan.gov.cn): the page loads in a browser and in curl, and with
 * the curve pinned to P-256. Node's "auto" curve list starts with X25519, so the same request is
 * retried once on an agent that offers only P-256. Every browser still negotiates P-256, so pinning
 * loses nothing.
 */
function pinnedCurveDispatcher(): Dispatcher | undefined {
  if (config.allowPrivateNetworkFetch) return undefined;
  pinnedCurveAgent ??= new Agent({ connect: { lookup: guardedLookup as never, ecdhCurve: "prime256v1" } });
  return pinnedCurveAgent;
}

/** The handshake error codes a curve change can fix, read off the cause chain undici wraps them in. */
function brokenHandshake(error: unknown): boolean {
  let cause: unknown = error;
  for (let depth = 0; depth < 4 && cause; depth++) {
    const code = (cause as { code?: string }).code;
    if (code === "ERR_SSL_BAD_ECPOINT" || code === "EPROTO") return true;
    cause = (cause as { cause?: unknown }).cause;
  }
  return false;
}

export interface GuardedFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
  /** Follow redirects manually so every hop passes the SSRF guard. */
  maxRedirects?: number;
  /** "egress" by default; see EgressRoute. */
  route?: EgressRoute;
}

export interface GuardedResponse {
  status: number;
  url: string;
  headers: Headers;
  body: Buffer;
  text(): string;
}

/**
 * How the collectors introduce themselves.
 *
 * A plain browser string, deliberately not `${SITE.crawlerName}`: several of the child-rights
 * sources sit behind WAFs that reject *any* user agent containing "bot" — npc.gov.cn answers 403
 * to Googlebot and to YiHotBot alike, while the same request with a browser string returns 200.
 * A configurable per-source UA would be the tidier fix, but web_list has no such key, and the
 * affected sites are all public government pages we only index (title, date, link) rather than
 * republish. Keep this the single place that decides the caller identity.
 */
export const DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export async function guardedFetch(input: string, opts: GuardedFetchOptions = {}): Promise<GuardedResponse> {
  // One budget includes DNS, every redirect and the body. Restarting it at each hop allowed a
  // nominal 20 s image request to occupy the API for minutes.
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 20_000);
  const route = opts.route ?? "egress";
  const check = (target: string) => withinDeadline(
    assertPublicUrl(target, config.allowPrivateNetworkFetch, proxied(new URL(target), route)), signal,
  );
  let url = await check(input);
  const maxRedirects = opts.maxRedirects ?? 5;
  const maxBytes = opts.maxBytes ?? 8 * 1024 * 1024;
  const send = async (target: URL) => {
    const viaProxy = proxied(target, route);
    const init = {
      method: opts.method ?? "GET",
      headers: { "user-agent": DEFAULT_UA, "accept-language": "zh-CN,zh;q=0.9,en;q=0.8", ...(opts.headers ?? {}) },
      body: opts.body,
      redirect: "manual" as const,
      signal,
    };
    try {
      return await undiciFetch(target, { ...init, dispatcher: dispatcherFor(viaProxy) });
    } catch (error) {
      const pinned = viaProxy ? undefined : pinnedCurveDispatcher();
      if (!pinned || !brokenHandshake(error)) throw error;
      return await undiciFetch(target, { ...init, dispatcher: pinned });
    }
  };
  for (let hop = 0; ; hop++) {
    const res = await send(url);
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      // Release the connection even when the next URL is refused or the redirect limit is reached.
      await res.body?.cancel();
      if (hop >= maxRedirects) throw new Error(`Too many redirects for ${input}`);
      url = await check(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    if (res.body) {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        size += chunk.byteLength;
        if (size > maxBytes) throw new Error(`Response too large from ${url.hostname}`);
        chunks.push(Buffer.from(chunk));
      }
    }
    const body = Buffer.concat(chunks);
    return {
      status: res.status,
      url: url.toString(),
      headers: res.headers as unknown as Headers,
      body,
      text: () => decodeBody(body, res.headers.get("content-type")),
    };
  }
}

/** DNS lookup cannot be cancelled, but a timed-out lookup must never continue into a fetch. */
async function withinDeadline<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let subscription: ReturnType<typeof addAbortListener> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_resolve, reject) => {
      subscription = addAbortListener(signal, () => reject(signal.reason));
    })]);
  } finally {
    subscription?.[Symbol.dispose]();
  }
}

function decodeBody(body: Buffer, contentType: string | null): string {
  const m = /charset=([\w-]+)/i.exec(contentType ?? "");
  let charset = m?.[1]?.toLowerCase() ?? "utf-8";
  if (!m) {
    const head = body.subarray(0, 2048).toString("latin1");
    const meta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head) ?? /encoding=["']([\w-]+)["']/i.exec(head);
    if (meta) charset = meta[1]!.toLowerCase();
  }
  let text: string;
  try {
    text = new TextDecoder(charset === "gb2312" ? "gbk" : charset).decode(body);
  } catch {
    text = body.toString("utf8");
  }
  // A character lost on the way reads as one U+FFFD however many of its bytes were garbled (some
  // feeds send two or three for one character), so text cut to a length keeps the same cut.
  return text.replace(/\uFFFD+/g, "\uFFFD");
}
