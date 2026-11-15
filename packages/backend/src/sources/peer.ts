// 姊妹站信源（kind: "peer"）：不联网，只把「邻域」已经抓回来的条目转成候选。
//
// 为什么单独一种 kind，而不是给每家配一条 json_list / rss：
//   1. 这 8 家的出口形态不一样——6 家有标准 /api/v1，2 家只有 RSS，大厂观察只有日报接口。
//      `peers/refresh.ts` 里已经写好三路降级、状态表和去重，重配一遍等于把同一件事做两次，
//      而且 json_list 表达不了「日报 → sections[].items[]」这种嵌套结构。
//   2. 同一条内容常被多家同时选中（同一篇 Nature 论文），只有走同一条入库路径才能按 URL 去重。
//   3. 这里零网络请求：抓取频率与刷新节奏完全解耦，采集失败不会连带让信源健康度变红。
//
// 过滤不在这里做。是否属于本行业，交给 `ingestNoiseFilter.requireMarkers`（见 collect.ts 的
// noiseFiltered）：词表没命中就在花钱分析之前丢掉；命中的才进正常流水线，由模型自己判断值不值得入选。

import { sql } from "../db.ts";
import { FetchError, type Candidate, type SourceRow } from "./types.ts";

interface PeerRow {
  item_id: string;
  title: string;
  summary: string;
  reason: string | null;
  category: string | null;
  score: number | null;
  source_name: string | null;
  item_url: string;
  original_url: string | null;
  published_at: Date | null;
  fetched_at: Date;
}

/**
 * 把某个姊妹站的存量条目转成候选。
 *
 * 窗口按 `coalesce(published_at, fetched_at)` 取最近 windowDays 天：对端条目常在发布后一两天才被
 * 它们选中，窗口太紧会漏；太宽则每次都要让下游对着上百条已入库的 URL 做一次去重查询。14 天是实测
 * 的平衡点（单站最多约 95 条）。
 */
export async function fetchPeer(source: SourceRow): Promise<{ candidates: Candidate[]; detail: Record<string, unknown> }> {
  const peerId = typeof source.config.peerId === "string" ? source.config.peerId.trim() : "";
  if (!peerId) throw new FetchError("peer: 缺少 peerId");
  const windowDays = Math.max(1, Math.min(120, Number(source.config.windowDays ?? 14)));

  const rows = await sql<PeerRow[]>`
    SELECT item_id, title, summary, reason, category, score, source_name, item_url, original_url, published_at, fetched_at
    FROM peer_items
    WHERE peer_id = ${peerId}
      AND coalesce(published_at, fetched_at) >= now() - (${windowDays} || ' days')::interval
    ORDER BY coalesce(published_at, fetched_at) DESC
    LIMIT 200`;

  const candidates: Candidate[] = [];
  for (const r of rows) {
    // 条目页是「它那边」的页面，原文才是内容本身：能用原文就用原文，拿不到再退回条目页。
    // 两条链接都缺的条目直接丢——没有可回溯来源的东西不该进池子。
    const url = (r.original_url ?? "").trim() || (r.item_url ?? "").trim();
    const title = (r.title ?? "").trim();
    if (!url || !title) continue;
    candidates.push({
      url,
      title,
      excerpt: (r.summary ?? "").trim().slice(0, 1200) || null,
      author: r.source_name ?? null,
      publishedAt: r.published_at ?? r.fetched_at,
      // 对端给的是完整时间戳（不是只到日的日期），所以按 datetime 入库，不需要日期补齐那套。
      publishedAtPrecision: "datetime",
      raw: {
        peer: {
          id: peerId,
          itemId: r.item_id,
          itemUrl: r.item_url,
          score: r.score,
          category: r.category,
          // 对端编辑写的入选理由。只留档，不参与本站评分：两边的尺子不是同一把。
          reason: r.reason,
        },
      },
    });
  }

  return {
    candidates,
    detail: { peerId, windowDays, rows: rows.length, usable: candidates.length },
  };
}
