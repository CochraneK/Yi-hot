// 「邻域」友情页的读取层：登记表（industry/peers.ts）定顺序与文案，数据库只补状态与最近一条。
//
// 为什么以登记表为准而不是以 peer_items 为准：一家站抓取失败时表里没有新条目，若按数据表列，
// 它会在页面上凭空消失；按登记表列，卡片还在，只是标成「暂时读不到」。目录页要的是稳定，
// 不是实时反映数据量。
//
// 长期读不到（最近一次抓取失败、且 strategy 为 none）的不上台面：友情链接点进去是死链，
// 比少一家更难堪。这类站仍留在登记表里继续探测，站主恢复后自动回来。

import { sql } from "../db.ts";
import { PEER_SITES } from "@aihot/industry/peers";
import { peerFreshness } from "./freshness.ts";
import type { PeerDirectory, PeerDirectoryEntry } from "@aihot/contracts/peers";

interface StatusRow {
  peer_id: string;
  ok: boolean;
  checked_at: Date;
}

interface StatRow {
  peer_id: string;
  items: number;
}

interface LatestRow {
  peer_id: string;
  title: string;
  url: string;
  published_at: Date | null;
  score: number | null;
  category: string | null;
}

export async function loadPeerDirectory(): Promise<PeerDirectory> {
  const [statuses, stats, latest] = await Promise.all([
    sql<StatusRow[]>`SELECT peer_id, ok, checked_at FROM peer_status`,
    sql<StatRow[]>`
      SELECT peer_id, count(*)::int AS items
      FROM peer_items
      WHERE coalesce(published_at, fetched_at) > now() - interval '90 days'
      GROUP BY 1`,
    sql<LatestRow[]>`
      SELECT DISTINCT ON (peer_id) peer_id, title, coalesce(nullif(original_url, ''), item_url) AS url,
             published_at, score, category
      FROM peer_items
      ORDER BY peer_id, published_at DESC NULLS LAST, fetched_at DESC`,
  ]);

  const status = new Map(statuses.map((s) => [s.peer_id, s]));
  const counts = new Map(stats.map((s) => [s.peer_id, s.items]));
  const newest = new Map(latest.map((l) => [l.peer_id, l]));

  const sites: PeerDirectoryEntry[] = [];
  for (const p of PEER_SITES) {
    if (!p.enabled) continue;
    if (p.strategy === "none") continue;
    // Browsable links have no RSS/API. Do not infer failures or show fictitious article counts.
    // Keep a normal clickable directory card without joining peer_items or peer_status.
    if (p.strategy === "link") {
      sites.push({
        id: p.id, name: p.name, url: p.url, note: p.note,
        group: p.group, family: p.family, tier: p.tier, freshness: "reference", accent: p.accent, browseOnly: true,
        ok: null, checkedAt: null, items: 0, latest: null,
      });
      continue;
    }
    const st = status.get(p.id) ?? null;
    // 明确读不到的（最近一次失败）不上页面；从没查过的仍列出来，卡片上写「尚未同步」。
    if (st && !st.ok) continue;
    const l = newest.get(p.id) ?? null;
    sites.push({
      id: p.id,
      name: p.name,
      url: p.url,
      note: p.note,
      group: p.group,
      family: p.family,
      tier: p.tier,
      freshness: peerFreshness(p, l?.published_at ?? null),
      accent: p.accent,
      browseOnly: false,
      ok: st ? st.ok : null,
      checkedAt: st ? st.checked_at.toISOString() : null,
      items: counts.get(p.id) ?? 0,
      latest: l
        ? {
            title: l.title,
            url: l.url,
            publishedAt: l.published_at ? l.published_at.toISOString() : null,
            score: l.score,
            category: l.category,
          }
        : null,
    });
  }

  const totalItems = sites.reduce((n, s) => n + s.items, 0);
  const stamps = sites.map((s) => s.checkedAt).filter((x): x is string => !!x).sort();
  return { sites, totalItems, updatedAt: stamps.length ? stamps[stamps.length - 1] : null };
}
