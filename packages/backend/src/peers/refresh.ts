// 「邻域」的抓取：把姊妹站已经筛好、打好分、写好入选理由的条目读回本地留档。
//
// 这里没有模型调用，也没有付费回执——这不是我们的采集，只是**引用别人的成品索引**：
// 对方公开接口给的就是 标题 / 摘要 / 评分 / 理由 / 链接，我们原样存下来，读者点标题回原站读。
//
// 三级降级，每家站独立失败、互不影响：
//   1. /api/v1/items?mode=selected&window=7d  —— 最终形态，带 score 与 reason
//   2. /api/v1/dailies/latest                 —— 有的站关掉了 items 出口（大厂观察实测返回空）
//   3. /feed.xml                              —— 只有 RSS 的站（品牌AI外刊、AI4Math）
// 任何一级拿到 ≥1 条就停，不再往下试；三级都空就记一次失败，不影响当期报告。
//
// 只读，不写对方站任何数据。请求频次：每小时一轮、每家最多 3 次，全天不超过 300 次 GET。
import { sql } from "../db.ts";
import { guardedFetch } from "../lib/http-fetch.ts";
import { shortHash } from "../lib/ids.ts";
import { collapseWhitespace, stripTags, truncate } from "../lib/text.ts";
import { PEER_SITES, type PeerSite } from "@aihot/industry/peers";
import { XMLParser } from "fast-xml-parser";

/** 归一化后的一条引用。所有来源（items / dailies / rss）都映射成这个形状。 */
export interface RawPeerItem {
  id: string | null;
  title: string;
  summary: string;
  reason: string | null;
  category: string | null;
  score: number | null;
  publishedAt: string | null;
  sourceName: string | null;
  itemUrl: string;
  originalUrl: string | null;
}

const UA = "Mozilla/5.0 (compatible; YiHotBot/1.0; +https://yihot.cn/about)";
const TIMEOUT_MS = 20_000;
const MAX_BYTES = 3 * 1024 * 1024;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  cdataPropName: "#cdata",
  processEntities: true,
  htmlEntities: true,
  trimValues: true,
});

function text(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("#cdata" in o) return text(o["#cdata"]);
    if ("#text" in o) return text(o["#text"]);
  }
  return "";
}

function arr<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function isoOrNull(v: unknown): string | null {
  const s = text(v).trim();
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function clean(s: string, max: number): string {
  return truncate(collapseWhitespace(stripTags(s)), max, "…");
}

/** 对端站的条目 id 可能缺失（dailies / rss）。缺时用链接算稳定哈希，保证幂等。 */
function stableId(itemId: unknown, url: string): string {
  const id = text(itemId).trim();
  return id ? id : `h-${shortHash(url, 24)}`;
}

async function get(url: string): Promise<{ status: number; body: string }> {
  const res = await guardedFetch(url, {
    headers: { "user-agent": UA, accept: "application/json, application/xml, text/xml, */*" },
    timeoutMs: TIMEOUT_MS,
    maxBytes: MAX_BYTES,
    route: "egress",
  });
  return { status: res.status, body: res.text() };
}

/** 标准 /api/v1/items：字段最全（有 score、reason、publishedAt）。 */
export function parseItemsApi(json: unknown): RawPeerItem[] {
  const items = (json as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  const out: RawPeerItem[] = [];
  for (const raw of items) {
    const i = raw as Record<string, any>;
    const url = text(i?.links?.aihot);
    const title = text(i?.title).trim();
    if (!title || !url) continue;
    out.push({
      id: stableId(i?.id, url),
      title: truncate(collapseWhitespace(title), 300, "…"),
      summary: clean(text(i?.summary), 800),
      reason: text(i?.reason).trim() ? clean(text(i?.reason), 400) : null,
      category: text(i?.category).trim() || null,
      score: Number.isFinite(Number(i?.score)) ? Number(i.score) : null,
      publishedAt: isoOrNull(i?.publishedAt),
      sourceName: text(i?.source?.name).trim() || null,
      itemUrl: url,
      originalUrl: text(i?.links?.original).trim() || null,
    });
  }
  return out;
}

/** /api/v1/dailies/latest：没有 score / publishedAt，用日报日期推；结构是 sections[].items[]。 */
export function parseDailyApi(json: unknown): RawPeerItem[] {
  const report = (json as { report?: Record<string, any> })?.report;
  if (!report) return [];
  const date = String(report.date ?? "");
  // 对端的日报是「D 日 00:00Z 发布、涵盖 D-1 全天」，所以它的条目真实发布时间落在 D-1。
  // 直接写 D 日 00:00Z 会正好压在我们日报窗口的右边界上（窗口是 [D-1 08:00, D 08:00) 北京），
  // 被 `< end` 排除，表现为「这一家的条目永远晚一天」。回退一小时既落在它自己的窗口内，也落在我们的窗口内。
  const publishedAt = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(Date.parse(`${date}T00:00:00.000Z`) - 3_600_000).toISOString()
    : null;
  const out: RawPeerItem[] = [];
  for (const section of arr<Record<string, any>>(report.sections)) {
    for (const raw of arr<Record<string, any>>(section?.items)) {
      const url = text(raw?.links?.aihot);
      const title = text(raw?.title).trim();
      if (!title || !url) continue;
      out.push({
        id: stableId(null, url),
        title: truncate(collapseWhitespace(title), 300, "…"),
        summary: clean(text(raw?.summary), 800),
        reason: null,
        category: text(section?.label).trim() || null,
        score: null,
        publishedAt,
        sourceName: text(raw?.source?.name).trim() || null,
        itemUrl: url,
        originalUrl: text(raw?.links?.original).trim() || null,
      });
    }
  }
  return out;
}

/** RSS 2.0：description 里通常带 <p> 与「🔗 原文」，剥标签后取正文首段。 */
export function parseFeed(xml: string): RawPeerItem[] {
  let doc: any;
  try {
    doc = parser.parse(xml);
  } catch {
    return [];
  }
  const channel = doc?.rss?.channel ?? doc?.["rdf:RDF"] ?? doc?.feed;
  const entries = arr<Record<string, any>>(channel?.item ?? channel?.entry);
  const out: RawPeerItem[] = [];
  for (const raw of entries) {
    const title = text(raw?.title).trim();
    // Atom may publish multiple <link> tags (e.g. rel="self" and rel="alternate").
    // Prefer the human-readable article URL rather than a feed/self API endpoint.
    const links = Array.isArray(raw?.link) ? raw.link : [raw?.link];
    const chosen = links.find((l: any) => l && typeof l === "object" &&
      (!l["@rel"] || l["@rel"] === "alternate") && l["@href"]) ?? links[0];
    const link = chosen && typeof chosen === "object" ? text(chosen["@href"] ?? chosen) : text(chosen);
    const url = link.trim() || text(raw?.guid ?? raw?.id);
    if (!title || !url) continue;
    const body = text(raw?.description ?? raw?.summary ?? raw?.content);
    // 同框架的 RSS 在摘要尾部带一行「🔗 原文」；先把那个地址取出来，再连行一起剥掉，
    // 否则摘要会变成「…… 改订 /feed/full.xml」这类噪声。
    const originalUrl = /🔗[^<]*<a\s[^>]*href="([^"]+)"/i.exec(body)?.[1] ?? null;
    const summary = clean(body.replace(/🔗[\s\S]*$/, ""), 800);
    out.push({
      id: stableId(text(raw?.guid).trim() && text(raw?.guid).trim() !== url ? text(raw?.guid) : null, url),
      title: truncate(collapseWhitespace(title), 300, "…"),
      summary,
      reason: null,
      category: null,
      score: null,
      publishedAt: isoOrNull(raw?.pubDate ?? raw?.published ?? raw?.updated),
      sourceName: null,
      itemUrl: url,
      originalUrl,
    });
  }
  return out;
}

const base = (u: string) => u.replace(/\/+$/, "");

/** RSS feeds need not be /feed.xml: only allow a safe absolute path on the peer's own HTTPS host. */
export function peerFeedUrl(peer: Pick<PeerSite, "url" | "feedPath">): string {
  if (!peer.feedPath) return `${base(peer.url)}/feed.xml`;
  if (!/^\/(?!\/)(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\/?$/.test(peer.feedPath) ||
      peer.feedPath.split("/").some((segment) => segment === ".." || segment === ".")) {
    throw new Error("Invalid peer RSS path");
  }
  const url = new URL(peer.feedPath, peer.url);
  if (url.protocol !== "https:" || url.origin !== new URL(peer.url).origin) {
    throw new Error("Peer feed must remain on the peer's HTTPS host");
  }
  return url.toString();
}

/** 单家站：按 strategy 走三级降级，返回第一个拿到内容的通道。 */
export async function fetchPeer(peer: PeerSite): Promise<{ via: string; items: RawPeerItem[]; error: string | null }> {
  if (!peer.enabled || peer.strategy === "none" || peer.strategy === "link") return { via: "none", items: [], error: null };
  const attempts: Array<{ via: string; url: string; parse: (body: string) => RawPeerItem[] }> = [];
  if (peer.strategy === "api") {
    attempts.push({
      via: "items",
      url: `${base(peer.url)}/api/v1/items?mode=selected&window=7d&limit=100`,
      parse: (body) => parseItemsApi(JSON.parse(body)),
    });
    attempts.push({
      via: "daily",
      url: `${base(peer.url)}/api/v1/dailies/latest`,
      parse: (body) => parseDailyApi(JSON.parse(body)),
    });
  }
  attempts.push({ via: "rss", url: peerFeedUrl(peer), parse: parseFeed });

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const { status, body } = await get(attempt.url);
      if (status !== 200) {
        errors.push(`${attempt.via}:HTTP ${status}`);
        continue;
      }
      const items = attempt.parse(body);
      if (items.length > 0) return { via: attempt.via, items, error: null };
      errors.push(`${attempt.via}:empty`);
    } catch (error) {
      errors.push(`${attempt.via}:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { via: "none", items: [], error: errors.join(" | ").slice(0, 500) };
}

/**
 * 刷新全部姊妹站。每小时一次；单家失败只记状态，不抛错——「邻域」永远不该拖住当期报告。
 * 保留 120 天：够月报回溯，也不会让这张表无限长。
 */
export async function refreshPeers(): Promise<{ peers: number; ok: number; items: number }> {
  let ok = 0;
  let written = 0;
  for (const peer of PEER_SITES) {
    if (!peer.enabled || peer.strategy === "link" || peer.strategy === "none") continue;
    const result = await fetchPeer(peer);
    if (result.items.length > 0) ok += 1;
    try {
      await sql.begin(async (tx) => {
        if (result.items.length > 0) {
          const rows = result.items.map((i) => ({
            peer_id: peer.id,
            item_id: i.id ?? stableId(null, i.itemUrl),
            peer_name: peer.name,
            peer_url: peer.url,
            title: i.title,
            summary: i.summary,
            reason: i.reason,
            category: i.category,
            score: i.score,
            source_name: i.sourceName,
            item_url: i.itemUrl,
            original_url: i.originalUrl,
            published_at: i.publishedAt,
          }));
          await tx`
            INSERT INTO peer_items ${tx(rows,
              "peer_id", "item_id", "peer_name", "peer_url", "title", "summary", "reason",
              "category", "score", "source_name", "item_url", "original_url", "published_at")}
            ON CONFLICT (peer_id, item_id) DO UPDATE SET
              title = EXCLUDED.title,
              summary = EXCLUDED.summary,
              reason = coalesce(EXCLUDED.reason, peer_items.reason),
              category = coalesce(EXCLUDED.category, peer_items.category),
              score = coalesce(EXCLUDED.score, peer_items.score),
              source_name = coalesce(EXCLUDED.source_name, peer_items.source_name),
              item_url = EXCLUDED.item_url,
              original_url = coalesce(EXCLUDED.original_url, peer_items.original_url),
              published_at = coalesce(EXCLUDED.published_at, peer_items.published_at),
              fetched_at = now()`;
          written += rows.length;
        }
        await tx`
          INSERT INTO peer_status (peer_id, ok, items, via, error, checked_at)
          VALUES (${peer.id}, ${result.items.length > 0}, ${result.items.length}, ${result.via}, ${result.error}, now())
          ON CONFLICT (peer_id) DO UPDATE SET
            ok = EXCLUDED.ok, items = EXCLUDED.items, via = EXCLUDED.via,
            error = EXCLUDED.error, checked_at = EXCLUDED.checked_at`;
      });
    } catch (error) {
      // 写库失败只影响这一家这一轮，下一轮会重来。
      console.error(`[peers] ${peer.id} 落库失败`, error);
    }
  }
  await sql`DELETE FROM peer_items WHERE fetched_at < now() - interval '120 days'`;
  return { peers: PEER_SITES.filter((p) => p.enabled && p.strategy !== "none" && p.strategy !== "link").length, ok, items: written };
}

/** 后台查看用：每家站最近一次的结果。 */
export async function peerStatus(): Promise<Array<{ peer_id: string; ok: boolean; items: number; via: string | null; error: string | null; checked_at: Date }>> {
  return sql`SELECT peer_id, ok, items, via, error, checked_at FROM peer_status ORDER BY peer_id`;
}
