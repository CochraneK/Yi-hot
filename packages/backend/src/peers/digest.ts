// 「邻域」的取稿：从本地留档里挑出本期要引用的几条。
//
// 去重口径和主内容一致：日报每天要给新的，所以排除前几期日报已用过的；周报、月报要的是
// 「这一段时间最重的」，允许与日报重复（就像主稿的周报会重述一周的重要事件），只排除自己的上一期，
// 免得连着两期一模一样。
import { sql } from "../db.ts";
import { PEER_SITES, PEER_LIMITS } from "@aihot/industry/peers";
import { interleavePicks, rotationOrder, type PeerCandidate } from "./select.ts";
import type { ReportKind } from "@aihot/contracts/site";

export interface PeerPick extends PeerCandidate {
  peerName: string;
  peerUrl: string;
  title: string;
  summary: string;
  reason: string | null;
  category: string | null;
  publishedAt: string | null;
  url: string;
  sourceName: string | null;
  originalUrl: string | null;
}

/** 窗口之前多看几天：对端条目常在发布后一两天才被它们选中，卡死窗口会漏掉。 */
const SLACK_DAYS: Record<ReportKind, number> = { daily: 2, weekly: 3, monthly: 5 };
/** 回看期数：日报看前 9 期（约 3 天的名额），周报前 3 期，月报前 1 期。 */
const RECENT_ISSUES: Record<ReportKind, number> = { daily: 9, weekly: 3, monthly: 1 };

interface Row {
  peer_id: string;
  item_id: string;
  peer_name: string;
  peer_url: string;
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
 * 一次读完近期各期，同时得到两样东西：
 *   used   —— 已经引用过的条目，本期不再出现（日报每天要给新的）
 *   count  —— 每家站近期被引用的次数，用来决定「这次轮到谁」
 *
 * 日报只有 3 个名额而登记了 10 家站，若按登记顺序取，第 4 家以后永远排不上，
 * 版块会退化成「每天都是同样三个行业」。按次数升序轮换，9 家 3 个名额正好三天轮一遍。
 */
async function recentIssues(kind: ReportKind, beforeKey: string): Promise<{ used: Set<string>; count: Map<string, number> }> {
  const rows = await sql<{ content: Record<string, any> }[]>`
    SELECT content FROM reports
    WHERE kind = ${kind} AND key < ${beforeKey}
    ORDER BY key DESC LIMIT ${RECENT_ISSUES[kind]}`;
  const used = new Set<string>();
  const count = new Map<string, number>();
  for (const r of rows) {
    for (const item of r.content?.peers?.items ?? []) {
      if (item?.key) used.add(String(item.key));
      const id = String(item?.peerId ?? "");
      if (id) count.set(id, (count.get(id) ?? 0) + 1);
    }
  }
  return { used, count };
}

/**
 * 本期「邻域」条目。任何一步失败都返回空数组：这个版块可以缺席，但绝不能让当期报告生不出来。
 *
 * `excludeUrls` 是本期正文已经用掉的原文链接。姊妹站条目现在也会作为信源进主流水线
 * （sources/peer.ts），同一条内容既被正文选中、又被邻域摘编的话，读者会在同一页看到两遍。
 */
export async function peerDigest(kind: ReportKind, key: string, start: Date, end: Date, excludeUrls?: Set<string>): Promise<PeerPick[]> {
  const limit = PEER_LIMITS[kind];
  try {
    const from = new Date(start.getTime() - SLACK_DAYS[kind] * 86_400_000);
    const [rows, recent] = await Promise.all([
      sql<Row[]>`
        SELECT peer_id, item_id, peer_name, peer_url, title, summary, reason, category, score,
               source_name, item_url, original_url, published_at, fetched_at
        FROM peer_items
        WHERE coalesce(published_at, fetched_at) >= ${from}
          AND coalesce(published_at, fetched_at) < ${end}
        ORDER BY peer_id, score DESC NULLS LAST, coalesce(published_at, fetched_at) DESC`,
      recentIssues(kind, key),
    ]);
    if (rows.length === 0) return [];

    const groups = new Map<string, PeerPick[]>();
    for (const r of rows) {
      // 正文用过的原文不再进邻域：同一页出现两遍比少一条更糟。
      if (excludeUrls && ((r.original_url && excludeUrls.has(r.original_url)) || excludeUrls.has(r.item_url))) continue;
      const pick: PeerPick = {
        key: `${r.peer_id}:${r.item_id}`,
        peerId: r.peer_id,
        score: r.score,
        publishedAt: r.published_at ? r.published_at.toISOString() : null,
        peerName: r.peer_name,
        peerUrl: r.peer_url,
        title: r.title,
        summary: r.summary,
        reason: r.reason,
        category: r.category,
        url: r.item_url,
        sourceName: r.source_name,
        originalUrl: r.original_url,
      };
      const list = groups.get(r.peer_id) ?? [];
      list.push(pick);
      groups.set(r.peer_id, list);
    }
    // 出场顺序：近期被引用次数少的先上，同次数按登记顺序。这样名额少的时候不会总是同几家。
    const order = rotationOrder(PEER_SITES.map((p) => p.id), recent.count);
    return interleavePicks(groups, order, limit, recent.used);
  } catch (error) {
    console.error("[peers] 取稿失败，本期不出邻域", error);
    return [];
  }
}
