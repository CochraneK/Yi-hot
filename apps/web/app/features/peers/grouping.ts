import type { PeerDirectoryEntry } from "@aihot/contracts/peers";
import { PEER_GROUP_FALLBACK, PEER_GROUPS } from "@aihot/industry/peers";

export interface PeerGroupView {
  id: string;
  label: string;
  note: string;
  sites: PeerDirectoryEntry[];
}

/**
 * 把目录里的站点按登记表的 PEER_GROUPS 顺序归堆。
 *
 * 三条规矩，都是为了让页面以后加站时不用再动这里：
 *   1. 组顺序由 PEER_GROUPS 决定，不由站点顺序决定——否则新加一家站就会把整页顺序打乱；
 *   2. 空组不出现：一家站全部同步失败时，不留一个只有标题的空段落；
 *   3. 填错或漏填 group 的落进「其他」，不静默丢卡（卡片消失比归类不准更难查）。
 */
export function groupSites(sites: PeerDirectoryEntry[]): PeerGroupView[] {
  const buckets = new Map<string, PeerDirectoryEntry[]>();
  for (const s of sites) {
    const key = s.group || PEER_GROUP_FALLBACK.id;
    const list = buckets.get(key);
    if (list) list.push(s);
    else buckets.set(key, [s]);
  }

  const views: PeerGroupView[] = [];
  for (const g of PEER_GROUPS) {
    const list = buckets.get(g.id);
    if (!list?.length) continue;
    views.push({ id: g.id, label: g.label, note: g.note, sites: list });
    buckets.delete(g.id);
  }

  const rest = [...buckets.values()].flat();
  if (rest.length) {
    views.push({ id: PEER_GROUP_FALLBACK.id, label: PEER_GROUP_FALLBACK.label, note: PEER_GROUP_FALLBACK.note, sites: rest });
  }
  return views;
}

/** 使用价值分层。family 与 tier 正交，原行业 group 不变。 */
export interface NeighborhoodSection {
  id: "official" | "resource" | "candidate";
  label: string;
  note: string;
  sites: PeerDirectoryEntry[];
  groups: PeerGroupView[];
}

export function groupNeighborhoods(sites: PeerDirectoryEntry[]): NeighborhoodSection[] {
  const kinds: Array<Pick<NeighborhoodSection, "id" | "label" | "note">> = [
    { id: "official", label: "正式邻域", note: "持续提供行业资讯，优先 RSS / API；同系与其他来源照常保留。" },
    { id: "resource", label: "实用资源", note: "官方机会、科研数据库与专业资料，不要求按新闻节奏更新。" },
    { id: "candidate", label: "候选信息", note: "有收费限制、静态快照、内容重合或尚未验证持续同步的线索，不作为实时新闻推荐。" },
  ];
  return kinds.flatMap(kind => {
    const entries = sites.filter(s =>
      (s.tier === "official" || s.tier === "resource" ? s.tier : "candidate") === kind.id);
    return entries.length ? [{ ...kind, sites: entries, groups: groupSites(entries) }] : [];
  });
}
