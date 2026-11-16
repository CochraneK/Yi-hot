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
  // A failed map collapses to one line: an empty grey slab reads as a broken page.
  const [failed, setFailed] = useState(false);
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

      // The card shows the whole country: every plotted city is on screen at once.
      // Detail is the reader's call — double-click or the map's own +/− zoom in.
      map.fitBounds(
        L.latLngBounds(points.map(p => [p.lat, p.lon] as [number, number])),
        { padding: [24, 24], maxZoom: 6, animate: false },
      );
      const observer = new ResizeObserver(() => map.invalidateSize());
      observer.observe(host.current);
      cleanup = () => { observer.disconnect(); map.remove(); };
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; cleanup(); };
  }, [failed, attempt, hasPoints, points]);

  const total = points.reduce((sum, p) => sum + p.count, 0);
  const top = compact ? [] : points.slice(0, 12);

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
      <div ref={host} className={`relative z-0 w-full bg-bg-sunk ${mapHeight}`} aria-label="可拖动、缩放的城市热力地图" />
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
    {hasPoints && !failed && (
      // One line is enough: the circles explain themselves, and the credit is on the map.
      <p className="border-t border-line-soft px-4 py-2 text-[11px] leading-relaxed text-ink-4">
        底图来自 OpenStreetMap，会收到 IP。
      </p>
    )}
  </section>;
}
