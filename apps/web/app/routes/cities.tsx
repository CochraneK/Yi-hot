import { useMemo, useState } from "react";
import { Link, useLoaderData, useSearchParams } from "react-router";
import type { Route } from "./+types/cities";
import type { GeoReviewedResponse, PoolResponse } from "@aihot/contracts/site";
import { loadOr404, queryString } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { DayList, Pagination } from "../features/feed/DayList";
import { CITY_PLACES, cityClues, embedMapLink, openStreetMapLink, placeById, type CityPlace } from "../features/cities/geo";
import { cityFromOptInIp, saveReaderCity, useReaderCity } from "../features/cities/reader-city";
import { EmptyState } from "../components/ui/Page";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const selectedCity = placeById(url.searchParams.get("city"));
  const page = Math.min(Math.max(Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1), 50);
  const reviewed = Boolean(selectedCity) && url.searchParams.get("reviewed") === "1";
  // Opt-in verified view uses the shared publication-layer release/withdrawal gate.
  // The default view remains the broader (and explicitly unverified) text search.
  const data = reviewed
    ? await loadOr404<GeoReviewedResponse>(
      `/api/site/geo${queryString({ place: selectedCity!.id, page: page > 1 ? page : null })}`,
      { signal: request.signal },
    )
    : await loadOr404<PoolResponse>(
      `/api/site/pool${queryString({ q: selectedCity?.name ?? null, page: page > 1 ? page : null })}`,
      { signal: request.signal, busyRedirect: "/all/search-busy" },
    );
  return { data, city: selectedCity?.id ?? null, reviewed };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const city = placeById(loaderData?.city);
  return pageMeta({
    title: city ? `${city.name} · 城市新闻线索` : "城市地图",
    description: "按城市探索公开新闻中的地名线索；图上代表点不等于经核实的事件发生地。可手动设定所在城市。",
    path: city ? `/cities?city=${city.id}` : "/cities",
    noindex: !!city,
  });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=60" };
}

interface CountedPlace { place: CityPlace; count: number }
const VIEWS = {
  china: { left: 72, right: 136, bottom: 15, top: 56 },
  world: { left: -180, right: 180, bottom: -60, top: 75 },
};
function xy(place: CityPlace, mode: "china" | "world"): [number, number] {
  const b = VIEWS[mode];
  return [760 * (place.lon - b.left) / (b.right - b.left), 390 * (b.top - place.lat) / (b.top - b.bottom)];
}

function CityMap({ places, active, reviewed }: { places: CountedPlace[]; active: CityPlace | null; reviewed: boolean }) {
  const [view, setView] = useState<"china" | "world">("china");
  const bounds = VIEWS[view];
  const markers = places.filter(({ place }) => place.lon >= bounds.left && place.lon <= bounds.right && place.lat >= bounds.bottom && place.lat <= bounds.top);
  const cols = Array.from({ length: 7 }, (_, i) => i * 760 / 6);
  const rows = Array.from({ length: 5 }, (_, i) => i * 390 / 4);
  return (
    <section aria-label="城市新闻位置示意图" className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-line-soft px-4 py-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">地图上的新闻</h2>
          <p className="text-[11.5px] text-ink-4">{reviewed ? "已审核事件归属 · 仍以城市中心作代表点" : "本页地名线索 · 代表点，非事件现场"}</p>
        </div>
        <div className="flex rounded-full border border-line-soft bg-bg-sunk p-0.5">
          {(["china", "world"] as const).map((mode) => (
            <button type="button" key={mode} aria-pressed={view === mode} onClick={() => setView(mode)}
              className={`rounded-full px-3 py-1.5 text-[12px] ${view === mode ? "bg-surface font-semibold text-ink shadow-sm" : "text-ink-3"}`}>
              {mode === "china" ? "中国" : "世界"}
            </button>
          ))}
        </div>
      </div>
      <svg viewBox="0 0 760 390" role="img" aria-label={`${view === "china" ? "中国" : "世界"}经纬度示意，新闻地点可点击`}
        className="block w-full bg-[#e8eff0] dark:bg-[#233239]" style={{ aspectRatio: "760 / 390" }}>
        <rect width="760" height="390" fill="none" stroke="currentColor" strokeOpacity=".08" />
        {cols.map((x) => <line key={`x${x}`} x1={x} x2={x} y1="0" y2="390" stroke="#6c8b94" strokeOpacity=".22" strokeDasharray="3 5" />)}
        {rows.map((y) => <line key={`y${y}`} x1="0" x2="760" y1={y} y2={y} stroke="#6c8b94" strokeOpacity=".22" strokeDasharray="3 5" />)}
        <text x="20" y="28" fontSize="12" fill="#607984">{view === "china" ? "城市经纬度分布" : "全球经纬度分布"}</text>
        {markers.map(({ place, count }) => {
          const [x, y] = xy(place, view);
          const chosen = active?.id === place.id;
          return (
            <a key={place.id} href={`/yihot/cities?city=${encodeURIComponent(place.id)}${reviewed ? "&reviewed=1" : ""}`} aria-label={`${place.name}：本页 ${count} 条${reviewed ? "已审核" : "地点线索"}新闻`}>
              <circle cx={x} cy={y} r={chosen ? 13 : 9} fill={chosen ? "#a63c39" : "#a74d47"} fillOpacity=".92" stroke="#fff" strokeWidth={chosen ? 3 : 2} />
              <text x={x} y={y + 3.5} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#fff">{count > 9 ? "9+" : count}</text>
              <text x={x} y={y - (chosen ? 18 : 14)} textAnchor="middle" fontSize="12" fontWeight="600"
                paintOrder="stroke" stroke="#e8eff0" strokeWidth="3" strokeLinejoin="round" fill="#1d424b">{place.name}</text>
            </a>
          );
        })}
        {markers.length === 0 && <text x="380" y="205" textAnchor="middle" fontSize="16" fill="#607984">{reviewed ? "暂无审核通过的事件地点" : "本页暂无可定位的地点线索"}</text>}
      </svg>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft px-4 py-2.5 text-[11.5px] text-ink-4">
        <span>{reviewed ? "本页已通过人工审核的事件归属" : "点击圆点筛选该城市 · 仅展示本页文本中可识别的地点"}</span>
        <span>经纬度示意，不含行政边界</span>
      </div>
    </section>
  );
}

export default function CitiesPage() {
  const { data, city: cityId, reviewed } = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const city = placeById(cityId);
  const readerCityId = useReaderCity();
  const readerCity = placeById(readerCityId);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [showRealMap, setShowRealMap] = useState(false);
  const [region, setRegion] = useState("全部");
  const regions = useMemo(() => ["全部", ...new Set(CITY_PLACES.map((place) => place.country === "中国" ? place.region : place.country))], []);

  const matches = useMemo(() => data.items.map((item) => ({ item, places: reviewed && city ? [city] : cityClues(item) }))
    .filter((row) => (!city || row.places.some((place) => place.id === city.id))
      && (reviewed || region === "全部" || row.places.some((place) => (place.country === "中国" ? place.region : place.country) === region))),
    [data.items, cityId, reviewed, region]);
  const counts = useMemo(() => {
    const map = new Map<string, CountedPlace>();
    for (const row of matches) for (const place of row.places) {
      const current = map.get(place.id);
      map.set(place.id, { place, count: (current?.count ?? 0) + 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.place.name.localeCompare(b.place.name, "zh-CN"));
  }, [matches]);

  async function findMyCity() {
    setWorking(true);
    setMessage("");
    try {
      const id = await cityFromOptInIp();
      if (!id) { setMessage("无法可靠识别城市，请手动选择；不影响阅读。"); return; }
      saveReaderCity(id);
      setMessage("已依据 IP 估计城市；如有误差可手动更改。");
    } catch {
      setMessage("定位服务暂不可用。你仍可以手动选择城市。");
    } finally {
      setWorking(false);
    }
  }

  function pageHref(page: number) {
    const sp = new URLSearchParams(params);
    if (page === 1) sp.delete("page");
    else sp.set("page", String(page));
    return `/cities?${sp.toString()}`;
  }

  return (
    <div className="pb-8">
      <div className="pb-4 pt-5 lg:pt-0">
        <h1 className="text-[23px] font-semibold text-ink">城市地图</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">{reviewed ? "只看经人工审核、关联具体事件的新闻。地图点仍为城市代表点。" : "从新闻走近一座城市。这里展示公开摘要中的地名提及，尚不等于经核实的新闻发生地。"}</p>
      </div>
      <section className="mb-4 rounded-xl border border-line-soft bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="city-search" className="text-[12.5px] font-medium text-ink-3">查找城市</label>
          <select id="city-search" value={city?.id ?? ""} onChange={(e) => {
            const id = e.target.value;
            window.location.assign(id ? `/yihot/cities?city=${encodeURIComponent(id)}${reviewed ? "&reviewed=1" : ""}` : "/yihot/cities");
          }} className="min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 py-2 text-[13px] text-ink">
            <option value="">最新全部</option>
            {CITY_PLACES.map((p) => <option key={p.id} value={p.id}>{p.country} · {p.region} · {p.name}</option>)}
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor="my-city" className="text-[12px] text-ink-3">我的城市</label>
          <select id="my-city" value={readerCityId ?? ""} onChange={(e) => { saveReaderCity(e.target.value || null); setMessage(""); }}
            className="min-w-[110px] max-w-full rounded-lg border border-line-soft bg-surface px-2 py-1.5 text-[12px] text-ink">
            <option value="">不设置</option>
            {CITY_PLACES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button type="button" disabled={working} onClick={findMyCity}
            className="rounded-full border border-line-strong px-3 py-1.5 text-[12px] text-ink-2 disabled:opacity-50">
            {working ? "正在识别…" : "按 IP 估计"}
          </button>
          {readerCity && <Link to={`/cities?city=${readerCity.id}`} className="text-[12px] font-medium text-accent">看我的城市</Link>}
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-ink-4">
          只有点击「按 IP 估计」才会连接第三方 ipwho.is；它会收到你的公网 IP。本站只在当前浏览器保存城市选择，不保存 IP 或精确坐标。使用代理可能识别到代理所在城市。
        </p>
        {message && <p role="status" className="mt-1 text-[12px] text-ink-3">{message}</p>}
      </section>
      {city && (
        <div className="mb-3 flex items-center gap-2 text-[12px]">
          <Link to={`/cities?city=${city.id}`} className={`rounded-full px-3 py-1.5 ${!reviewed ? "bg-accent-soft font-semibold text-accent" : "border border-line-soft text-ink-3"}`}>地名线索</Link>
          <Link to={`/cities?city=${city.id}&reviewed=1`} className={`rounded-full px-3 py-1.5 ${reviewed ? "bg-accent-soft font-semibold text-accent" : "border border-line-soft text-ink-3"}`}>已审核地点</Link>
          <span className="text-ink-4">仅事件发生地；无审核记录不代表当地没有新闻</span>
        </div>
      )}
      <CityMap places={counts} active={city} reviewed={reviewed} />
      {city && (
        <div className="mt-3 rounded-xl border border-line-soft bg-surface p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] text-ink-2"><strong>{city.name}</strong> · 地图坐标是城市代表点</p>
            <div className="flex gap-3 text-[12px] text-accent">
              <button type="button" onClick={() => setShowRealMap((v) => !v)}>{showRealMap ? "收起实地图" : "查看实地图"}</button>
              <a href={openStreetMapLink(city)} target="_blank" rel="noopener noreferrer">打开 OpenStreetMap</a>
            </div>
          </div>
          {showRealMap && (
            <div className="mt-3">
              <iframe title={`${city.name} OpenStreetMap 地图`} src={embedMapLink(city)}
                className="h-64 w-full rounded-lg border border-line-soft" loading="lazy" referrerPolicy="no-referrer" />
              <p className="mt-1 text-[11px] text-ink-4">地图加载后，地图服务方可以获得你的连接信息；标记的是城市中心而非新闻发生地。© OpenStreetMap contributors</p>
            </div>
          )}
        </div>
      )}
      <div className="mt-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold text-ink">{city ? `${city.name}${reviewed ? " · 已审核" : "相关"}` : "最新城市线索"}</h2>
          <p className="mt-1 text-[12px] text-ink-4">{reviewed ? `${data.total} 条经人工核实的事件地点关联 · 本页 ${matches.length} 条` : `${data.total} 条文本搜索结果 · 本页 ${matches.length} 条识别到地点`} · 其他新闻仍在 <Link to="/all" className="text-accent">完整动态</Link></p>
        </div>
        {!reviewed && <select aria-label="本页地区筛选" value={region} onChange={(e) => setRegion(e.target.value)}
          className="max-w-[130px] rounded-lg border border-line-soft bg-surface px-2 py-1.5 text-[12px] text-ink">
          {regions.map((r) => <option key={r} value={r}>{r === "全部" ? "本页全部地区" : r}</option>)}
        </select>}
      </div>
      {counts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {counts.slice(0, 12).map(({ place, count }) => (
            <Link key={place.id} to={`/cities?city=${place.id}${reviewed ? "&reviewed=1" : ""}`} className="rounded-full border border-line-soft bg-surface px-2.5 py-1 text-[12px] text-ink-3 hover:text-accent">
              {place.name} <span className="num text-ink-4">{count}</span>
            </Link>
          ))}
          {city && <Link to="/cities" className="rounded-full px-2.5 py-1 text-[12px] text-accent">清除城市筛选</Link>}
        </div>
      )}
      {matches.length ? <div className="mt-4"><DayList items={matches.map((m) => m.item)} todayCount={null} showTags /></div>
        : <div className="mt-4"><EmptyState title={reviewed ? "暂无人工核实的事件地点" : "本页没有明确的城市线索"}>{reviewed ? "审核记录尚未覆盖所有历史新闻；可切回地名线索查看更广泛的报道。" : "可翻页查看其他新闻，或回到完整动态。"}</EmptyState></div>}
      <Pagination page={data.page} pageCount={data.pageCount} href={pageHref} />
      <p className="mt-5 text-[12px] leading-relaxed text-ink-4">{reviewed ? "已审核视图按经人工确认的事件归属查询全库公开新闻，不把机构所在地或仅提及地点混入。审核覆盖率仍需扩大；地图采用城市代表点而不是现场坐标。" : "地名线索视图按城市文字检索已公开新闻，不代表事件在当地发生；切换城市后可选「已审核地点」查看更严谨的事件地理索引。"}</p>
    </div>
  );
}
