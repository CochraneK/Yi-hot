// 来源内容的更新时间与 RSS 抓取成功分别评价；不使用 fetched_at 冒充发表时间。
import type { PeerSite } from "@aihot/industry/peers";

export type PeerFreshness = "recent" | "stale" | "unknown" | "reference";
const DAY_MS = 86_400_000;

/** UI 提示阈值：普通资讯 7 天，明确的周报 21 天。 */
export function peerFreshness(
  peer: Pick<PeerSite, "tier" | "strategy" | "cadence">,
  publishedAt: string | Date | null,
  now = new Date(),
): PeerFreshness {
  if (peer.tier !== "official" || peer.strategy === "link" || peer.strategy === "none") return "reference";
  if (!publishedAt) return "unknown";
  const published = new Date(publishedAt).getTime();
  const checked = now.getTime();
  if (!Number.isFinite(published) || !Number.isFinite(checked) || published > checked + DAY_MS) return "unknown";
  return checked - published <= (peer.cadence === "weekly" ? 21 : 7) * DAY_MS ? "recent" : "stale";
}
