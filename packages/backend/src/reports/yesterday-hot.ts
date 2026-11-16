// Frozen, non-AI ranking metadata for one Beijing calendar day.
// An empty snapshot stays empty; "latest" rankings must never be reused as yesterday.
import type { ReportYesterdayHot } from "@aihot/contracts/site";
import { addDays, beijingMidnight } from "@aihot/contracts/time";
import { sql } from "../db.ts";

export type StoredYesterdayHot = ReportYesterdayHot;

interface RankingArticle {
  rank: number;
  storyPublicId: string;
  title: string;
  representativeItemId: string | null;
  representativeSource: string | null;
  heat: number;
}

export function yesterdayRankingWindow(day: string): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day + "T00:00:00Z"))) {
    throw new Error("Invalid report hot day: " + day);
  }
  return { start: beijingMidnight(day), end: beijingMidnight(addDays(day, 1)) };
}

/** A period-end snapshot, not a leaderboard of items first published that day.
 * The stored rank and heat are the ranking's values at its computedAt time.
 */
export function normalizeYesterdayHot(day: string, computedAt: string, rows: RankingArticle[]): StoredYesterdayHot | null {
  const { start, end } = yesterdayRankingWindow(day);
  const timestamp = Date.parse(computedAt);
  if (!Number.isFinite(timestamp) || timestamp < start.getTime() || timestamp >= end.getTime() || !Array.isArray(rows)) return null;
  const seen = new Set<string>();
  const entries: StoredYesterdayHot["entries"] = [];
  for (const row of [...rows].sort((a,b) => a.rank - b.rank)) {
    if (entries.length >= 10) break;
    if (!Number.isInteger(row.rank) || row.rank < 1 || row.rank > 100 ||
        typeof row.title !== "string" || !row.title.trim() ||
        typeof row.storyPublicId !== "string" || !row.storyPublicId ||
        typeof row.representativeItemId !== "string" || !row.representativeItemId ||
        seen.has(row.storyPublicId)) continue;
    seen.add(row.storyPublicId);
    entries.push({
      rank: row.rank,
      storyPublicId: row.storyPublicId,
      itemId: row.representativeItemId,
      title: row.title,
      sourceName: typeof row.representativeSource === "string" ? row.representativeSource : null,
      heat: Number.isFinite(Number(row.heat)) ? Number(row.heat) : null,
    });
  }
  return entries.length ? { day, computedAt, entries } : null;
}

/** Read only historical PUBLISHED rankings in [day 00:00, next day 00:00) Beijing time.
 * No third-party API calls or model usage, and no lookback to a different day.
 * Hot rankings are retained for ~30 days; old issues with no snapshot omit the block.
 */
export async function yesterdayHotForReport(day: string): Promise<StoredYesterdayHot | null> {
  const { start, end } = yesterdayRankingWindow(day);
  const [row] = await sql<{ computed_at: Date; entries: RankingArticle[] }[]>`
    SELECT computed_at, entries FROM hot_rankings
    WHERE published AND computed_at >= ${start} AND computed_at < ${end}
    ORDER BY computed_at DESC, id DESC LIMIT 1`;
  if (!row) return null;
  return normalizeYesterdayHot(day, row.computed_at.toISOString(), row.entries);
}

/** Public read checks the current availability, including post-publication withdrawals.
 * Missing publication records are excluded (unlike legacy historic text citations).
 */
export function publicYesterdayHot(
  raw: StoredYesterdayHot | null | undefined,
  available: Map<string, { available: boolean }>,
): StoredYesterdayHot | null {
  if (!raw?.entries?.length) return null;
  const cleaned = normalizeYesterdayHot(raw.day, raw.computedAt, raw.entries.map(e => ({
    rank: e.rank, storyPublicId: e.storyPublicId, title: e.title,
    representativeItemId: e.itemId, representativeSource: e.sourceName, heat: e.heat ?? 0,
  })));
  if (!cleaned) return null;
  const entries = cleaned.entries.filter(e => available.get(e.itemId)?.available === true);
  return entries.length ? { ...cleaned, entries } : null;
}
