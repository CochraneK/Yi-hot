import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoCatalogPlace, GeoCatalogResponse } from "@aihot/contracts/site";

/**
 * City picker with 省 → 市 and a search box.
 *
 * The list is the full gazetteer catalogue, not just the cities that already have
 * news: a reader in 绵阳 should be able to say so today, and the feed starts
 * matching by itself once an event is filed there. Ids are canonical, so the
 * choice survives the wait.
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

  const places = catalog?.places ?? [];
  const regions = catalog?.regions ?? [];
  const q = query.trim();

  const results = useMemo(() => {
    const scoped = regionKey === "all" ? places : places.filter(place => keyOf(place) === regionKey);
    if (!q) return scoped.slice(0, RESULT_LIMIT);
    // A province name in the search box is a shortcut to that whole province.
    return scoped
      .filter(place => place.name.includes(q) || place.region.includes(q))
      .sort((a, b) => b.count - a.count)
      .slice(0, RESULT_LIMIT);
  }, [places, regionKey, q]);

  const scopedTotal = regionKey === "all" ? places.length : places.filter(place => keyOf(place) === regionKey).length;

  return (
    <div ref={box} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { setOpen(value => !value); setQuery(""); }}
        className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition-colors ${
          block ? "w-full max-w-[26rem] justify-between" : "max-w-[11rem]"
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
              placeholder="搜索城市或省份，如 绵阳 / 四川"
              aria-label="搜索城市"
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
                    return (
                      <li key={place.id}>
                        <button
                          type="button"
                          onClick={() => { onPick(place); setOpen(false); }}
                          className={`flex w-full items-baseline gap-2 px-3 py-2 text-left text-[13px] hover:bg-bg-sunk ${active ? "text-accent" : "text-ink-2"}`}
                        >
                          <span className="truncate">{place.name}</span>
                          {place.region !== place.name && (
                            <span className="shrink-0 text-[11.5px] text-ink-4">{place.region}</span>
                          )}
                          <span className="num ml-auto shrink-0 text-[11.5px] text-ink-4">{place.count > 0 ? `${place.count} 条` : "还没有"}</span>
                        </button>
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
            城市只记在这台设备上；还没有报道的城市也可以先选，等有了会自己出现。
          </p>
        </div>
      )}
    </div>
  );
}
