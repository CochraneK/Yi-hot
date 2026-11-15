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
