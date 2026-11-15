// 「邻域」友情页的数据形状（/api/site/peers → /peers）。
//
// 一页纸回答三件事：这些站各是什么方向、现在还活着没有、它最近在关心什么。
// 不给分数、不给排序权重——它们的评分只在各自站内可比（见 industry/peers.ts）。

export interface PeerDirectoryEntry {
  id: string;
  name: string;
  /** 站点首页。条目链接一律用条目自己的 URL。 */
  url: string;
  /** 一句话方向。来自 industry/peers.ts，改文案不用改页面。 */
  note: string;
  /** 分组 id（industry/peers.ts 的 PeerGroupId）。页面拿它归堆，标签与顺序也来自那边。 */
  group: string;
  /** 同系邻域 / 其他邻域。旧数据未提供时前端归入“其他邻域”，不丢站。 */
  family?: "same" | "other";
  /** 展示层，独立于开源谱系、采集策略。 */
  tier?: "official" | "resource" | "candidate";
  /** 最近内容相对当前时间的状态，并非接口健康检查。 */
  freshness?: "recent" | "stale" | "unknown" | "reference";
  /** 这家站的身份色（#rrggbb）。目录页的顶条与首字徽标用它，站与站之间靠颜色区分。 */
  accent: string;
  /** 仅提供公开站点入口；不请求第三方 RSS/API，也不会出现在日报轮转。 */
  browseOnly?: boolean;
  /** 最近一次抓取是否成功；从没抓过是 null（不是失败）。 */
  ok: boolean | null;
  /** 最近一次抓取时间，ISO 串。 */
  checkedAt: string | null;
  /** 库里留档的条目数（近 90 天）。 */
  items: number;
  /** 它最近选中的一条，用来告诉读者「这家现在在关心什么」。 */
  latest: {
    title: string;
    /** 原文地址；拿不到原文时退回它那边的条目页。 */
    url: string;
    publishedAt: string | null;
    score: number | null;
    category: string | null;
  } | null;
}

export interface PeerDirectory {
  sites: PeerDirectoryEntry[];
  /** 所有站合计留档条目数（近 90 天）。 */
  totalItems: number;
  /** 最近一次任一站抓取成功的时间。 */
  updatedAt: string | null;
}
