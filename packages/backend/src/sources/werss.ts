// The operator may nominate one private WeRSS origin. Only read-only feed paths on that exact
// origin are reachable; all other requests keep the normal public-network SSRF guard.
import { config } from "../config.ts";
import { guardedFetch, type GuardedResponse } from "../lib/http-fetch.ts";

export function isWeRssFeed(input: string, base = config.weRssBaseUrl): boolean {
  if (!base) return false;
  const origin = new URL(base);
  if (!/^https?:$/.test(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("WERSS_BASE_URL must be an HTTP(S) origin without credentials or a path");
  }
  const url = new URL(input);
  return url.origin === origin.origin && !url.username && !url.password && !url.hash &&
    /^\/feed\/[A-Za-z0-9_-]+\.(?:rss|xml|atom)$/.test(url.pathname) &&
    [...url.searchParams].every(([key, value]) => key === "is_update" ? value === "false" :
      ["limit", "offset"].includes(key) && /^\d{1,4}$/.test(value));
}

export async function fetchFeed(input: string, headers: Record<string, string>): Promise<GuardedResponse> {
  if (!isWeRssFeed(input)) return guardedFetch(input, { headers, timeoutMs: 25_000 });
  const target = new URL(input);
  target.searchParams.set("is_update", "false");
  const res = await fetch(target, { headers, redirect: "manual", signal: AbortSignal.timeout(25_000) });
  // A compromised or misconfigured feed cannot turn this exception into a private-network redirect.
  if (res.status >= 300 && res.status < 400 && res.status !== 304) {
    await res.body?.cancel();
    throw new Error("WeRSS feed redirects are not allowed");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  if (res.body) for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > 8 * 1024 * 1024) throw new Error("WeRSS feed exceeds 8 MiB");
    chunks.push(Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks);
  return { status: res.status, url: input, headers: res.headers, body, text: () => body.toString("utf8") };
}
