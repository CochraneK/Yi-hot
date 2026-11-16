import { useEffect, useRef, useState } from "react";
import type { GeoEventPlace, FeedItemSummary } from "@aihot/contracts/site";
import "leaflet/dist/leaflet.css";

type MapPlace = GeoEventPlace & { count: number };
export function NewsMap({ places, items, onChoose }: { places: MapPlace[]; items: FeedItemSummary[]; onChoose: (id: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [failure, setFailure] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedPlaces = places.filter(p => selectedIds.includes(p.id));
  const choose = useRef(onChoose);
  choose.current = onChoose;
  useEffect(() => {
    if (!enabled || failure || !host.current) return;
    let disposed = false;
    let cleanup = () => {};
    // One bad tile is a hiccup; a map that never painted a tile is a failure.
    let drew = false;
    import("leaflet").then(L => {
      if (disposed || !host.current) return;
      const map = L.map(host.current, { minZoom: 2, maxZoom: 16, scrollWheelZoom: false, worldCopyJump: true }).setView([34, 105], 4);
      const tile = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, referrerPolicy: "strict-origin-when-cross-origin",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      }).addTo(map);
      tile.on("tileload", () => { drew = true; });
      tile.on("tileerror", () => { if (!disposed && !drew) setFailure("底图暂不可用，仍可使用下方列表和地区筛选。"); });
      const layer = L.layerGroup().addTo(map);
      function render() {
        layer.clearLayers();
        // Cluster by screen position at the current zoom; labels count places, not unique stories.
        const groups = new Map<string, MapPlace[]>();
        for (const p of places) {
          const pixel = map.project([p.lat, p.lon]);
          const key = `${Math.floor(pixel.x / 55)}:${Math.floor(pixel.y / 55)}`;
          groups.set(key, [...(groups.get(key) ?? []), p]);
        }
        for (const group of groups.values()) {
          const p = group[0]!;
          const clustered = group.length > 1;
          const label = clustered ? `${group.length}地` : String(p.count);
          const marker = L.marker([p.lat, p.lon], { title: clustered ? `${group.length}个地点，点击展开` : `${p.name}：${p.count}条新闻`,
            alt: clustered ? `${group.length}个地点` : p.name,
            icon: L.divIcon({ className: "yihot-map-marker", html: `<span>${label}</span>`, iconSize: [42, 42], iconAnchor: [21, 21] }),
          }).addTo(layer);
          // Leaflet popups extended outside the 340px mobile map and could sit
          // underneath the map's own close button. Instead select the map pin
          // and render its accessible news actions in normal document flow below.
          marker.on("click", () => {
            setSelectedIds(group.map(place => place.id));
            if (clustered && map.getZoom() < 16) {
              map.fitBounds(L.latLngBounds(group.map(place => [place.lat, place.lon])), {
                padding: [30, 30], maxZoom: map.getZoom() + 3, animate: false,
              });
            }
          });
        }
      }
      render();
      map.on("zoomend", render);
      if (places.length) map.fitBounds(L.latLngBounds(places.map(p => [p.lat, p.lon])), { padding: [35, 35], maxZoom: 9, animate: false });
      const observer = new ResizeObserver(() => map.invalidateSize());
      observer.observe(host.current);
      cleanup = () => { observer.disconnect(); map.remove(); };
    }).catch(() => { if (!disposed) setFailure("地图组件加载失败，仍可使用下方列表和地区筛选。"); });
    return () => { disposed = true; cleanup(); };
  }, [enabled, failure, places, items]);

  return <section className="overflow-hidden rounded-xl border border-line bg-surface" aria-label="新闻地图">
    <div className="flex flex-wrap items-center justify-between gap-2 p-4">
      <div><h2 className="font-semibold text-ink">地图上的新闻</h2><p className="mt-1 text-[12px] text-ink-3">已审核的事件地点 · 标记为登记的城市或地区代表点</p></div>
      <button type="button" onClick={() => { setSelectedIds([]); setFailure(""); setEnabled(v => !v); }} className="rounded-full border border-line-strong px-3.5 py-1.5 text-[12px] text-ink">{enabled ? "关闭地图" : "加载交互地图"}</button>
    </div>
    {enabled && !failure ? <div ref={host} className="relative z-0 h-[340px] w-full bg-bg-sunk sm:h-[430px]" aria-label="可拖动、缩放的新闻地图" />
      : failure ? (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft px-4 py-3 text-[12.5px] leading-relaxed text-ink-3">
          <span>{failure}</span>
          <button type="button" onClick={() => setFailure("")} className="font-medium text-accent hover:underline">重试</button>
        </div>
      ) : <div className="bg-bg-sunk px-4 py-8 text-center text-[13px] text-ink-3">{places.length ? `${places.length} 个地点已有新闻，可加载地图探索。` : "还没有审核通过的事件地点。"}</div>}
    {enabled && !failure && selectedPlaces.length > 0 && (
      <div role="region" aria-label="所选地图地点" className="space-y-3 border-t border-line-soft bg-surface px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-ink">所选地点</h3>
          <button type="button" onClick={() => setSelectedIds([])} className="rounded-full px-3 py-2 text-[12px] text-ink-3">取消选择</button>
        </div>
        {selectedPlaces.map(place => (
          <div key={place.id} className="space-y-1 border-t border-line-soft pt-2 first:border-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-ink">{place.name} · {place.count} 条新闻</span>
              <button type="button" data-geo-place-link={place.id} onClick={() => onChoose(place.id)} className="min-h-10 rounded-full bg-bg-sunk px-3 text-[12px] font-medium text-accent">查看这个地点的新闻</button>
            </div>
            {items.filter(item => item.eventPlaces?.some(p => p.id === place.id)).slice(0,3).map(item => (
              <a key={item.id} href={`/yihot/items/${encodeURIComponent(item.id)}`} className="block py-1 text-[12.5px] leading-relaxed text-ink-2 underline-offset-2 hover:underline">{item.title}</a>
            ))}
          </div>
        ))}
      </div>
    )}
    <div className="space-y-1 border-t border-line-soft p-3 text-[11.5px] text-ink-4">
      <p>加载后 OpenStreetMap 会收到连接 IP 和本站域名；不发送你的城市选择。可拖动、双击或用加减按钮缩放，圆点数字为该地点的新闻数。</p>
      <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer" className="text-accent">反馈底图问题</a>
    </div>
  </section>;
}
