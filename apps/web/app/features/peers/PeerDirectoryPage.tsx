import type { PeerDirectory } from "@aihot/contracts/peers";
import { Kicker } from "../../components/ui/Kicker";
import { IconArrowUpRight, IconClock } from "../../components/icons";
import { fullDateTime, relativeTime } from "../../lib/format";

/**
 * 邻域：一页纸的行业站目录。
 *
 * 卡片上不放「分数」——各站的评分只在各自站内可比，摆在一起会诱导横比。放的是
 * 「它最近在关心什么」（最新条目标题），比任何数字都更能说明一家站的方向。
 * 站名指向首页，标题指向那篇原文：两个出口分开，读者不会点错。
 */
export function PeerDirectoryPage({ data }: { data: PeerDirectory }) {
  const { sites, totalItems, updatedAt } = data;

  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-12">
      <header className="pb-7 pt-5 lg:pt-1">
        <Kicker>邻域</Kicker>
        <h1 className="mt-3 text-[26px] font-black leading-[1.25] tracking-[-0.02em] text-ink lg:text-[30px]">邻域</h1>
        <p className="mt-2.5 max-w-[62ch] text-[14px] leading-[1.9] text-ink-2">
          这些站和本站用的是同一套框架，做的是别的行业：心理、环保、职场、机器人、影视、数学。
          选什么、怎么评由它们各自的编辑系统决定，不由本站判断；日报与周报里的「邻域」版块，就是从这些站摘编的。
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-ink-3">
          <span>
            <span className="num">{sites.length}</span> 个站
          </span>
          <span className="text-ink-4">·</span>
          <span>
            <span className="num">{totalItems.toLocaleString("en-US")}</span> 条留档
          </span>
          {updatedAt && (
            <>
              <span className="text-ink-4">·</span>
              <span title={fullDateTime(updatedAt)} className="text-ink-4">
                最近同步 {relativeTime(updatedAt)}
              </span>
            </>
          )}
        </div>
      </header>

      {sites.length === 0 ? (
        <p className="py-16 text-center text-[14px] text-ink-4">暂时读不到任何一家，稍后再来看看。</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sites.map((s) => (
            <article key={s.id} className="card card-hover flex min-w-0 flex-col overflow-hidden">
              <span className="h-[2px] w-full bg-accent" aria-hidden="true" />
              <div className="flex items-start gap-3 px-5 pb-3.5 pt-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-accent-softer text-[15px] font-black text-accent">
                  {s.name.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex max-w-full items-center gap-1.5"
                  >
                    <h2 className="truncate text-[16px] font-bold leading-snug text-ink transition-colors group-hover:text-accent">{s.name}</h2>
                    <IconArrowUpRight size={13} className="shrink-0 text-ink-4 transition-colors group-hover:text-accent" />
                  </a>
                  <p className="mt-0.5 truncate text-[12.5px] text-ink-3">{s.note}</p>
                </div>
              </div>

              <div className="border-t border-line-soft px-5 py-3.5">
                {s.latest ? (
                  <>
                    <a
                      href={s.latest.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="line-clamp-2 text-[13.5px] font-medium leading-[1.7] text-ink-2 transition-colors [overflow-wrap:anywhere] hover:text-accent"
                    >
                      {s.latest.title}
                    </a>
                    <div className="mt-2 flex items-center gap-1.5 text-[11.5px] text-ink-4">
                      <IconClock size={11} />
                      <span className="num">
                        {s.latest.publishedAt ? relativeTime(s.latest.publishedAt) : "时间未知"}
                      </span>
                      {s.latest.category && <span className="ml-auto truncate text-ink-4">{s.latest.category}</span>}
                    </div>
                  </>
                ) : (
                  <p className="text-[13px] leading-[1.7] text-ink-4">还没有同步到条目</p>
                )}
              </div>

              <div className="mt-auto flex items-center gap-1.5 border-t border-line-soft px-5 py-2.5 text-[11.5px] text-ink-4">
                <span>
                  <span className="num">{s.items}</span> 条在库
                </span>
                <span className="ml-auto" title={s.checkedAt ? fullDateTime(s.checkedAt) : undefined}>
                  {s.checkedAt ? `${relativeTime(s.checkedAt)}同步` : "尚未同步"}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="mt-6 text-[12px] leading-[1.9] text-ink-4">
        链接一律直达各站原页，标题不改写、归属不转移。若某家长期读不到，它会从这里暂时消失，恢复后自动回来。
      </p>
    </div>
  );
}
