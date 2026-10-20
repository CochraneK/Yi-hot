// A page of reports grouped by Beijing day with the same rail and rows as the home timeline
// (动态, topics, search results, 收藏).
import { useMemo } from "react";
import { Link } from "react-router";
import type { FeedItemSummary } from "@aihot/contracts/site";
import { IconChevronRight } from "../../components/icons";
import { beijingDate, feedDisplayAt, type FeedTimeDisplay } from "../../lib/format";
import { markRead, useReadSet } from "../../lib/local-state";
import { DayHeader, TimelineSlot } from "./Timeline";
import { FeedItem } from "./FeedItem";
import { SAVE_THE_CHILDREN_TOPICS } from "@aihot/industry/save-the-children";

export function DayList({ items, todayCount = null, showTags = true, animate = false }: { items: FeedItemSummary[]; todayCount?: number | null; showTags?: boolean; animate?: boolean }) {
  const readSet = useReadSet();
  const today = beijingDate(Date.now());
  const days = useMemo(() => {
    const out: Array<{ day: string; items: Array<{ it: FeedItemSummary; display: FeedTimeDisplay }> }> = [];
    // Newest first by what the slot prints, grouped by the day the article belongs to: a date-only
    // article keeps its own day but sits where its collection clock puts it, so the list never shows a
    // later clock above an earlier one.
    const rows = items.map((it) => {
      const display = feedDisplayAt(it.publishedAt, it.discoveredAt, it.timelineAt, it.publishedAtPrecision);
      return { it, display, day: beijingDate(display.at) };
    });
    rows.sort((a, b) =>
      a.day === b.day
        ? Date.parse(b.display.clockAt) - Date.parse(a.display.clockAt)
        : a.day < b.day ? 1 : -1);
    for (const r of rows) {
      const last = out[out.length - 1];
      if (last && last.day === r.day) last.items.push({ it: r.it, display: r.display });
      else out.push({ day: r.day, items: [{ it: r.it, display: r.display }] });
    }
    return out;
  }, [items]);
  let order = 0;
  return (
    <div>
      {days.map(({ day, items: list }) => (
        <section key={day} aria-label={day}>
          <DayHeader day={day} today={today} count={day === today ? todayCount : null} />
          <ol className="lg:pt-1">
            {list.map(({ it, display }) => (
              <TimelineSlot key={it.id} at={display.at} timeLabel={display.label} dateOnly={display.dateOnly} clockAt={display.clockAt} clockLabel={display.clockLabel} fresh={animate} delay={animate ? Math.min(order++, 12) * 25 : 0} dotColor={topicColor(it.tags)}>
                <FeedItem item={it} read={readSet.has(it.id)} onOpen={markRead} showTags={showTags} />
              </TimelineSlot>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function topicColor(tags: string[]) {
  return SAVE_THE_CHILDREN_TOPICS.find((t) => tags.includes(t.name))?.color ?? "#94A3B8";
}

/** Numbered pages (the list stays crawlable), with previous / next at the ends. */
export function Pagination({ page, pageCount, href }: { page: number; pageCount: number; href: (p: number) => string }) {
  if (pageCount <= 1) return null;
  const pages = [...new Set([1, pageCount, page - 2, page - 1, page, page + 1, page + 2].filter((p) => p >= 1 && p <= pageCount))].sort((a, b) => a - b);
  const btn = "inline-flex h-9 min-w-9 items-center justify-center rounded-full px-2.5 text-[13px] transition-colors";
  return (
    <nav aria-label="分页" className="mt-6 flex flex-wrap items-center justify-center gap-1">
      {page > 1 && (
        <Link to={href(page - 1)} className={`${btn} border border-line-strong bg-surface px-3 text-ink-3 hover:border-ink-4 hover:text-ink`}>
          上一页
        </Link>
      )}
      {pages.map((p, i) => (
        <span key={p} className="flex items-center gap-1">
          {i > 0 && p - pages[i - 1]! > 1 && <span className="px-0.5 text-ink-4">…</span>}
          <Link
            to={href(p)}
            aria-current={p === page ? "page" : undefined}
            className={`num ${btn} ${p === page ? "bg-ink font-semibold text-bg" : "text-ink-3 hover:bg-bg-sunk hover:text-ink"}`}
          >
            {p}
          </Link>
        </span>
      ))}
      {page < pageCount && (
        <Link to={href(page + 1)} className={`${btn} gap-0.5 border border-line-strong bg-surface px-3 text-ink-3 hover:border-ink-4 hover:text-ink`}>
          下一页 <IconChevronRight size={14} />
        </Link>
      )}
    </nav>
  );
}

