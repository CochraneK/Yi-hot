import { useEffect, useMemo, useState } from "react";
import { Form, Link, useLoaderData, useNavigate, useSearchParams } from "react-router";
import type { Route } from "./+types/cities";
import type { GeoEventPlace, GeoHeatResponse, GeoReviewedResponse, PoolResponse } from "@aihot/contracts/site";
import { loadOr404, queryString } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { DayList, Pagination } from "../features/feed/DayList";
import { CITY_PLACES, cityClues, cityCountryLabel, placeById } from "../features/cities/geo";
import { locationFromOptInIp, saveReaderLocation, staticReaderLocation, useReaderLocation } from "../features/cities/reader-city";
import { NewsMap } from "../features/cities/NewsMap";
import { CityHeatMap } from "../features/cities/HeatMap";
import { EmptyState } from "../components/ui/Page";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const page = Math.min(Math.max(Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1), 50);
  // Preserve old /cities?city=… links as text clues; new filters use canonical place=… .
  const clues = url.searchParams.get("reviewed") === "0" || (url.searchParams.has("city") && !url.searchParams.has("reviewed"));
  if (clues) {
    const city = placeById(url.searchParams.get("city"));
    const [data, heat] = await Promise.all([
      loadOr404<PoolResponse>(`/api/site/pool${queryString({ q: city?.name, page })}`,
        { signal: request.signal, busyRedirect: "/all/search-busy" }),
      loadOr404<GeoHeatResponse>(`/api/site/geo/heat?hours=48`, { signal: request.signal }),
    ]);
    return { kind: "clues" as const, data, city: city?.id ?? null, heat };
  }
  const params = new URLSearchParams();
  for (const key of ["place", "country", "region", "lat", "lon", "radius"]) {
    const value = url.searchParams.get(key);
    if (value !== null && value !== "") params.set(key, value);
  }
  // Legacy reviewed links remain valid too, including non-static canonical IDs via place=… .
  if (!params.has("place") && url.searchParams.get("city")) params.set("place", url.searchParams.get("city")!);
  params.set("page", String(page));
  const [data, heat] = await Promise.all([
    loadOr404<GeoReviewedResponse>(`/api/site/geo?${params}`, { signal: request.signal }),
    // The heat window is fixed at 48h: it answers "where is it happening now",
    // not "everything ever filed here", so it does not follow the page filters.
    loadOr404<GeoHeatResponse>(`/api/site/geo/heat?hours=48`, { signal: request.signal }),
  ]);
  return { kind: "reviewed" as const, data, city: null, heat };
}
export function meta({ location }: Route.MetaArgs) {
  return pageMeta({ title: "城市地图", description: "从地图、地区和附近范围探索经审核的新闻事件地点。", path: "/cities", noindex: !!location.search });
}
export function headers() { return { "Cache-Control": "public, max-age=0, s-maxage=60" }; }
const control = "min-w-0 max-w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[13px] text-ink";
const action = "rounded-full border border-line-strong px-4 py-2 text-[12px] text-ink disabled:opacity-50";
const countryName = cityCountryLabel;

export default function CitiesPage() {
  const result = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const reader = useReaderLocation();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [radius, setRadius] = useState(params.get("radius") ?? "100");
  const [chosenCountry, setChosenCountry] = useState(params.get("country") ?? "");
  const urlCountry = params.get("country") ?? "";
  useEffect(() => setChosenCountry(urlCountry), [urlCountry]);
  const geo = result.kind === "reviewed" ? result.data : null;
  const catalog = geo?.catalog ?? [];
  const choices = useMemo(() => {
    const m = new Map<string, GeoEventPlace>(CITY_PLACES.map(p => [p.id, { ...staticReaderLocation(p.id)!, precision: "city" as const }]));
    for (const p of catalog) if (p.precision === "city") m.set(p.id, p);
    if (reader && !m.has(reader.id)) m.set(reader.id, { ...reader, precision: "city" });
    // Registry order is stable and already groups Chinese/overseas cities; append canonical entries in API order.
    // Avoid runtime ICU collation differences during SSR hydration.
    return [...m.values()];
  }, [catalog, reader]);
  const countries = geo?.countries ?? [...new Set(catalog.map(p => p.countryCode))].sort();
  const regions = chosenCountry === urlCountry && geo?.regions?.length ? geo.regions
    : [...new Set(catalog.filter(p => p.countryCode === chosenCountry && p.region).map(p => p.region!))].sort();
  const selected = catalog.find(p => p.id === params.get("place")) ?? geo?.places.find(p => p.id === params.get("place"));
  const items = result.kind === "reviewed" ? result.data.items
    : result.data.items.filter(item => cityClues(item).some(p => !result.city || p.id === result.city));
  function href(page: number) { const p = new URLSearchParams(params); p.set("page", String(page)); return `/cities?${p}`; }
  function choosePlace(id: string) { navigate(`/cities?place=${encodeURIComponent(id)}`); }
  function nearby(lat: number, lon: number) { navigate(`/cities?${new URLSearchParams({ lat: String(lat), lon: String(lon), radius })}`); }
  async function locate() {
    setWorking(true); setMessage("");
    try {
      const location = await locationFromOptInIp(catalog);
      if (!location) { setMessage("无法可靠识别城市，请手动选择。"); return; }
      saveReaderLocation(location);
      setMessage(`已估计为${location.name}，可点击「看附近新闻」；识别有误时请手动更改。`);
    } catch { setMessage("定位服务暂不可用，请手动选择城市。"); } finally { setWorking(false); }
  }
  const nearbyActive = geo && params.has("radius");
  return <div className="pb-8">
    <header className="pb-4 pt-5 lg:pt-0"><h1 className="text-[23px] font-semibold text-ink">城市地图</h1><p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">看看一座城市正在发生什么，也看看与你相近的新闻。</p></header>
    <div className="mb-4">
      <CityHeatMap points={result.heat.points} hours={result.heat.hours} onChoose={id => navigate(`/all?place=${encodeURIComponent(id)}`)} />
    </div>
    <section className="mb-4 space-y-3 rounded-xl border border-line-soft bg-surface p-4" aria-label="我的城市">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="my-city" className="text-[13px] text-ink-3">我的城市</label>
        <select id="my-city" className={`${control} flex-1`} value={reader?.id ?? ""} onChange={e => { saveReaderLocation(choices.find(p => p.id === e.target.value) ?? null); setMessage(""); }}>
          <option value="">不设置</option>{choices.map(p => <option key={p.id} value={p.id}>{countryName(p.countryCode)} · {p.region} · {p.name}</option>)}
        </select>
        <button type="button" onClick={locate} disabled={working} className={action}>{working ? "正在识别…" : "按 IP 估计"}</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="nearby-radius" className="text-[12px] text-ink-3">城市周边</label>
        <select id="nearby-radius" className={control} value={radius} onChange={e => setRadius(e.target.value)}>{[25, 50, 100, 300, 1000].map(n => <option key={n} value={n}>{n} 公里</option>)}</select>
        <button type="button" className={action} disabled={!reader} onClick={() => reader && nearby(reader.lat, reader.lon)}>看附近新闻</button>
        {reader && <button type="button" className="text-[12px] text-ink-4" onClick={() => saveReaderLocation(null)}>清除我的城市</button>}
      </div>
      <p className="text-[11.5px] leading-relaxed text-ink-4">点击「按 IP 估计」才连接 ipwho.is；对方会收到公网 IP。浏览器仅保存所选城市的代表点，不保存 IP。代理可能造成识别偏差。附近范围按城市中心估算，不是现场距离。</p>
      {message && <p role="status" className="text-[12px] text-ink-3">{message}</p>}
    </section>
    <nav aria-label="地点类型" className="mb-4 flex gap-2 text-[12px]">
      <Link to="/cities" className={`${action} ${geo ? "bg-accent-soft text-accent" : ""}`}>已审核地点</Link>
      <Link to="/cities?reviewed=0" className={`${action} ${!geo ? "bg-accent-soft text-accent" : ""}`}>地名线索</Link>
    </nav>
    {geo ? <>
      <Form method="get" className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-line-soft bg-surface p-4 sm:grid-cols-3" key={`${params.get("country")}/${params.get("region")}/${params.get("place")}`}>
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">国家或地区<select name="country" className={control} value={chosenCountry} onChange={e => setChosenCountry(e.target.value)}><option value="">全部</option>{countries.map(c => <option key={c} value={c}>{countryName(c)}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">省份 / 地区<select name="region" className={control} defaultValue={params.get("region") ?? ""} key={chosenCountry} disabled={!chosenCountry}><option value="">全部</option>{regions.map(r => <option key={r}>{r}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">新闻地点<select name="place" className={control} defaultValue={params.get("place") ?? ""}><option value="">全部地点</option>{catalog.map(p => <option key={p.id} value={p.id}>{countryName(p.countryCode)} · {p.region} · {p.name}</option>)}{params.get("place") && !selected && <option value={params.get("place")!}>{params.get("place")}（暂无公开记录）</option>}</select></label>
        <div className="flex items-center gap-3 sm:col-span-3"><button className={action} type="submit">筛选新闻</button><Link to="/cities" className="text-[12px] text-accent">清除筛选</Link></div>
      </Form>
      {nearbyActive && <p className="mb-3 text-[13px] text-ink-3">当前范围：所选城市中心周边 {params.get("radius")} 公里 · <Link to="/cities" className="text-accent">查看全部</Link></p>}
      <NewsMap places={geo.places} items={geo.items} onChoose={choosePlace} />
      <div className="mt-3 flex flex-wrap gap-2">{geo.places.map(p => <Link key={p.id} to={`/cities?place=${encodeURIComponent(p.id)}`} className="rounded-full border border-line-soft px-3 py-1.5 text-[12px] text-ink-3">{p.name} · {p.count}</Link>)}</div>
      {(geo.placesTruncated || geo.catalogTruncated) && <p className="mt-2 text-[12px] text-ink-4">地点较多，地图和选项最多展示 1000 个；请用国家或地区缩小范围。新闻列表仍按全库筛选。</p>}
    </> : <>
      <Form method="get" className="mb-4 flex flex-wrap items-center gap-2"><input type="hidden" name="reviewed" value="0" /><label htmlFor="clue-city" className="text-[13px] text-ink-3">查找城市</label><select id="clue-city" name="city" className={`${control} flex-1`} defaultValue={result.city ?? ""}><option value="">最新全部</option>{CITY_PLACES.map(p => <option key={p.id} value={p.id}>{p.region} · {p.name}</option>)}</select><button type="submit" className={action}>查找线索</button></Form>
      <p className="rounded-xl bg-bg-sunk p-4 text-[13px] leading-relaxed text-ink-3">此处仅识别标题和摘要中的地名，可能只是机构所在地或顺带提及，不进入新闻地图，也不触发【当地】标签。</p>
    </>}
    <div className="mt-6"><h2 className="text-[18px] font-semibold text-ink">{geo ? selected?.name ? `${selected.name}的新闻` : nearbyActive ? "附近新闻" : "各地新闻" : "城市地名线索"}</h2><p className="mt-1 text-[12px] text-ink-4">{result.data.total}{geo?.totalCapped ? "+" : ""} 条{geo ? "已审核地点新闻" : "文本搜索结果"} · 本页 {items.length} 条{geo?.totalCapped ? " · 最多浏览最近 2000 条，请缩小地区范围" : ""} · <Link to="/all" className="text-accent">完整动态</Link></p></div>
    {items.length ? <div className="mt-4"><DayList items={items} todayCount={null} showTags /></div>
      : <div className="mt-4"><EmptyState title={geo ? "这个范围暂无已审核地点的新闻" : "本页没有明确的城市线索"}>地点审核还在逐步覆盖。可调整地区或范围，也可查看地名线索与完整动态。</EmptyState></div>}
    <Pagination page={result.data.page} pageCount={result.data.pageCount} href={href} />
    <p className="mt-5 text-[12px] leading-relaxed text-ink-4">新闻地图与【当地】标签只使用人工核实的事件地点。标记采用登记的地区或城市代表点；无标记不代表当地没有新闻。</p>
  </div>;
}
