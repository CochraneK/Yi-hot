import { useEffect, useRef, useState } from "react";
import type { GeoHeatPoint, GeoHeatResponse, GeoLevel } from "@aihot/contracts/site";
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

/** How many cities get a name on the map itself; more would fight the base map. */
const LABELLED_CITIES = 8;

/** 48 h is the window the ranking uses, so the card opens on the same question. */
const PERIODS = [
  { hours: 48, label: "48h", heading: "近 48 小时" },
  { hours: 168, label: "周", heading: "近一周" },
  { hours: 720, label: "月", heading: "近一月" },
] as const;

/**
 * How coarse the dots are. 市 is the default because that is how a reader names
 * where they live; 省 answers "which province is busy" and 区 answers "which part
 * of town". All three regroup the same stories — switching does not hide news,
 * except at 区, where a story filed at city level has no county to sit in.
 */
const LEVELS = [
  { key: "province", label: "省", unit: "个省级地区", noun: "省份" },
  { key: "city", label: "市", unit: "个城市", noun: "城市" },
  { key: "district", label: "区", unit: "个区县", noun: "区县" },
] as const;

/** Module-level so an empty window is the same array on every render. */
const NO_POINTS: GeoHeatPoint[] = [];

function headingOf(hours: number): string {
  return PERIODS.find(p => p.hours === hours)?.heading ?? `近 ${hours} 小时`;
}

/**
 * Counties have no coordinates of their own — every source we trust stops at the
 * prefecture — so the API hands them back at their city's centre. Plotting that
 * as-is puts 江宁区 and 雨花台区 on one pixel and only the last one is clickable.
 * A short golden-angle spiral keeps each county its own dot, and the error stays
 * at "somewhere in this city", which is what the data actually says.
 */
function spreadCounties(points: GeoHeatPoint[]): GeoHeatPoint[] {
  const groups = new Map<string, GeoHeatPoint[]>();
  for (const point of points) {
    const key = `${point.lat.toFixed(2)},${point.lon.toFixed(2)}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(point);
    else groups.set(key, [point]);
  }
  const spread: GeoHeatPoint[] = [];
  for (const bucket of groups.values()) {
    if (bucket.length === 1) { spread.push(bucket[0]!); continue; }
    bucket.forEach((point, index) => {
      const angle = index * 2.399963;
      const radius = 0.16 * Math.sqrt(index);
      spread.push({
        ...point,
        lat: point.lat + radius * Math.sin(angle),
        // Degrees of longitude shrink toward the pole; without this the ring
        // reads as a flat line above 哈尔滨.
        lon: point.lon + (radius * Math.cos(angle)) / Math.max(0.3, Math.cos((point.lat * Math.PI) / 180)),
      });
    });
  }
  return spread;
}

/**
 * Names for cities that are both busy and far enough apart to stay readable.
 * Taking the top eight by count alone piles 南京/上海/杭州 on top of each other;
 * a minimum separation spreads them over the country instead.
 */
function pickSpread<T extends { point: GeoHeatPoint }>(
  items: T[], limit: number, minLon = 4.5, minLat = 3.5, minCount = 2,
): T[] {
  const picked: T[] = [];
  for (const item of [...items].sort((a, b) => b.point.count - a.point.count)) {
    if (item.point.count < minCount) break;
    const crowded = picked.some(p =>
      Math.abs(p.point.lon - item.point.lon) < minLon && Math.abs(p.point.lat - item.point.lat) < minLat);
    if (crowded) continue;
    picked.push(item);
    if (picked.length >= limit) break;
  }
  return picked;
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
  // Bumped whenever a map instance is created. A `ready` boolean cannot drive
  // the redraw: switching level unmounts the map (no points yet), the fetch fills
  // the cache, and the new instance would flip ready false→true inside one batch
  // — React never renders the false, so the flag ends where it started and the
  // redraw effect, whose refs were just nulled, never runs. A counter always
  // changes, so the points always land on a live instance.
  const [mapVersion, setMapVersion] = useState(0);
  // Whether the card has ever had something to draw. Swapping level starts with
  // an empty array until the answer lands, and gating the container on "has
  // points right now" unmounted it: the instance was destroyed, the tiles
  // reloaded, and the card lost its height for a frame — the page below,
  // 继续看 No.01 included, jumped up and came back. Once a map exists it stays.
  const [solid, setSolid] = useState(points.length > 0);
  // setFitView is a camera move, and it used to run on every redraw: switching
  // 窗口 or 层级 yanked a reader who had zoomed into their province back out to
  // the whole country. The fit belongs to the first draw of an instance only.
  const fitted = useRef(false);
  const [zoom, setZoom] = useState(4);
  const [period, setPeriod] = useState(hours);
  const [level, setLevel] = useState<GeoLevel>("city");
  const [cache, setCache] = useState<Record<string, GeoHeatPoint[]>>({});
  const [waitingFor, setWaitingFor] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const choose = useRef(onChoose);
  choose.current = onChoose;

  // The page's own window always wins: props come from the loader and may be
  // fresher than whatever we fetched a minute ago. Only the 48 h city view is
  // free; every other combination is a request, and its answer is cached.
  const currentKey = `${period}:${level}`;
  const fromLoader = period === hours && level === "city";
  const visible = fromLoader ? points : cache[currentKey] ?? NO_POINTS;
  const hasPoints = visible.length > 0;
  const total = visible.reduce((sum, p) => sum + p.count, 0);

  useEffect(() => {
    if (hasPoints) setSolid(true);
  }, [hasPoints]);

  useEffect(() => {
    // `solid`, not `hasPoints`: the container is what has to exist, and it
    // survives an empty window from here on.
    if (failed || !solid || !host.current) return;
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
      setMapVersion(version => version + 1);

      cleanup = () => {
        window.clearTimeout(timer);
        themeWatcher.disconnect();
        try { instance.destroy(); } catch { /* the container may already be gone */ }
        map.current = null;
        ns.current = null;
        circles.current = [];
        fitted.current = false;
      };
    }).catch(() => { if (!disposed) setFailed(true); });

    return () => { disposed = true; window.clearTimeout(timer); cleanup(); };
  }, [failed, attempt, solid, amapKey, amapSecurityCode]);

  // Circles follow the window; the base map is never rebuilt, so a reader who has
  // zoomed into their province stays there while the numbers change.
  useEffect(() => {
    const instance = map.current;
    const AMap = ns.current;
    // Both are refs, so this is the live instance, not the one this render
    // closed over — checking `ready` here would answer for a map that may
    // already be destroyed.
    if (!instance || !AMap) return;
    // Between the click and the answer `visible` is empty. Leaving the previous
    // circles up keeps the card still; wiping them paints a bare map for a frame
    // or two, which is the other half of the flash.
    if (!visible.length && waitingFor !== null) return;
    if (circles.current.length) {
      try { instance.remove(circles.current); } catch { /* first draw has nothing to drop */ }
    }
    const plotted = level === "district" ? spreadCounties(visible) : visible;
    const max = Math.max(...plotted.map(p => p.count), 1);
    // A province dot is a summary, not a place with a feed behind it, so it does
    // not pretend to open one. Cities and counties both map to a `?place=` id.
    const clickable = level !== "province";
    const drawn: Array<{ point: GeoHeatPoint; marker: AMapOverlay }> = [];
    for (const point of plotted) {
      // Area, not radius, tracks the count: a city with 4x the stories reads as
      // twice the circle instead of four times, which keeps one busy city from
      // swallowing the map. The ceiling is modest because a month of news puts
      // 300 circles on one province, and larger discs merge into a red slab with
      // no gradient left in it.
      const radius = 4 + 11 * Math.sqrt(point.count / max);
      // Places are geonames WGS-84; 高德 draws GCJ-02.
      const [lng, lat] = wgs84ToGcj02(point.lon, point.lat);
      const marker = new AMap.CircleMarker({
        center: [lng, lat],
        radius,
        strokeColor: "#DA291C",
        strokeOpacity: 0.5,
        strokeWeight: 1,
        fillColor: "#DA291C",
        fillOpacity: 0.22,
        bubble: true,
        cursor: clickable ? "pointer" : "default",
      });
      if (clickable) marker.on("click", () => choose.current(point.id));
      drawn.push({ point, marker });
    }
    // Names, for the cities a reader can actually make out. Vector overlays drop
    // the `label` option silently, so the name has to be its own Text overlay; a
    // handful of them answers "where is it happening" without turning the card
    // into a list.
    for (const { point } of pickSpread(
      drawn, LABELLED_CITIES,
      // Counties of one city sit ~0.2° apart after the spread; the city-level
      // separation would keep only one label per prefecture.
      level === "district" ? 0.35 : 4.5,
      level === "district" ? 0.28 : 3.5,
      // A county with one story is the whole point of the county view — most of
      // them have one — so the "not worth a label" floor drops to 1 there.
      level === "district" ? 1 : 2,
    )) {
      const [lng, lat] = wgs84ToGcj02(point.lon, point.lat);
      const name = new AMap.Text({
        text: point.name,
        position: [lng, lat],
        anchor: "bottom-center",
        cursor: "pointer",
        // White with a dark halo so the same overlay reads on both palettes.
        style: {
          "background-color": "transparent", border: "none", padding: "0 2px",
          color: "#fff", "font-size": "11px", "font-weight": "600",
          "text-shadow": "0 1px 2px rgba(0,0,0,.95), 0 0 4px rgba(0,0,0,.85)",
        },
      });
      if (clickable) name.on("click", () => choose.current(point.id));
      drawn.push({ point, marker: name });
    }
    const markers = drawn.map(d => d.marker);
    instance.add(markers);
    circles.current = markers;
    // Fit the mainland, not every point. Overseas places are worth plotting — an
    // aid story happens where it happens — but they must not set the view: fitting
    // all 305 points on 2026-11-16 landed on [76.2, 10.3] at the minimum zoom, a
    // card full of empty Indian Ocean. Detail is the reader's call: the +/− buttons.
    const home = drawn.filter(({ point }) =>
      point.lon >= 73 && point.lon <= 136 && point.lat >= 3 && point.lat <= 54).map(d => d.marker);
    if (!fitted.current && markers.length) {
      instance.setFitView(home.length ? home : markers, false, [24, 24, 24, 24], 6);
      fitted.current = true;
    }
  }, [mapVersion, visible, level, waitingFor]);

  useEffect(() => () => inFlight.current?.abort(), []);

  function switchView(nextPeriod: number, nextLevel: GeoLevel) {
    if (nextPeriod === period && nextLevel === level) return;
    const key = `${nextPeriod}:${nextLevel}`;
    setNote(null);
    setPeriod(nextPeriod);
    setLevel(nextLevel);
    // The 48 h city view came with the page; everything else is fetched once and
    // kept, so flipping back to a window already seen costs nothing.
    if ((nextPeriod === hours && nextLevel === "city") || cache[key]) return;
    inFlight.current?.abort();
    const ctl = new AbortController();
    inFlight.current = ctl;
    setWaitingFor(key);
    fetch(`/api/site/geo/heat?hours=${nextPeriod}&level=${nextLevel}`, { headers: { accept: "application/json" }, signal: ctl.signal })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<GeoHeatResponse>;
      })
      .then(data => setCache(prev => ({ ...prev, [key]: data.points })))
      .catch(err => {
        if ((err as Error)?.name === "AbortError") return;
        // Back to the view the page already has, rather than an empty card.
        setPeriod(current => (current === nextPeriod ? hours : current));
        setLevel(current => (current === nextLevel ? "city" : current));
        setNote("这段时间没取到，先看原来的窗口。");
      })
      .finally(() => setWaitingFor(current => (current === key ? null : current)));
  }

  // The map failing is exactly when the list matters, so it survives compact mode.
  const listPlaces = failed ? visible.slice(0, 10) : compact ? [] : visible.slice(0, 12);
  const unit = LEVELS.find(l => l.key === level)?.unit ?? "个城市";
  const levelLabel = LEVELS.find(l => l.key === level)?.label ?? "市";
  const levelNoun = LEVELS.find(l => l.key === level)?.noun ?? "城市";
  const chip = (active: boolean) => `h-6 rounded-full px-2 text-[11.5px] leading-none transition-colors ${
    active ? "bg-ink font-semibold text-bg" : "text-ink-3 hover:text-ink"
  }`;

  return <section className="overflow-hidden rounded-xl border border-line bg-surface" aria-label={`${headingOf(period)}${levelNoun}热力`}>
    <div className="px-4 py-3">
      {/* Two rows of chips, both flush right with the card's padding: the window
          answers "how far back", the level answers "how fine", and stacking them
          keeps a phone from wrapping the heading into a third line. */}
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 font-semibold text-ink">{headingOf(period)}，哪里在发生</h2>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div role="group" aria-label="热力时间范围" className="rounded-full border border-line p-0.5">
            {PERIODS.map(p => (
              <button
                key={p.hours}
                type="button"
                aria-pressed={period === p.hours}
                onClick={() => switchView(p.hours, level)}
                className={chip(period === p.hours)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div role="group" aria-label="热力统计层级" className="rounded-full border border-line p-0.5">
            {LEVELS.map(l => (
              <button
                key={l.key}
                type="button"
                aria-pressed={level === l.key}
                title={`按${l.label}统计`}
                onClick={() => switchView(period, l.key)}
                className={chip(level === l.key)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-1 text-[12px] text-ink-3">
        {waitingFor !== null
          ? `正在按${levelLabel}统计这个窗口…`
          : hasPoints
            ? `${visible.length} ${unit} · ${total} 条已核准的事件新闻`
            : level === "district"
              // Saying "no reviewed places" would be false: there are cities,
              // just none of these stories reached county level.
              ? "这段时间的报道都落在城市一级，还没有进到区县的"
              : "这段时间还没有已核准的事件地点"}
      </p>
      {note && <p className="mt-1 text-[12px] text-ink-4">{note}</p>}
    </div>
    {!solid ? null : failed ? (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft px-4 py-3 text-[12.5px] leading-relaxed text-ink-3">
        <span>地图没加载出来，先按城市看。</span>
        <button type="button" onClick={() => { setFailed(false); setAttempt(n => n + 1); }} className="font-medium text-accent hover:underline">重试</button>
      </div>
    ) : (
      <div className={`relative z-0 w-full bg-bg-sunk ${mapHeight}`}>
        {/* h-full, not absolute inset-0: 高德 adds its own `amap-container` class and
            forces position:relative on this element, which voids the inset and
            collapses the map to zero height. */}
        <div ref={host} className="h-full w-full" aria-label="可拖动、缩放的城市热力地图" />
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
    {solid && !failed && (
      // One line is enough: the circles explain themselves, and 高德's own credit is on the map.
      <p className="border-t border-line-soft px-4 py-2 text-[11px] leading-relaxed text-ink-4">
        底图由高德地图提供，会收到你的 IP。
        {/* Said where the dots are, not in a footnote: a county dot is a city
            coordinate, and a province dot opens nothing. */}
        {level === "district" && " 区县没有独立坐标，点按所属城市位置排开；只算报到区县的报道。"}
        {level === "province" && " 省份只做汇总，点城市可以看当地新闻。"}
      </p>
    )}
  </section>;
}
