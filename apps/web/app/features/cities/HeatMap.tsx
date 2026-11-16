import { useEffect, useRef, useState } from "react";
import type { GeoHeatPoint } from "@aihot/contracts/site";
import { loadAMap, wgs84ToGcj02, type AMapOverlay } from "./amap";

/**
 * City-level heat map for the last N hours.
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
 */
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
  // A failed map collapses to a list: an empty grey slab reads as a broken page.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const choose = useRef(onChoose);
  choose.current = onChoose;
  const hasPoints = points.length > 0;

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

    loadAMap(amapKey, amapSecurityCode).then(AMap => {
      if (disposed || !host.current) return;
      const map = new AMap.Map(host.current, {
        zoom: 4,
        center: [105, 35],
        zooms: [3, 12],
        viewMode: "2D",
        resizeEnable: true,
        scrollWheelZoom: false,
        // The site is grey-white; 高德's default palette is far too loud beside it.
        mapStyle: "amap://styles/whitesmoke",
      });
      map.on("complete", () => { drew = true; window.clearTimeout(timer); });

      const max = Math.max(...points.map(p => p.count), 1);
      const overlays: AMapOverlay[] = [];
      for (const point of points) {
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
        overlays.push(marker);
      }
      map.add(overlays);

      // The card shows the whole country: every plotted city is on screen at once.
      // Detail is the reader's call — double-click or the map's own +/− zoom in.
      map.setFitView(overlays, false, [24, 24, 24, 24], 6);

      cleanup = () => {
        window.clearTimeout(timer);
        try { map.destroy(); } catch { /* the container may already be gone */ }
      };
    }).catch(() => { if (!disposed) setFailed(true); });

    return () => { disposed = true; window.clearTimeout(timer); cleanup(); };
  }, [failed, attempt, hasPoints, points, amapKey, amapSecurityCode]);

  const total = points.reduce((sum, p) => sum + p.count, 0);
  // The map failing is exactly when the list matters, so it survives compact mode.
  const listPlaces = failed ? points.slice(0, 10) : compact ? [] : points.slice(0, 12);

  return <section className="overflow-hidden rounded-xl border border-line bg-surface" aria-label={`近 ${hours} 小时城市热力`}>
    <div className="px-4 py-3">
      <h2 className="font-semibold text-ink">近 {hours} 小时，哪里在发生</h2>
      <p className="mt-1 text-[12px] text-ink-3">
        {hasPoints ? `${points.length} 个城市 · ${total} 条已核准的事件新闻` : "这段时间还没有已核准的事件地点"}
      </p>
    </div>
    {!hasPoints ? null : failed ? (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft px-4 py-3 text-[12.5px] leading-relaxed text-ink-3">
        <span>地图没加载出来，先按城市看。</span>
        <button type="button" onClick={() => { setFailed(false); setAttempt(n => n + 1); }} className="font-medium text-accent hover:underline">重试</button>
      </div>
    ) : (
      <div ref={host} className={`relative z-0 w-full bg-bg-sunk ${mapHeight}`} aria-label="可拖动、缩放的城市热力地图" />
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
