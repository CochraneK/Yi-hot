import { beijingDate, beijingTime, beijingWeekday } from "@aihot/contracts/time";

export { beijingDate, beijingTime, beijingWeekday };

export function dayLabel(date: string, today: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const base = `${m}月${d}日`;
  if (date === today) return `今天 · ${base}`;
  const diff = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000);
  if (diff === 1) return `昨天 · ${base}`;
  if (y !== Number(today.slice(0, 4))) return `${y}年${base}`;
  return base;
}

export function relativeTime(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "刚刚";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} 天前`;
  return beijingDate(iso);
}

export function fullDateTime(iso: string): string {
  return `${beijingDate(iso)} ${beijingTime(iso)}`;
}

export interface FeedTimeDisplay {
  /** The article's own time, and the datetime attribute. Date-only articles sit at Beijing midnight of their own day. */
  at: string;
  label: "原文发表" | "收录";
  /** The source only states a day (government listings): show the date, never a made-up clock time. */
  dateOnly: boolean;
  /**
   * The moment the list's clock column prints: the article's own time, or our collection time.
   * A date-only article is listed where its collection moment falls inside its own day, so the list
   * still reads newest-first — the sort key in the timeline is this same moment.
   */
  clockAt: string;
  /** What that clock is, said under it: "收录" when it is not the article's own time. */
  clockLabel: "收录" | null;
}

/**
 * What the feed shows for an article's time. A source that states only a day keeps that day; borrowing
 * the collection clock would present a fetch time as the publication time. "收录" is reserved for
 * articles whose own date is unknown.
 */
export function feedDisplayAt(publishedAt: string | null, discoveredAt: string, timelineAt: string, precision: "date" | "datetime" = "datetime"): FeedTimeDisplay {
  const collected = timelineAt || discoveredAt;
  if (!publishedAt) return { at: collected, label: "收录", dateOnly: false, clockAt: collected, clockLabel: "收录" };
  if (precision === "date") return { at: `${beijingDate(publishedAt)}T00:00:00+08:00`, label: "原文发表", dateOnly: true, clockAt: discoveredAt, clockLabel: "收录" };
  if (beijingTime(publishedAt) === "00:00" && beijingTime(discoveredAt) !== "00:00") return { at: discoveredAt, label: "收录", dateOnly: false, clockAt: discoveredAt, clockLabel: "收录" };
  return { at: publishedAt, label: "原文发表", dateOnly: false, clockAt: publishedAt, clockLabel: null };
}

/** "2026年10月18日" for day-precision sources, where no clock time exists. */
export function feedDateLabel(iso: string): string {
  const [y, m, d] = beijingDate(iso).split("-").map(Number) as [number, number, number];
  return `${y}年${m}月${d}日`;
}

/** "9月24日 10:51" (Beijing), for lists that span days. */
export function monthDayTime(iso: string): string {
  const [, m, d] = beijingDate(iso).split("-").map(Number) as [number, number, number];
  return `${m}月${d}日 ${beijingTime(iso)}`;
}

/** "X：Ethan Mollick (@emollick)" → "Ethan Mollick"; other sources keep their name. */
export function shortSourceName(name: string): string {
  const m = /^X[:：]\s*(.+?)\s*\(@[^)]+\)\s*$/.exec(name);
  if (m) return m[1]!.replace(/（.*?）/g, "").trim();
  return name.replace(/（RSS）|（网页）|（API）/g, "").trim();
}

export function sourceInitial(name: string): string {
  const s = shortSourceName(name).replace(/^[^\p{L}\p{N}]+/u, "");
  return (s[0] ?? "A").toUpperCase();
}
