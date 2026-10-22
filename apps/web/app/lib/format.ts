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
  /**
   * Where the card sits and the moment the list's clock column prints. It is the article's own time
   * when the source states a clock, our collection time when it does not — the same moment the
   * timeline in the backend sorts by.
   */
  at: string;
  /** What `at` is. */
  label: "原文发表" | "收录";
  /** The source states only a day (government listings, web search): no clock time exists for it. */
  dateOnly: boolean;
  /** Alias of `at`, kept because the slot component takes the printed clock separately. */
  clockAt: string;
  /** Said under the clock: "收录" when `at` is our collection time rather than the article's. */
  clockLabel: "收录" | null;
  /**
   * The article's own moment, as the page may state it: Beijing midnight of its day when the source
   * states only a day, the exact instant otherwise, null when we do not know it at all. Never used
   * for placement — a date-only article collected today is filed under today.
   */
  sourceAt: string | null;
}

/**
 * What the feed shows for an article's time.
 *
 * A date-only article is placed by its collection moment, not by the day it was published. A source
 * that states only a day gives no clock to sort by, so filing the card under its own day pushed a
 * batch collected today onto seven different days in the middle of the list; the card now sits where
 * we collected it, the slot says "收录" under that clock, and `sourceAt` still carries the
 * publication day for the item page and the slot's tooltip. "收录" is also what an article with no
 * date at all gets.
 */
export function feedDisplayAt(publishedAt: string | null, discoveredAt: string, timelineAt: string, precision: "date" | "datetime" = "datetime"): FeedTimeDisplay {
  const collected = timelineAt || discoveredAt;
  // A 00:00 stamp on a datetime-precision article is a date in disguise (the parser filled the clock),
  // so it is treated like one: no clock to sort by, no clock to print.
  const dateOnly = publishedAt !== null && (precision === "date" || (beijingTime(publishedAt) === "00:00" && beijingTime(discoveredAt) !== "00:00"));
  const sourceAt = publishedAt === null ? null : dateOnly ? `${beijingDate(publishedAt)}T00:00:00+08:00` : publishedAt;
  if (sourceAt === null || dateOnly) return { at: collected, label: "收录", dateOnly, clockAt: collected, clockLabel: "收录", sourceAt };
  return { at: sourceAt, label: "原文发表", dateOnly: false, clockAt: sourceAt, clockLabel: null, sourceAt };
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
