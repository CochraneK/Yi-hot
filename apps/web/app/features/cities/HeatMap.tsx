import { useEffect, useRef, useState } from "react";
import type { GeoHeatPoint, GeoHeatResponse } from "@aihot/contracts/site";
import { loadAMap, mapStyleForTheme, wgs84ToGcj02, type AMapInstance, type AMapNamespace, type AMapOverlay } from "./amap";

/**
 * City-level heat map over a chosen window.
 *
 * This is the site's only map now: the city page is gone, so the geographic
 * reading lives here, on 热点, next to the ranking. It draws one circle per city
 * sized by article count, and each click opens that city's feed.
 *
 * The map is the content of this card, so it draws itself on arrival and cannot
 * be collapsed — a folded map was just a title with a button under it. Only
 * reviewed event places are drawn.
 *
 * The base map is 高德 (AMap): OpenStreetMap tiles time out from mainland
 * networks — measured 2026-11-16, 12 s with no response from the production
 * host — and are not an approved source for a public map of China anyway. When
 * the SDK cannot load (no key configured, blocked, offline phone) the card
 * degrades to the city list instead of a grey slab: on 热点 that list is the
 * only geography the reader gets.
 *
 * Two things are the reader's, not the page's: how far to zoom (the +/− buttons,
 * since the SDK's own control is a light-theme widget that fights the dark card)
 * and how far back to look (48 h, a week, a month). Switching the window only
 * replaces the circles — rebuilding the map would throw away the reader's zoom
 * and pan for a change of numbers.
 */

/** 高德's zoom range for this card; the buttons stop at the same edges. */
const ZOOM_MIN = 3;
const ZOOM_MAX = 12;

/** 48 h is the window the ranking uses, so the card opens on the same question. */
const PERIODS = [
  { hours: 48, label: "48h", heading: "近 48 小时" },
  { hours: 168, label: "周", heading: "近一周" },
  { hours: 720, label: "月", heading: "近一月" },
] as const;

function headingOf(hours: number): string {
  return PERIODS.find(p => p.hours === hours)?.heading ?? `近 ${hours} 小时`;
}

export function CityHeatMap({
  points, hours, onChoose, amapKey, amapSecurityCode, compact = false, mapHeight = "h-[300px] sm:h-[380px]",
}: {
  points: GeoHeatPoint[];
  hours: number;
  onChoose: (id: string) => void;
  /** 高德 Web端(JS API) key; empty means this deployment has no map configured. */
  amapKey?: string;
  /** Security code paired with a key issued after 2021-12; not needed for older keys. */
  amapSecurityCode?: string;
  /** On 热点 the page already ends with its own ranking, so the city list is dropped. */
  compact?: boolean;
  /** The map shrinks when the card shares a row with the lead story. */
  mapHeight?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<AMapInstance | null>(null);
  const ns = useRef<AMapNamespace | null>(null);
  const circles = useRef<AMapOverlay[]>([]);
  // A failed map collapses to a list: an empty grey slab reads as a broken page.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // The SDK loads once; overlays are redrawn per window, so `ready` gates that.
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(4);
  const [period, setPeriod] = useState(hours);
  const [cache, setCache] = useState<Record<number, GeoHeatPoint[]>>({});
  const [waitingFor, setWaitingFor] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const choose = useRef(onChoose);
  choose.current = onChoose;

  // The page's own window always wins: props come from the loader and may be
  // fresher than whatever we fetched a minute ago.
  const visible = period === hours ? points : cache[period] ?? points;
  const hasPoints = visible.length > 0;
  const total = visible.reduce((sum, p) => sum + p.count, 0);

  useEffect(() => {
    if (failed || !hasPoints || !host.current) return;
    if (!amapKey) {
      // Deployment without a key: log it for the operator, show the reader the list.
      console.warn("[heat-map] AMAP_JS_KEY is empty — drawing the city list instead of a map.");
      setFailed(true);
      return;
    }
    let disposed = false;
    let cleanup = () => {};
    // 高德 fires `complete` once the base tiles are painted. If it never arrives —
    // bad key, blocked script, offline phone — the container stays blank, so a
    // timer is the only honest signal that there is no map to look at.
    let drew = false;
    const timer = window.setTimeout(() => { if (!disposed && !drew) setFailed(true); }, 10000);
    setReady(false);

    loadAMap(amapKey, amapSecurityCode).then(AMap => {
      if (disposed || !host.current) return;
      const instance = new AMap.Map(host.current, {
        zoom: 4,
        center: [105, 35],
        zooms: [ZOOM_MIN, ZOOM_MAX],
        viewMode: "2D",
        resizeEnable: true,
        scrollWheelZoom: false,
        // The site is grey-white by day and near-black at night; the default
        // palette is loud beside the first and a white slab inside the second.
        mapStyle: mapStyleForTheme(),
      });
      instance.on("complete", () => { drew = true; window.clearTimeout(timer); });
      instance.on("zoomend", () => setZoom(instance.getZoom()));

      // The theme switch repaints the shell live, so the base map has to follow
      // it — rebuilding the map would throw away the overlays and recentre.
      const followTheme = () => { try { instance.setMapStyle(mapStyleForTheme()); } catch { /* style is cosmetic */ } };
      const themeWatcher = new MutationObserver(followTheme);
      themeWatcher.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

      map.current = instance;
      ns.current = AMap;
      setZoom(instance.getZoom());
      setReady(true);

      cleanup = () => {
        window.clearTimeout(timer);
        themeWatcher.disconnect();
        try { instance.destroy(); } catch { /* the container may already be gone */ }
        map.current = null;
        ns.current = null;
        circles.current = [];
      };
    }).catch(() => { if (!disposed) setFailed(true); });

    return () => { disposed = true; window.clearTimeout(timer); cleanup(); };
  }, [failed, attempt, hasPoints, amapKey, amapSecurityCode]);

  // Circles follow the window; the base map is never rebuilt, so a reader who has
  // zoomed into their province stays there while the numbers change.
  useEffect(() => {
    const instance = map.current;
    const AMap = ns.current;
    if (!ready || !instance || !AMap) return;
    if (circles.current.length) {
      try { instance.remove(circles.current); } catch { /* first draw has nothing to drop */ }
    }
    const max = Math.max(...visible.map(p => p.count), 1);
    const overlays: AMapOverlay[] = visible.map(point => {
      // Area, not radius, tracks the count: a city with 4x the stories reads as
      // twice the circle instead of four times, which keeps one busy city from
      // swallowing the map.
      const radius = 5 + 15 * Math.sqrt(point.count / max);
      // Places are geonames WGS-84; 高德 draws GCJ-02.
      const [lng, lat] = wgs84ToGcj02(point.lon, point.lat);
      const marker = new AMap.CircleMarker({
        center: [lng, lat],
        radius,
        strokeColor: "#DA291C",
        strokeOpacity: 0.55,
        strokeWeight: 1,
        fillColor: "#DA291C",
        fillOpacity: 0.28,
        bubble: true,
        cursor: "pointer",
        label: { content: `${point.name} · ${point.count} 条`, direction: "top" },
      });
      marker.on("click", () => choose.current(point.id));
      return marker;
    });
    instance.add(overlays);
    circles.current = overlays;
    // The card shows the whole country: every plotted city is on screen at once.
    // Detail is the reader's call — the +/− buttons or a double-click.
    if (overlays.length) instance.setFitView(overlays, false, [24, 24, 24, 24], 6);
  }, [ready, visible]);

  useEffect(() => () => inFlight.current?.abort(), []);

  function choosePeriod(next: number) {
    if (next === period) return;
    setNote(null);
    setPeriod(next);
    if (next === hours || cache[next]) return;
    inFlight.current?.abort();
    const ctl = new AbortController();
    inFlight.current = ctl;
    setWaitingFor(next);
    fetch(`/api/site/geo/heat?hours=${next}`, { headers: { accept: "application/json" }, signal: ctl.signal })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<GeoHeatResponse>;
      })
      .then(data => setCache(prev => ({ ...prev, [next]: data.points })))
      .catch(err => {
        if ((err as Error)?.name === "AbortError") return;
        // Back to the window the page already has, rather than an empty card.
        setPeriod(current => (current === next ? hours : current));
        setNote("这段时间没取到，先看原来的窗口。");
      })
      .finally(() => setWaitingFor(current => (current === next ? null : current)));
  }

  // The map failing is exactly when the list matters, so it survives compact mode.
  const listPlaces = failed ? visible.slice(0, 10) : compact ? [] : visible.slice(0, 12);

  return <section className="overflow-hidden rounded-xl border border-line bg-surface" aria-label={`${headingOf(period)}城市热力`}>
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 font-semibold text-ink">{headingOf(period)}，哪里在发生</h2>
        <div role="group" aria-label="热力时间范围" className="shrink-0 rounded-full border border-line p-0.5">
          {PERIODS.map(p => (
            <button
              key={p.hours}
              type="button"
              aria-pressed={period === p.hours}
              onClick={() => choosePeriod(p.hours)}
              className={`h-6 rounded-full px-2 text-[11.5px] leading-none transition-colors ${
                period === p.hours ? "bg-ink font-semibold text-bg" : "text-ink-3 hover:text-ink"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-[12px] text-ink-3">
        {waitingFor !== null
          ? "正在统计这个窗口…"
          : hasPoints ? `${visible.length} 个城市 · ${total} 条已核准的事件新闻` : "这段时间还没有已核准的事件地点"}
      </p>
      {note && <p className="mt-1 text-[12px] text-ink-4">{note}</p>}
    </div>
    {!hasPoints ? null : failed ? (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft px-4 py-3 text-[12.5px] leading-relaxed text-ink-3">
        <span>地图没加载出来，先按城市看。</span>
        <button type="button" onClick={() => { setFailed(false); setAttempt(n => n + 1); }} className="font-medium text-accent hover:underline">重试</button>
      </div>
    ) : (
      <div className={`relative z-0 w-full bg-bg-sunk ${mapHeight}`}>
        <div ref={host} className="absolute inset-0" aria-label="可拖动、缩放的城市热力地图" />
        {/* The SDK's own control is a light widget with its own shadow; these two
            buttons sit in the card's palette and follow the theme with it. */}
        <div className="absolute right-2 top-2 z-10 flex flex-col overflow-hidden rounded-lg border border-line-strong bg-surface/95 shadow-sm backdrop-blur-sm">
          <button
            type="button"
            aria-label="放大"
            title="放大"
            disabled={zoom >= ZOOM_MAX}
            onClick={() => map.current?.zoomIn()}
            className="flex size-7 items-center justify-center text-[15px] leading-none text-ink-2 transition-colors hover:bg-bg-sunk hover:text-ink disabled:text-ink-4/50 disabled:hover:bg-transparent"
          >
            +
          </button>
          <button
            type="button"
            aria-label="缩小"
            title="缩小"
            disabled={zoom <= ZOOM_MIN}
            onClick={() => map.current?.zoomOut()}
            className="flex size-7 items-center justify-center border-t border-line-soft text-[15px] leading-none text-ink-2 transition-colors hover:bg-bg-sunk hover:text-ink disabled:text-ink-4/50 disabled:hover:bg-transparent"
          >
            −
          </button>
        </div>
      </div>
    )}
    {listPlaces.length > 0 && (
      <ol className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-line-soft px-4 py-3 sm:grid-cols-3">
        {listPlaces.map((point, index) => (
          <li key={point.id}>
            <button type="button" onClick={() => onChoose(point.id)} className="flex w-full items-baseline gap-1.5 py-1 text-left text-[12.5px] text-ink-2 hover:text-accent">
              <span className="num w-4 shrink-0 text-[11px] text-ink-4">{index + 1}</span>
              <span className="truncate">{point.name}</span>
              <span className="num ml-auto shrink-0 text-[11.5px] text-ink-4">{point.count}</span>
            </button>
          </li>
        ))}
      </ol>
    )}
    {hasPoints && !failed && (
      // One line is enough: the circles explain themselves, and 高德's own credit is on the map.
      <p className="border-t border-line-soft px-4 py-2 text-[11px] leading-relaxed text-ink-4">
        底图由高德地图提供，会收到你的 IP。
      </p>
    )}
  </section>;
}
