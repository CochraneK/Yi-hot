import type { PeerDirectoryEntry } from "@aihot/contracts/peers";
import { PEER_GROUP_FALLBACK, PEER_GROUPS, PEER_SITES } from "@aihot/industry/peers";

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

/** 
 * 页面级查找：兼容站名、方向说明、行业标签以及同系/其他属性。
 * 不做网络搜索，不修改目录顺序，也不改变分类和采集策略。
 */
export function filterPeerSites(sites: PeerDirectoryEntry[], query: string): PeerDirectoryEntry[] {
  const words = query.normalize("NFKC").trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return sites;
  const groups = new Map<string, string>(PEER_GROUPS.map(g => [g.id, `${g.label} ${g.note}`]));
  return sites.filter(site => {
    const family = site.family === "same" ? "同系邻域" : "其他邻域";
    const tier = site.tier === "resource" ? "实用资源" : site.tier === "candidate" ? "候选信息" : "正式邻域";
    const haystack = [site.name, site.note, groups.get(site.group) ?? "", family, tier]
      .join(" ").normalize("NFKC").toLocaleLowerCase();
    return words.every(word => haystack.includes(word));
  });
}

/**
 * 「邻域」展示纯聚合站，而不是机构官网、公开数据库或普通 RSS 采集源。
 * 后端使用同一登记表过滤；这里再兜底处理短时缓存的旧 API 数据。
 * 候选与正式站按同一个 group 排列，tier 只是卡片上的状态标记。
 */
const sourceOnlyIds = new Set(PEER_SITES.filter(s => s.directoryVisible === false).map(s => s.id));

export function isNeighborhoodAggregator(site: PeerDirectoryEntry): boolean {
  return site.tier !== "resource" && !sourceOnlyIds.has(site.id);
}

export function groupNeighborhoods(sites: PeerDirectoryEntry[]): PeerGroupView[] {
  return groupSites(sites.filter(isNeighborhoodAggregator));
}
