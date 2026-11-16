import { useEffect, useRef, useState } from "react";
import type { GeoHeatPoint } from "@aihot/contracts/site";
import "leaflet/dist/leaflet.css";

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
 */
/**
 * Lowest zoom the card opens at. Fitting the whole country into a 450×280 box lands
 * around level 4, where city names are unreadable; level 5 shows province capitals
 * and the big prefecture cities as actual names.
 */
const CORE_ZOOM = 5;

export function CityHeatMap({ points, hours, onChoose, compact = false, mapHeight = "h-[300px] sm:h-[380px]" }: {
  points: GeoHeatPoint[];
  hours: number;
  onChoose: (id: string) => void;
  /** On 热点 the page already ends with its own ranking, so the city list is dropped. */
  compact?: boolean;
  /** The map shrinks when the card shares a row with the lead story. */
  mapHeight?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const frame = useRef<{ all: () => void; focus: () => void } | null>(null);
  // A failed map collapses to one line: an empty grey slab reads as a broken page.
  const [failed, setFailed] = useState(false);
  // True while the view spans every point; false once it has been pushed in.
  const [wide, setWide] = useState(false);
  // Whether the card had to trade edges for legibility — only then is the toggle useful.
  const [pushed, setPushed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const choose = useRef(onChoose);
  choose.current = onChoose;
  const hasPoints = points.length > 0;

  useEffect(() => {
    if (failed || !hasPoints || !host.current) return;
    let disposed = false;
    let cleanup = () => {};
    // One bad tile is a hiccup; a map that never painted a tile is a failure.
    let drew = false;
    import("leaflet").then(L => {
      if (disposed || !host.current) return;
      const map = L.map(host.current, { minZoom: 2, maxZoom: 12, scrollWheelZoom: false, worldCopyJump: true }).setView([34, 105], 4);
      // The card is ~280px wide, so drop Leaflet's own prefix and keep only the
      // credit the tile policy asks for — otherwise the line runs to the edge.
      map.attributionControl.setPrefix(false);
      const tile = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, referrerPolicy: "strict-origin-when-cross-origin",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      }).addTo(map);
      tile.on("tileload", () => { drew = true; });
      tile.on("tileerror", () => { if (!disposed && !drew) setFailed(true); });

      const max = Math.max(...points.map(p => p.count), 1);
      for (const point of points) {
        // Area, not radius, tracks the count: a city with 4x the stories reads as
        // twice the circle instead of four times, which keeps one busy city from
        // swallowing the map.
        const radius = 5 + 15 * Math.sqrt(point.count / max);
        const marker = L.circleMarker([point.lat, point.lon], {
          radius,
          color: "#DA291C",
          weight: 1,
          opacity: 0.55,
          fillColor: "#DA291C",
          fillOpacity: 0.28,
        }).addTo(map);
        marker.bindTooltip(`${point.name} · ${point.count} 条`, { direction: "top", offset: [0, -radius] });
        marker.on("click", () => choose.current(point.id));
      }

      // Fitting every point into a card this small lands around zoom 4, where even
      // provincial capitals are a smudge among the circles. So frame the country once,
      // then push one level in around the story-weighted centre of gravity — never
      // below CORE_ZOOM — and let the edges of the map fall outside. The "看全国"
      // button is one click back to the whole picture.
      const allBounds = L.latLngBounds(points.map(p => [p.lat, p.lon] as [number, number]));
      const weight = points.reduce((sum, p) => sum + p.count, 0) || 1;
      const centre = L.latLng(
        points.reduce((sum, p) => sum + p.lat * p.count, 0) / weight,
        points.reduce((sum, p) => sum + p.lon * p.count, 0) / weight,
      );
      const frameAll = () => map.fitBounds(allBounds, { padding: [24, 24], maxZoom: 6, animate: false });
      frameAll();
      const fitted = map.getZoom();
      const focus = () => map.setView(centre, Math.max(fitted, CORE_ZOOM), { animate: false });
      if (fitted < CORE_ZOOM) focus();
      frame.current = { all: frameAll, focus };
      // Any pan or zoom — ours or the reader's — decides what the toggle offers next.
      map.on("moveend", () => { if (!disposed) setWide(map.getZoom() < CORE_ZOOM); });
      setWide(fitted >= CORE_ZOOM);
      setPushed(fitted < CORE_ZOOM);
      const observer = new ResizeObserver(() => map.invalidateSize());
      observer.observe(host.current);
      cleanup = () => { observer.disconnect(); frame.current = null; map.remove(); };
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; cleanup(); };
  }, [failed, attempt, hasPoints, points]);

  const total = points.reduce((sum, p) => sum + p.count, 0);
  const top = compact ? [] : points.slice(0, 12);
  const switchView = () => {
    const f = frame.current;
    if (!f) return;
    if (wide) f.focus(); else f.all();
  };

  return <section className="overflow-hidden rounded-xl border border-line bg-surface" aria-label={`近 ${hours} 小时城市热力`}>
    <div className="px-4 py-3">
      <h2 className="font-semibold text-ink">近 {hours} 小时，哪里在发生</h2>
      <p className="mt-1 text-[12px] text-ink-3">
        {hasPoints ? `${points.length} 个城市 · ${total} 条已核准的事件新闻` : "这段时间还没有已核准的事件地点"}
      </p>
    </div>
    {!hasPoints ? null : failed ? (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft px-4 py-3 text-[12.5px] leading-relaxed text-ink-3">
        <span>地图底图没加载出来，可能是网络或 OpenStreetMap 暂时不可用。</span>
        <button type="button" onClick={() => { setFailed(false); setAttempt(n => n + 1); }} className="font-medium text-accent hover:underline">重试</button>
      </div>
    ) : (
      <div className={`relative w-full ${mapHeight}`}>
        <div ref={host} className="absolute inset-0 z-0 bg-bg-sunk" aria-label="可拖动、缩放的城市热力地图" />
        {pushed && (
          <button
            type="button"
            onClick={switchView}
            className="absolute right-2 top-2 z-[700] rounded-full border border-line bg-surface/95 px-2.5 py-1 text-[11.5px] font-medium text-ink-2 shadow-sm transition-colors hover:text-ink"
          >{wide ? "看重点" : "看全国"}</button>
        )}
      </div>
    )}
    {top.length > 0 && (
      <ol className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-line-soft px-4 py-3 sm:grid-cols-3">
        {top.map((point, index) => (
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
  </section>;
}
