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

/** 使用价值分层。family 与 tier 正交，原行业 group 不变。 */
export interface NeighborhoodFamily {
  id: "same" | "other";
  label: string;
  sites: PeerDirectoryEntry[];
  groups: PeerGroupView[];
}

export interface NeighborhoodSection {
  id: "official" | "resource" | "candidate";
  label: string;
  note: string;
  sites: PeerDirectoryEntry[];
  groups: PeerGroupView[];
  /** 正式邻域下先按技术谱系，再按行业；其他两层不重复分类。 */
  families?: NeighborhoodFamily[];
}

export function groupNeighborhoods(sites: PeerDirectoryEntry[]): NeighborhoodSection[] {
  const kinds: Array<Pick<NeighborhoodSection, "id" | "label" | "note">> = [
    { id: "official", label: "正式邻域", note: "收录有独立领域价值的行业资讯，按同系与其他分区。同步情况和内容可能重叠仅作提示。" },
    { id: "resource", label: "实用资源", note: "官方机会、科研数据库与专业资料，不要求按新闻节奏更新。" },
    { id: "candidate", label: "候选信息", note: "核心内容需付费、产品演示、静态快照或已关闭的站点；重复内容和同步状态不影响收录资格。" },
  ];
  return kinds.flatMap(kind => {
    const entries = sites.filter(s =>
      (s.tier === "official" || s.tier === "resource" ? s.tier : "candidate") === kind.id);

    if (!entries.length) return [];
    const families: NeighborhoodFamily[] | undefined = kind.id === "official"
      ? ([
          { id: "same" as const, label: "同系邻域" },
          { id: "other" as const, label: "其他邻域" },
        ].flatMap(family => {
          const matching = entries.filter(site => (site.family === "same" ? "same" : "other") === family.id);
          return matching.length ? [{ ...family, sites: matching, groups: groupSites(matching) }] : [];
        }))
      : undefined;
    return [{ ...kind, sites: entries, groups: groupSites(entries), families }];
  });
}
