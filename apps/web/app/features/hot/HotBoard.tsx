import { Link } from "react-router";
import type { HotEntryView, HotResponse } from "@aihot/contracts/site";
import { monthDayTime } from "../../lib/format";
import { IconChevronDown, IconFlame } from "../../components/icons";
import { Sparkline } from "./Sparkline";
import { Delta } from "./Delta";

function RankRow({ entry }: { entry: HotEntryView }) {
  return (
    <li className="flex min-w-0 items-center gap-3 py-2.5">
      <span className={`mono w-5 shrink-0 text-center text-[14px] font-semibold ${entry.rank <= 3 ? "text-hot" : "text-ink-4"}`}>
        <span className="sr-only">第</span>{entry.rank}<span className="sr-only">名</span>
      </span>
      <Link to={`/story/${entry.story.publicId}`} prefetch="intent" className="min-w-0 flex-1 rounded-sm text-[14px] font-medium leading-relaxed text-ink hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <span className="line-clamp-2">{entry.story.title}</span>
      </Link>
      <Sparkline values={entry.spark} className="hidden h-6 w-20 shrink-0 text-accent sm:block" />
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="mono text-[13px] text-ink-3" aria-label={`热度指数 ${Math.round(entry.heat)}`}>{Math.round(entry.heat)}</span>
        <Delta trend={entry.trend} pct={entry.trendPct} />
      </span>
    </li>
  );
}

/** A compact reading aid above the feed; expanding never navigates away or changes its filters. */
export function HotBoard({ hot }: { hot: HotResponse | null }) {
  if (!hot) return null;
  const first = hot.entries.slice(0, 3);
  const rest = hot.entries.slice(3);
  return (
    <section id="hot" aria-labelledby="hot-board-title" className="card mb-5 scroll-mt-4 px-4 py-3 sm:px-5">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="hot-board-title" className="flex items-center gap-1.5 text-[14px] font-semibold text-ink"><IconFlame size={16} /><span>热点榜</span></h2>
        <span className="text-[11px] text-ink-4">过去 {hot.windowHours} 小时{hot.computedAt ? ` · ${monthDayTime(hot.computedAt)} 更新` : ""}</span>
      </header>
      {first.length ? (
        <>
          <ol aria-label="热点前三名" className="mt-1 divide-y divide-line-soft">{first.map((entry) => <RankRow key={entry.story.publicId} entry={entry} />)}</ol>
          {rest.length > 0 && (
            <details className="group/board border-t border-line-soft">
              <summary className="flex min-h-10 cursor-pointer items-center justify-center gap-1 text-[12px] text-ink-3 hover:text-ink">
                <span className="group-open/board:hidden">展开其余 {rest.length} 条</span>
                <span className="hidden group-open/board:inline">收起榜单</span>
                <IconChevronDown size={13} className="transition-transform group-open/board:rotate-180" />
              </summary>
              <ol start={4} aria-label="其余热点" className="divide-y divide-line-soft">{rest.map((entry) => <RankRow key={entry.story.publicId} entry={entry} />)}</ol>
            </details>
          )}
        </>
      ) : <p className="py-3 text-[13px] text-ink-4">暂时没有足够多来源共同讨论的事件。</p>}
      <p className="mt-1 text-[11px] leading-relaxed text-ink-4">热度反映监测范围内的讨论活跃程度，不代表报道质量。<Link to="/hot" className="ml-1 underline underline-offset-2">榜单详情与说明</Link></p>
    </section>
  );
}
