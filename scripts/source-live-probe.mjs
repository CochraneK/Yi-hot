#!/usr/bin/env node
// Bounded, read-only sample probe from a disposable GitHub Actions runner.
// It does NOT create sources, fetch article bodies, bypass challenges, or grant permissions.
// Historical URLs must not be treated as approved feeds when this probe finds them reachable.
const targets = [
  { name: "中国发展简报·旧 RSS 候选", url: "https://www.chinadevelopmentbrief.org.cn/feed", expected: "feed" },
  { name: "南都公益基金会·旧 RSS 候选", url: "https://www.naradafoundation.org/feed", expected: "feed" },
  { name: "公益时报·旧 RSS 候选", url: "http://www.gongyishibao.com/rss.xml", expected: "feed" },
  { name: "Oxfam·YiHot RSS seed", url: "https://www.oxfam.org/en/rss.xml", expected: "feed" },
  { name: "UNICEF 中国·官方新闻栏目", url: "https://www.unicef.cn/press-centre", expected: "html" },
  { name: "中国慈善联合会·官方动态", url: "https://www.charityalliance.org.cn/dl/771e1p1pcD.html", expected: "html" },
];
const MAX_BYTES = 192 * 1024;
async function check(target) {
  try {
    const response = await fetch(target.url, {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": "YiHot-source-evaluation/0.1 (no full-text collection)", accept: "application/rss+xml, application/atom+xml, text/html, application/xml;q=0.9, */*;q=0.5" },
      signal: AbortSignal.timeout(12000),
    });
    const chunks = []; let size = 0;
    const reader = response.body?.getReader();
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          const take = Math.min(MAX_BYTES - size, value.length);
          if (take > 0) chunks.push(value.slice(0, take));
          size += take;
          if (size >= MAX_BYTES) break;
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    }
    const combined = new Uint8Array(size);
    let off = 0; for (const chunk of chunks) { combined.set(chunk, off); off += chunk.length; }
    const body = new TextDecoder().decode(combined);
    const raw = body.slice(0, 4096).replace(/^\uFEFF/, "").replace(/^<\?xml[^>]*>\s*/i, "").replace(/^<!--.*?-->\s*/s, "");
    const isFeed = /^<(?:rss(?:\s|>)|feed(?:\s|>)|rdf:RDF(?:\s|>))/i.test(raw);
    const items = isFeed ? (body.match(/<(?:item|entry)(?:\s|>)/gi) ?? []).length : 0;
    const pageHasFeedLink = !isFeed && /<link\b[^>]*type=["']application\/(?:rss\+xml|atom\+xml|feed\+json)/i.test(body);
    const classification = !response.ok ? "HTTP_ERROR"
      : isFeed ? (items ? "FEED_WITH_ENTRIES" : "FEED_NO_ENTRIES_IN_SAMPLE")
      : /text\/html|<!doctype html|<html\b/i.test((response.headers.get("content-type") ?? "") + body.slice(0, 200)) ? "HTML_NOT_FEED"
      : "UNRECOGNIZED_FORMAT";
    return {
      name: target.name, requested: target.url, expected: target.expected,
      status: response.status, response_url: response.url,
      content_type: response.headers.get("content-type") ?? "",
      classification, sample_feed_entries: items,
      rss_declared_in_html: pageHasFeedLink,
      sample_bytes: size,
      approved: false,
    };
  } catch (error) {
    return { name: target.name, requested: target.url, expected: target.expected,
      classification: "REQUEST_FAILED", error: String(error).slice(0, 240), approved: false };
  }
}
const results = await Promise.all(targets.map(check));
for (const row of results) console.log(JSON.stringify(row));
console.log(JSON.stringify({
  probed_at: new Date().toISOString(), requested: results.length,
  xml_feeds_with_entries: results.filter(x => x.classification === "FEED_WITH_ENTRIES").length,
  caveat: "Snapshot from GitHub runner, not Tencent host or permission check; no sources enabled.",
}));
