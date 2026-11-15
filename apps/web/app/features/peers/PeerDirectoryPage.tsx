import type { PeerDirectory, PeerDirectoryEntry } from "@aihot/contracts/peers";
import { useState, type CSSProperties } from "react";
import { IconArrowUpRight, IconClock, IconSearch } from "../../components/icons";
import { fullDateTime, relativeTime } from "../../lib/format";
import { filterPeerSites, groupNeighborhoods, type NeighborhoodSection, type PeerGroupView } from "./grouping";

/**
 * 邻域：一页纸的行业站目录。
 *
 * 卡片上不放「分数」——各站的评分只在各自站内可比，摆在一起会诱导横比。放的是
 * 「它最近在关心什么」（最新条目标题），比任何数字都更能说明一家站的方向。
 * 站名指向首页，标题指向那篇原文：两个出口分开，读者不会点错。
 *
 * 每张卡用**这家站自己的颜色**（industry/peers.ts 的 accent）画顶条和首字徽标。此前十几张卡
 * 顶条全是同一个品牌红，卡片之间没有任何可抓的差别，翻起来像同一个模块复制了十几遍。
 *
 * 卡片上到十几张之后又出现第二个问题：一页全是同构方块，只能逐张读名字才知道哪家是哪行。
 * 所以先按资讯/资源/候选分三层，正式邻域再按同系/其他与行业归堆。分组只是「归堆」，
 * 不排序、不隐藏：同一组内仍是登记表顺序。
 */
export function PeerDirectoryPage({ data }: { data: PeerDirectory }) {
  const { sites, totalItems, updatedAt } = data;
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;
  const filteredSites = filterPeerSites(sites, query);
  const sections = groupNeighborhoods(filteredSites);
  const official = sections.find(section => section.id === "official");
  const directionCount = new Set(sites.map(site => site.group)).size;

  return (
    <div className="mx-auto max-w-[1120px] pb-12">
      <header className="pb-3 pt-5 lg:pt-1">
        <h1 className="text-[27px] font-bold leading-[1.3] tracking-[-0.025em] text-ink lg:text-[30px]">邻域</h1>
        <p className="mt-2 max-w-[56ch] text-[14px] leading-[1.75] text-ink-2">
          发现不同领域的信息站与实用资源。按同系或行业寻找，重复与同步状态仅作提示。
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-ink-3">
          <span><span className="num">{sites.length}</span> 个站</span>
          {directionCount > 1 && (
            <>
              <span className="text-ink-4">·</span>
              <span><span className="num">{directionCount}</span> 个方向</span>
            </>
          )}
          <span className="hidden sm:inline">
            <span className="mx-1.5 text-ink-4">·</span>
            <span className="num">{totalItems.toLocaleString("en-US")}</span> 条留档
          </span>
          {updatedAt && (
            <span className="hidden text-ink-4 sm:inline" title={fullDateTime(updatedAt)}>
              · 最近同步 {relativeTime(updatedAt)}
            </span>
          )}
        </div>
        <label htmlFor="peer-search" className="sr-only">搜索站点或领域</label>
        <div className="mt-4 flex h-11 items-center gap-2.5 rounded-xl border border-line-strong bg-surface px-3 text-ink-3 transition-colors focus-within:border-accent">
          <IconSearch size={18} />
          <input
            id="peer-search"
            type="search"
            autoComplete="off"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="搜索站点、领域或方向"
            className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-ink placeholder:text-ink-4 focus:outline-none"
          />
          {searching && (
            <button type="button" onClick={() => setQuery("")}
              className="min-h-10 shrink-0 rounded-lg px-2 text-[13px] text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              清除
            </button>
          )}
        </div>
        {searching && (
          <p className="mt-2 text-[13px] text-ink-3" aria-live="polite">
            找到 <span className="num">{filteredSites.length}</span> 个匹配站点
          </p>
        )}
      </header>
      {sections.length > 0 && (
        <nav aria-label="快速跳转邻域分类"
          className="sticky top-0 z-20 -mx-4 border-y border-line-soft bg-bg/95 px-4 py-1.5 backdrop-blur lg:static lg:mx-0 lg:mt-1 lg:border-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
          <div className="flex gap-2 overflow-x-auto lg:flex-wrap">
            {sections.map(section => (
              <a key={section.id} href={`#tier-${section.id}`}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-3.5 text-[13px] font-medium text-ink-2 transition-colors hover:border-ink-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                {section.label}
                <span className="num text-[12px] text-ink-4">{section.sites.length}</span>
              </a>
            ))}
            {official?.families?.map(family => (
              <a key={family.id} href={`#family-${family.id}`}
                className="inline-flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 text-[13px] text-ink-3 transition-colors hover:bg-bg-sunk hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                {family.label}
                <span className="num text-[12px] text-ink-4">{family.sites.length}</span>
              </a>
            ))}
          </div>
        </nav>
      )}

      {sites.length === 0 ? (
        <p className="py-16 text-center text-[14px] text-ink-4">暂时没有可展示的站点。</p>
      ) : filteredSites.length === 0 ? (
        <div className="py-14 text-center">
          <p className="text-[15px] font-medium text-ink">没有找到匹配的站点</p>
          <p className="mt-2 text-[13px] text-ink-3">试试站名、行业关键词，或清除搜索。</p>
          <button type="button" onClick={() => setQuery("")}
            className="mt-4 min-h-11 rounded-full border border-line-strong bg-surface px-5 text-[13px] font-medium text-ink-2 hover:border-ink-4">
            清除搜索
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-9 lg:space-y-10">
          {sections.map((section) => (
            <section key={section.id} id={`tier-${section.id}`} className="scroll-mt-24">
              {section.id === "candidate" ? (
                <details open={searching ? true : undefined} className="rounded-xl border border-line px-4 py-3">
                  <summary className="cursor-pointer text-[17px] font-semibold text-ink">
                    候选信息 <span className="num ml-2 text-[12px] font-normal text-ink-4">{section.sites.length} 家</span>
                  </summary>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">{section.note}</p>
                  <div className="mt-5"><PeerSectionGroups section={section} /></div>
                </details>
              ) : (
                <>
                  <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line pb-3">
                    <h2 className="text-[19px] font-bold tracking-[-0.02em] text-ink">{section.label}</h2>
                    <span className="num text-[12px] text-ink-4">{section.sites.length} 家</span>
                    <p className="w-full text-[12.5px] leading-relaxed text-ink-3">{section.note}</p>
                  </div>
                  {section.id === "official" && section.families?.length ? (
                    <div className="space-y-7">
                      {section.families.map((family) => (
                        <section key={family.id} id={`family-${family.id}`} className="scroll-mt-24">
                          <div className="mb-3 flex items-baseline gap-2">
                            <h3 className="text-[16px] font-bold text-ink">{family.label}</h3>
                            <span className="num text-[12px] text-ink-4">{family.sites.length} 家</span>
                          </div>
                          <PeerSectionGroups section={section} groups={family.groups} scope={family.id} />
                        </section>
                      ))}
                    </div>
                  ) : (
                    <PeerSectionGroups section={section} />
                  )}
                </>
              )}
            </section>
          ))}
        </div>
      )}

      <p className="mt-6 text-[12px] leading-[1.9] text-ink-4">
        站点链接直达原站；「可能重合」「尚未接入同步」「同步暂不可用」均为透明提示，不影响正式邻域收录。近期无更新按原文日期判断，不等于站点停运。
      </p>
    </div>
  );
}

function PeerSectionGroups({
  section,
  groups = section.groups,
  scope,
}: {
  section: NeighborhoodSection;
  groups?: PeerGroupView[];
  scope?: "same" | "other";
}) {
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.id} id={`g-${section.id}-${scope ? `${scope}-` : ""}${group.id}`} className="scroll-mt-24">
          {groups.length > 1 && (
            <div className="mb-3 flex items-baseline gap-2 border-b border-line-soft pb-2">
              <h3 className="text-[13px] font-semibold text-ink-2">{group.label}</h3>
              <span className="num text-[11px] text-ink-4">{group.sites.length}</span>
              <span className="ml-auto truncate pl-3 text-[11px] text-ink-4">{group.note}</span>
            </div>
          )}
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {group.sites.map((site) => <PeerCard key={site.id} site={site} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function PeerCard({ site: s }: { site: PeerDirectoryEntry }) {
  if (s.browseOnly) return <PeerLinkCard site={s} />;
  return (
    <article className="card card-hover peer-card flex min-w-0 flex-col overflow-hidden" style={{ "--peer": s.accent } as CSSProperties}>
      <span className="peer-mark h-[2px] w-full" style={{ background: "var(--peer)" }} aria-hidden="true" />
      <div className="flex items-start gap-3 px-4 pb-3 pt-3.5">
        <span
          className="peer-mark grid size-9 shrink-0 place-items-center rounded-[10px] text-[15px] font-black"
          style={{ background: "color-mix(in srgb, var(--peer) 12%, transparent)", color: "var(--peer)" }}
        >
          {s.name.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="group inline-flex max-w-full items-center gap-1.5">
            <h4 className="peer-link truncate text-[16px] font-bold leading-snug text-ink transition-colors">{s.name}</h4>
            <IconArrowUpRight size={13} className="shrink-0 text-ink-4 transition-colors group-hover:text-ink-2" />
          </a>
          <p className="mt-0.5 truncate text-[12.5px] text-ink-3">{s.note}</p>
          {s.overlapPossible && (
            <span className="mt-1 inline-block text-[11px] text-ink-4" title="综合聚合可能报道同一事件，尚未做逐条重复率核实">
              内容可能重合
            </span>
          )}
        </div>
      </div>

      <div className="border-t border-line-soft px-4 py-3">
        {s.ok === false && (
          <p className="mb-2 text-[12px] text-ink-4">同步暂不可用 · 可前往原站浏览</p>
        )}
        {s.latest ? (
          <>
            {s.tier === "official" && s.freshness === "stale" && (
              <p className="mb-1.5 text-[12px] text-ink-4">近期无更新 · 以下为历史条目</p>
            )}
            <a
              href={s.latest.url}
              target="_blank"
              rel="noopener noreferrer"
              className="peer-link line-clamp-2 text-[13.5px] font-medium leading-[1.7] text-ink-2 transition-colors [overflow-wrap:anywhere]"
            >
              {s.latest.title}
            </a>
            <div className="mt-2 flex items-center gap-1.5 text-[11.5px] text-ink-4">
              <IconClock size={11} />
              <span className="num">{s.latest.publishedAt ? relativeTime(s.latest.publishedAt) : "时间未知"}</span>
              {s.latest.category && <span className="ml-auto truncate text-ink-4">{s.latest.category}</span>}
            </div>
          </>
        ) : (
          <p className="text-[13px] leading-[1.7] text-ink-4">还没有同步到条目</p>
        )}
      </div>

      <div className="mt-auto flex items-center gap-1.5 border-t border-line-soft px-4 py-2.5 text-[12px] text-ink-4">
        <span>
          <span className="num">{s.items}</span> 条在库
        </span>
        <span className="ml-auto" title={s.checkedAt ? fullDateTime(s.checkedAt) : undefined}>
          {s.checkedAt ? `${relativeTime(s.checkedAt)}同步` : "尚未同步"}
        </span>
      </div>
    </article>
  );
}

/**
 * 没有同步条目的站不需要三段式大卡片：整行直接打开原站。
 * 保留站点身份色、解释与同步边界，但减少手机滚动长度。
 */
function PeerLinkCard({ site: s }: { site: PeerDirectoryEntry }) {
  return (
    <a
      href={s.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${s.name}（打开原站）`}
      className="peer-card group relative flex min-h-[92px] items-start gap-3 overflow-hidden rounded-xl border border-line bg-surface px-3.5 py-3 transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      style={{ "--peer": s.accent } as CSSProperties}
    >
      <span className="peer-mark absolute inset-y-3 left-0 w-[3px] rounded-r-full" style={{ background: "var(--peer)" }} aria-hidden="true" />
      <span className="peer-mark grid size-9 shrink-0 place-items-center rounded-[10px] text-[14px] font-bold"
        style={{ background: "color-mix(in srgb, var(--peer) 12%, transparent)", color: "var(--peer)" }} aria-hidden="true">
        {s.name.slice(0, 1)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold leading-snug text-ink">{s.name}</span>
        <span className="mt-0.5 block line-clamp-2 text-[12.5px] leading-[1.5] text-ink-3">{s.note}</span>
        <span className="mt-1 block text-[12px] leading-normal text-ink-4">
          {s.tier === "candidate" ? "候选信息 · 待复核" : "尚未接入同步"}
          {s.overlapPossible && " · 内容可能重合"}
        </span>
      </span>
      <IconArrowUpRight size={16} className="mt-1 shrink-0 text-ink-4 transition-colors group-hover:text-ink-2" />
    </a>
  );
}
