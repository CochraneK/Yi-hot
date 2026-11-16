import { useEffect, useRef, useState } from "react";
import type { GeoHeatPoint } from "@aihot/contracts/site";
import "leaflet/dist/leaflet.css";

/**
 * City-level heat map for the last N hours.
 *
 * Deliberately separate from NewsMap: this view has no story list of its own and
 * draws one circle per city sized by article count, so the reader can see where
 * the last two days happened without paging through a feed.
 *
 * The map is the content of this card, so it draws itself on arrival instead of
 * waiting for a click. Only reviewed event places are drawn — the same gate as
 * the city page.
 */
export function CityHeatMap({ points, hours, onChoose, compact = false }: {
  points: GeoHeatPoint[];
  hours: number;
  onChoose: (id: string) => void;
  /** On 热点 the page already ends with its own ranking, so the city list is dropped. */
  compact?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(true);
  // A failed map collapses to one line: an empty grey slab reads as a broken page.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const choose = useRef(onChoose);
  choose.current = onChoose;
  const hasPoints = points.length > 0;

  useEffect(() => {
    if (!enabled || failed || !hasPoints || !host.current) return;
    let disposed = false;
    let cleanup = () => {};
    // One bad tile is a hiccup; a map that never painted a tile is a failure.
    let drew = false;
    import("leaflet").then(L => {
      if (disposed || !host.current) return;
      const map = L.map(host.current, { minZoom: 2, maxZoom: 12, scrollWheelZoom: false, worldCopyJump: true }).setView([34, 105], 4);
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

      if (points.length) map.fitBounds(L.latLngBounds(points.map(p => [p.lat, p.lon])), { padding: [35, 35], maxZoom: 6, animate: false });
      const observer = new ResizeObserver(() => map.invalidateSize());
      observer.observe(host.current);
      cleanup = () => { observer.disconnect(); map.remove(); };
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; cleanup(); };
  }, [enabled, failed, attempt, hasPoints, points]);

  const total = points.reduce((sum, p) => sum + p.count, 0);
  const top = compact ? [] : points.slice(0, 12);

  return <section className="overflow-hidden rounded-xl border border-line bg-surface" aria-label={`近 ${hours} 小时城市热力`}>
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <div>
        <h2 className="font-semibold text-ink">近 {hours} 小时，哪里在发生</h2>
        <p className="mt-1 text-[12px] text-ink-3">
          {hasPoints ? `${points.length} 个城市 · ${total} 条已核准的事件新闻` : "这段时间还没有已核准的事件地点"}
        </p>
      </div>
      {hasPoints && !failed && (
        <button type="button" onClick={() => setEnabled(v => !v)} className="rounded-full border border-line-strong px-3.5 py-1.5 text-[12px] text-ink">
          {enabled ? "收起地图" : "展开地图"}
        </button>
      )}
    </div>
    {!hasPoints ? null : failed ? (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft px-4 py-3 text-[12.5px] leading-relaxed text-ink-3">
        <span>地图底图没加载出来，可能是网络或 OpenStreetMap 暂时不可用。</span>
        <button type="button" onClick={() => { setFailed(false); setAttempt(n => n + 1); }} className="font-medium text-accent hover:underline">重试</button>
      </div>
    ) : enabled ? (
      <div ref={host} className="relative z-0 h-[300px] w-full bg-bg-sunk sm:h-[380px]" aria-label="可拖动、缩放的城市热力地图" />
    ) : (
      <div className="border-t border-line-soft px-4 py-3 text-[12.5px] text-ink-3">圆点越大，近 {hours} 小时的报道越多；点城市看它的新闻。</div>
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
      <p className="border-t border-line-soft px-4 py-2.5 text-[11.5px] leading-relaxed text-ink-4">
        底图来自 OpenStreetMap，对方会收到你的连接 IP 和本站域名。统计只含已核准的事件地点，同一篇报道只计一次。
      </p>
    )}
  </section>;
}
