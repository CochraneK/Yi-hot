// 「邻域」的选稿规则，纯函数，便于单独测试。
//
// 关键约束：各姊妹站的 score 是各自模型的输出，尺子不同（PsyHOT 的 78 分和 FilmTechNews 的 78 分
// 不是一回事）。所以**不能全局按分数排序**——那样会有一个站把版面占满。正确做法是先在各站内部排序，
// 再按站轮流取：所有站的第 1 名都取完，才轮到第 2 名。这样默认就是「每家各一条」的均衡版面。
export interface PeerCandidate {
  /** peer_id:item_id，用于跨期去重。 */
  key: string;
  peerId: string;
  score: number | null;
  /** ISO 时间；缺时按最旧处理。 */
  publishedAt: string | null;
}

/** 站内排序：分数高的在前，没有分数的按时间新的在前，两者都没有的垫底。 */
export function sortWithinPeer<T extends PeerCandidate>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const sa = a.score ?? -1;
    const sb = b.score ?? -1;
    if (sa !== sb) return sb - sa;
    return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
  });
}

/**
 * 出场顺序：近期被引用次数少的先上，次数相同按登记顺序。
 *
 * 名额有限时这条规则比登记顺序重要得多——日报只有 3 个位置而登记了 10 家站，按登记顺序取，
 * 第 4 家以后永远排不上，读者看到的就是「每天同样三个行业」。按次数轮换，9 家 3 个名额
 * 正好三天轮一遍，而且某家断更几天也不会因此被永久跳过（它次数少，回来就排前面）。
 */
export function rotationOrder(ids: string[], counts: Map<string, number>): string[] {
  return ids
    .map((id, i) => ({ id, i }))
    .sort((a, b) => (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0) || a.i - b.i)
    .map((x) => x.id);
}

/**
 * 轮流取稿。
 *
 * @param groups 按 peerId 分好组的候选（组内顺序会被本函数重新排）
 * @param order  出场顺序（由 rotationOrder 给出，也可是登记顺序）
 * @param limit  本期条数
 * @param used   近期已用过的 key，命中即跳过（跨期不重复）
 */
export function interleavePicks<T extends PeerCandidate>(
  groups: Map<string, T[]>,
  order: string[],
  limit: number,
  used: Set<string> = new Set(),
): T[] {
  if (limit <= 0) return [];
  const queues = new Map<string, T[]>();
  for (const [peerId, items] of groups) {
    const fresh = sortWithinPeer(items).filter((i) => !used.has(i.key));
    if (fresh.length) queues.set(peerId, fresh);
  }
  // 登记表里没有的站（理论上不会发生，但配置删站时会短暂出现）排在最后，不丢内容。
  const ordered = [
    ...order.filter((id) => queues.has(id)),
    ...[...queues.keys()].filter((id) => !order.includes(id)),
  ];
  const out: T[] = [];
  for (let round = 0; out.length < limit; round += 1) {
    let taken = 0;
    for (const peerId of ordered) {
      if (out.length >= limit) break;
      const next = queues.get(peerId)?.[round];
      if (!next) continue;
      out.push(next);
      taken += 1;
    }
    // 一轮下来一条都没取到，说明所有队列都空了。
    if (taken === 0) break;
  }
  return out;
}
