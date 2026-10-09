// Read-only feed discovery for an administrator-supplied public URL.
// Uses the same SSRF/DNS/redirect/response-size protections as the existing collectors.
import { load } from "cheerio";
import { guardedFetch } from "../lib/http-fetch.ts";

export interface FeedSuggestion {
  url: string;
  format: "rss" | "atom" | "json";
  title: string;
  sameHost: boolean;
  verified: false; // an HTML link advertises a feed; it does NOT prove that feed is valid
}

function publicHttpUrl(input: string, base?: string): URL | null {
  try {
    const url = new URL(input, base);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    if (!url.hostname || url.href.length > 2048) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

export function parseDiscoveredFeeds(html: string, location: string): FeedSuggestion[] {
  const root = publicHttpUrl(location);
  if (!root) return [];
  const $ = load(html);
  const result: FeedSuggestion[] = [];
  const seen = new Set<string>();
  const add = (href: string, format: FeedSuggestion["format"], title: string) => {
    const u = publicHttpUrl(href, root.href);
    if (!u || seen.has(u.href) || result.length >= 12) return;
    seen.add(u.href);
    result.push({ url: u.href, format, title: title.trim().slice(0, 140), sameHost: u.hostname === root.hostname, verified: false });
  };
  // Native RSS/Atom and JSON Feed discovery, not guessed URLs or HTML search results.
  $('link[rel~="alternate"][href]').each((_index, element) => {
    const type = String($(element).attr("type") ?? "").toLowerCase().split(";")[0]?.trim();
    const format = type === "application/rss+xml" ? "rss"
      : type === "application/atom+xml" ? "atom"
      : type === "application/feed+json" ? "json" : null;
    if (!format) return;
    add(String($(element).attr("href") ?? ""), format, String($(element).attr("title") ?? ""));
  });
  return result.sort((a, b) => Number(b.sameHost) - Number(a.sameHost));
}

export async function discoverFeeds(input: string) {
  const cleaned = input.trim();
  const requested = publicHttpUrl(cleaned);
  if (!requested || !/^https?:\/\//i.test(cleaned)) {
    throw Object.assign(new Error("请输入完整的公开 HTTP(S) 网站地址"), { statusCode: 400 });
  }
  const response = await guardedFetch(requested.toString(), {
    headers: { accept: "text/html, application/rss+xml, application/atom+xml, application/xml, application/feed+json;q=0.8" },
    timeoutMs: 12_000,
    maxBytes: 512 * 1024,
    maxRedirects: 3,
  });
  if (response.status !== 200) {
    throw Object.assign(new Error(`目标网页返回 HTTP ${response.status}`), { statusCode: 422 });
  }
  const finalUrl = response.url;
  const body = response.text();
  const type = (response.headers.get("content-type") ?? "").toLowerCase();
  const feedFormat = /(?:<rss\b|<rdf:RDF\b)/i.test(body.slice(0, 3000)) ? "rss"
    : /<feed(?:\s|>)/i.test(body.slice(0, 3000)) ? "atom"
    : type.includes("application/feed+json") ? "json" : null;
  const suggestions = feedFormat
    ? [{ url: finalUrl, format: feedFormat, title: "当前地址本身是订阅源", sameHost: true, verified: false as const }]
    : parseDiscoveredFeeds(body, finalUrl);
  return {
    requestedUrl: requested.toString(),
    pageUrl: finalUrl,
    pageTitle: feedFormat ? null : load(body)("title").first().text().trim().slice(0, 140) || null,
    suggestions,
    note: "只发现网页声明的订阅链接；需单独预览并核对采集许可。不会创建或启用信源。",
  };
}
