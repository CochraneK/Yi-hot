import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoCatalogPlace, GeoCatalogResponse } from "@aihot/contracts/site";

/**
 * City picker with 省 → 市 → 区 and a search box.
 *
 * The list is the full gazetteer catalogue, not just the places that already
 * have news: a reader in 绵阳 — or in 江宁区 — should be able to say so today,
 * and the feed starts matching by itself once an event is filed there. Ids are
 * canonical, so the choice survives the wait.
 *
 * Counties hang under their city rather than sitting in one flat list: 2550 of
 * them would bury the 878 cities, and a reader scrolling for their city does not
 * want to pass 玄武区 秦淮区 建邺区 on the way. The chevron opens one city at a
 * time; the search box still finds a county by name.
 *
 * Data policy: one cached request for the whole catalogue, filtered in the browser.
 * Per-keystroke requests would cost more and still need the same list.
 */
let catalogPromise: Promise<GeoCatalogResponse> | null = null;

export function loadCityCatalog(): Promise<GeoCatalogResponse> {
  if (!catalogPromise) {
    catalogPromise = fetch("/api/site/geo/catalog", { headers: { accept: "application/json" } })
      .then(response => (response.ok ? response.json() as Promise<GeoCatalogResponse> : Promise.reject(new Error(String(response.status)))))
      .catch(error => { catalogPromise = null; throw error; });
  }
  return catalogPromise;
}

const keyOf = (place: GeoCatalogPlace) => `${place.countryCode}:${place.region}`;
const RESULT_LIMIT = 40;
/** Stable empty list, so memos keyed on `places` do not rerun on every render. */
const NO_PLACES: GeoCatalogPlace[] = [];

export function CityPicker({ current, onPick, className = "", align = "left", block = false }: {
  current: { id: string; name: string } | null;
  onPick: (place: GeoCatalogPlace) => void;
  className?: string;
  align?: "left" | "right";
  /** Full-width trigger, for the city page's settings row. */
  block?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<GeoCatalogResponse | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [regionKey, setRegionKey] = useState("all");
  // Which city's counties are open. One at a time: two open lists in a 19rem
  // scroller push the rest of the catalogue off screen.
  const [expanded, setExpanded] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || catalog) return;
    let alive = true;
    setError(false);
    loadCityCatalog().then(data => { if (alive) setCatalog(data); }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [open, catalog]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    input.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const places = catalog?.places ?? NO_PLACES;
  const regions = catalog?.regions ?? [];
  const q = query.trim();

  const byId = useMemo(() => new Map(places.map(place => [place.id, place])), [places]);

  // Reopening with a county selected should show where it sits. Without this the
  // chevron that leads back to it is closed and the reader has to search again.
  useEffect(() => {
    if (!open) return;
    const own = current ? byId.get(current.id) : null;
    if (own?.parentId) setExpanded(own.parentId);
  }, [open, current, byId]);

  // Counties by the city they belong to, busiest first. The catalogue carries
  // them flat (that is what makes search work), so the nesting is done here.
  const counties = useMemo(() => {
    const grouped = new Map<string, GeoCatalogPlace[]>();
    for (const place of places) {
      if (!place.parentId) continue;
      const bucket = grouped.get(place.parentId);
      if (bucket) bucket.push(place);
      else grouped.set(place.parentId, [place]);
    }
    for (const bucket of grouped.values()) {
      bucket.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-Hans-CN"));
    }
    return grouped;
  }, [places]);

  const results = useMemo(() => {
    const scoped = regionKey === "all" ? places : places.filter(place => keyOf(place) === regionKey);
    // Browsing shows cities only; counties are one chevron away. A flat list
    // with all 2550 of them buried the cities a reader was actually scanning.
    if (!q) return scoped.filter(place => !place.parentId).slice(0, RESULT_LIMIT);
    // A province name in the search box is a shortcut to that whole province.
    return scoped
      .filter(place => place.name.includes(q) || place.region.includes(q))
      .sort((a, b) => b.count - a.count)
      .slice(0, RESULT_LIMIT);
  }, [places, regionKey, q]);

  // The province dropdown counts cities, so the "共 N 个" line must too — a
  // county is reached through its city, not counted beside it.
  const scopedTotal = regionKey === "all"
    ? places.filter(place => !place.parentId).length
    : places.filter(place => keyOf(place) === regionKey && !place.parentId).length;

  return (
    <div ref={box} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { setOpen(value => !value); setQuery(""); }}
        className={`inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition-colors ${
          block ? "w-full justify-between" : "max-w-full"
        } ${current ? "border-line bg-surface text-ink-2 hover:border-ink-4" : "border-line-strong bg-surface text-ink-2 hover:border-ink-4"}`}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5 shrink-0 text-ink-4">
          <path d="M8 1.5c-2.49 0-4.5 2.01-4.5 4.5 0 3.19 3.72 7.68 4.18 8.22a.42.42 0 0 0 .64 0C8.78 13.68 12.5 9.19 12.5 6c0-2.49-2.01-4.5-4.5-4.5Zm0 6a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" fill="currentColor" />
        </svg>
        <span className={block ? "flex-1 truncate text-left" : "truncate"}>{current?.name ?? "选择城市"}</span>
        <svg viewBox="0 0 12 12" aria-hidden="true" className="size-2.5 shrink-0 text-ink-4">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="选择我的城市"
          // On a phone the trigger sits at the left edge, so a right-aligned panel
          // would hang off the screen; the alignment only flips at desktop width.
          className={`absolute z-40 mt-2 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-line bg-surface shadow-[0_18px_44px_rgba(0,0,0,0.18)] ${
            block ? "left-0 w-full min-w-[17rem] max-w-[26rem]" : `w-[min(21rem,calc(100vw-2rem))] ${align === "right" ? "left-0 lg:left-auto lg:right-0" : "left-0"}`
          }`}
        >
          <div className="space-y-2 border-b border-line-soft p-3">
            <input
              ref={input}
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="搜索城市、区县或省份，如 绵阳 / 江宁 / 四川"
              aria-label="搜索城市或区县"
              maxLength={40}
              className="h-9 w-full rounded-lg bg-bg-sunk px-3 text-[13px] text-ink outline-none ring-1 ring-inset ring-line-soft placeholder:text-ink-4 focus:ring-accent"
            />
            <select
              aria-label="按省份或地区筛选"
              value={regionKey}
              onChange={event => setRegionKey(event.target.value)}
              className="h-9 w-full rounded-lg border border-line-strong bg-surface px-2 text-[13px] text-ink-2"
            >
              <option value="all">全部省份与地区</option>
              {regions.map(region => (
                <option key={region.key} value={region.key}>{region.label} · {region.cities}</option>
              ))}
            </select>
          </div>

          <div className="max-h-[19rem] overflow-y-auto overscroll-contain py-1">
            {error ? (
              <div className="px-3 py-6 text-center text-[12.5px] text-ink-3">
                城市列表没加载出来。
                <button type="button" onClick={() => { setError(false); setCatalog(null); }} className="ml-1 font-medium text-accent hover:underline">重试</button>
              </div>
            ) : !catalog ? (
              <p className="px-3 py-6 text-center text-[12.5px] text-ink-4">正在加载城市…</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-6 text-center text-[12.5px] leading-relaxed text-ink-3">
                没找到「{q || "这个地区"}」。换个写法，或先选省份看看。
              </p>
            ) : (
              <>
                <p className="px-3 pb-1 pt-1 text-[11px] text-ink-4">
                  {q ? `匹配 ${results.length === RESULT_LIMIT ? `${RESULT_LIMIT}+` : results.length} 个` : regionKey === "all" ? "报道最多的城市" : `${regions.find(r => r.key === regionKey)?.label ?? ""} 共 ${scopedTotal} 个`}
                </p>
                <ul>
                  {results.map(place => {
                    const active = current?.id === place.id;
                    // A county row never carries a chevron: there is nothing
                    // below it, and 2550 leaves of a 19rem list is not a menu.
                    const kids = place.parentId ? undefined : counties.get(place.id);
                    const open = expanded === place.id;
                    const inCity = place.parentId ? byId.get(place.parentId)?.name : undefined;
                    return (
                      <li key={place.id}>
                        <div className="flex items-stretch">
                          <button
                            type="button"
                            onClick={() => { onPick(place); setOpen(false); }}
                            className={`flex min-w-0 flex-1 items-baseline gap-2 px-3 py-2 text-left text-[13px] hover:bg-bg-sunk ${active ? "text-accent" : "text-ink-2"}`}
                          >
                            <span className="truncate">{place.name}</span>
                            {/* A county names the city it is in; a city names its province. */}
                            {(inCity ?? place.region) !== place.name && (
                              <span className="shrink-0 text-[11.5px] text-ink-4">{inCity ?? place.region}</span>
                            )}
                            <span className="num ml-auto shrink-0 text-[11.5px] text-ink-4">{place.count > 0 ? `${place.count} 条` : "还没有"}</span>
                          </button>
                          {kids && kids.length > 0 && (
                            <button
                              type="button"
                              aria-expanded={open}
                              aria-label={`${open ? "收起" : "展开"}${place.name}的区县`}
                              title={`${place.name}有 ${kids.length} 个区县`}
                              onClick={() => setExpanded(open ? null : place.id)}
                              className={`flex shrink-0 items-center gap-0.5 px-2 text-[11px] transition-colors hover:text-ink ${open ? "text-accent" : "text-ink-4"}`}
                            >
                              <span className="num">{kids.length}</span>
                              <svg viewBox="0 0 12 12" aria-hidden="true" className={`size-2.5 transition-transform ${open ? "rotate-180" : ""}`}>
                                <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          )}
                        </div>
                        {open && kids && (
                          <ul className="mb-1 ml-3 border-l border-line-soft pl-1">
                            {kids.map(kid => (
                              <li key={kid.id}>
                                <button
                                  type="button"
                                  onClick={() => { onPick(kid); setOpen(false); }}
                                  className={`flex w-full items-baseline gap-2 py-1.5 pl-2 pr-3 text-left text-[12.5px] hover:bg-bg-sunk ${current?.id === kid.id ? "text-accent" : "text-ink-2"}`}
                                >
                                  <span className="truncate">{kid.name}</span>
                                  <span className="num ml-auto shrink-0 text-[11px] text-ink-4">{kid.count > 0 ? `${kid.count} 条` : "还没有"}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {results.length === RESULT_LIMIT && (
                  <p className="px-3 pb-2 pt-1 text-[11px] text-ink-4">只显示前 {RESULT_LIMIT} 个，继续输入可以缩小范围。</p>
                )}
              </>
            )}
          </div>

          <p className="border-t border-line-soft px-3 py-2 text-[11px] leading-relaxed text-ink-4">
            只记在这台设备上。城市可以先选，等有了报道会自己出现；区县只列已经有报道的。
          </p>
        </div>
      )}
    </div>
  );
}
