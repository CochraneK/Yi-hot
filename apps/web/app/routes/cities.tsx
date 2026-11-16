import { useEffect, useState } from "react";
import { Form, Link, useLoaderData, useNavigate, useSearchParams } from "react-router";
import type { Route } from "./+types/cities";
import type { GeoCatalogPlace, GeoReviewedResponse, PoolResponse } from "@aihot/contracts/site";
import { loadOr404, queryString } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { DayList, Pagination } from "../features/feed/DayList";
import { CITY_PLACES, cityClues, placeById } from "../features/cities/geo";
import { CityPicker, loadCityCatalog } from "../features/cities/CityPicker";
import { locationFromOptInIp, saveReaderLocation, useReaderLocation } from "../features/cities/reader-city";
import { EmptyState } from "../components/ui/Page";

/**
 * Choosing a city, not looking at a map.
 *
 * The national picture already lives on 热点 as a heat map; repeating a second
 * map here meant two ways to read the same places and neither was the fast one.
 * A reader arrives with one question — "what is happening in my city" — so the
 * page is a picker and the answer underneath it.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const page = Math.min(Math.max(Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1), 50);
  // Preserve old /cities?city=… links as text clues; new filters use canonical place=… .
  const clues = url.searchParams.get("reviewed") === "0" || (url.searchParams.has("city") && !url.searchParams.has("reviewed"));
  if (clues) {
    const city = placeById(url.searchParams.get("city"));
    const data = await loadOr404<PoolResponse>(`/api/site/pool${queryString({ q: city?.name, page })}`,
      { signal: request.signal, busyRedirect: "/all/search-busy" });
    return { kind: "clues" as const, data, city: city?.id ?? null };
  }
  const params = new URLSearchParams();
  for (const key of ["place", "country", "region", "lat", "lon", "radius"]) {
    const value = url.searchParams.get(key);
    if (value !== null && value !== "") params.set(key, value);
  }
  // Legacy reviewed links remain valid too, including non-static canonical IDs via place=… .
  if (!params.has("place") && url.searchParams.get("city")) params.set("place", url.searchParams.get("city")!);
  params.set("page", String(page));
  const data = await loadOr404<GeoReviewedResponse>(`/api/site/geo?${params}`, { signal: request.signal });
  return { kind: "reviewed" as const, data, city: null };
}
export function meta({ location }: Route.MetaArgs) {
  return pageMeta({ title: "城市", description: "选一座城市，看经审核的新闻事件地点与当地动态。", path: "/cities", noindex: !!location.search });
}
export function headers() { return { "Cache-Control": "public, max-age=0, s-maxage=60" }; }
const control = "min-w-0 max-w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[13px] text-ink";
const action = "rounded-full border border-line-strong px-4 py-2 text-[12px] text-ink disabled:opacity-50";
/** Quick entries: enough to cover the busiest places without turning the page into a wall of chips. */
const CHIP_LIMIT = 20;

export default function CitiesPage() {
  const result = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const reader = useReaderLocation();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [radius, setRadius] = useState(params.get("radius") ?? "100");
  // The chips are "places with news" across the whole catalogue, not just the current
  // filter — otherwise choosing 南京 leaves a single chip and no way to hop to another
  // city. The picker already caches this request, so it costs nothing extra.
  const [popular, setPopular] = useState<GeoCatalogPlace[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadCityCatalog()
      // The catalogue appends Hong Kong, Macao and Taiwan after the mainland list, so sort
      // again here: the chips are a "busiest first" row, not a geographic one.
      .then(data => { if (alive) setPopular(data.places.filter(p => p.count > 0).sort((a, b) => b.count - a.count)); })
      .catch(() => { /* the filtered places below still work as a fallback */ });
    return () => { alive = false; };
  }, []);
  const geo = result.kind === "reviewed" ? result.data : null;
  const catalog = geo?.catalog ?? [];
  const placeParam = params.get("place");
  const selected = catalog.find(p => p.id === placeParam) ?? geo?.places.find(p => p.id === placeParam);
  const items = result.kind === "reviewed" ? result.data.items
    : result.data.items.filter(item => cityClues(item).some(p => !result.city || p.id === result.city));
  // What the picker shows on its trigger: the city being read, else the one saved on this device.
  const current = selected ? { id: selected.id, name: selected.name }
    : reader ? { id: reader.id, name: reader.name } : null;
  function href(page: number) { const p = new URLSearchParams(params); p.set("page", String(page)); return `/cities?${p}`; }
  function choosePlace(id: string) { navigate(`/cities?place=${encodeURIComponent(id)}`); }
  function nearby(lat: number, lon: number) { navigate(`/cities?${new URLSearchParams({ lat: String(lat), lon: String(lon), radius })}`); }
  async function locate() {
    setWorking(true); setMessage("");
    try {
      const location = await locationFromOptInIp(catalog);
      if (!location) { setMessage("无法可靠识别城市，请手动选择。"); return; }
      saveReaderLocation(location);
      // An IP match may still carry one of the old short ids; resolve it to the catalogue's id.
      const canonical = catalog.find(p => p.id === location.id) ?? catalog.find(p => p.name === location.name);
      if (canonical) {
        setMessage(`已估计为${canonical.name}，可点击「看附近新闻」；识别有误时请手动更改。`);
        choosePlace(canonical.id);
      } else setMessage(`已估计为${location.name}，但这座城市还不在可选列表里。`);
    } catch { setMessage("定位服务暂不可用，请手动选择城市。"); } finally { setWorking(false); }
  }
  const nearbyActive = geo && params.has("radius");
  const allChips = popular ?? geo?.places ?? [];
  const chips = allChips.slice(0, CHIP_LIMIT);
  return <div className="pb-8">
    <header className="pb-4 pt-5 lg:pt-0">
      <h1 className="text-[23px] font-semibold text-ink">城市</h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">选一座城市，看它正在发生什么。城市只记在这台设备上。</p>
    </header>
    <section className="mb-4 space-y-3 rounded-xl border border-line-soft bg-surface p-4" aria-label="选择城市">
      <p className="text-[12px] text-ink-4">我的城市</p>
      <div className="flex flex-wrap items-center gap-2">
        <CityPicker
          block
          className="min-w-[10rem] flex-1"
          current={current}
          onPick={picked => {
            saveReaderLocation({ id: picked.id, name: picked.name, countryCode: picked.countryCode, region: picked.region, city: picked.name, lat: picked.lat, lon: picked.lon });
            setMessage("");
            // Choosing a city is the whole point of the page: show its news at once.
            choosePlace(picked.id);
          }}
        />
        <button type="button" onClick={locate} disabled={working} className={`${action} shrink-0`}>{working ? "正在识别…" : "按 IP 估计"}</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="nearby-radius" className="text-[12px] text-ink-3">城市周边</label>
        <select id="nearby-radius" className={control} value={radius} onChange={e => setRadius(e.target.value)}>{[25, 50, 100, 300, 1000].map(n => <option key={n} value={n}>{n} 公里</option>)}</select>
        <button type="button" className={action} disabled={!reader} onClick={() => reader && nearby(reader.lat, reader.lon)}>看附近新闻</button>
        {(placeParam || nearbyActive) && <Link to="/cities" className="text-[12px] text-accent">看全部城市</Link>}
        {reader && <button type="button" className="text-[12px] text-ink-4" onClick={() => saveReaderLocation(null)}>清除我的城市</button>}
      </div>
      <p className="text-[11.5px] leading-relaxed text-ink-4">点击「按 IP 估计」才连接 ipwho.is；对方会收到公网 IP。浏览器仅保存所选城市的代表点，不保存 IP。代理可能造成识别偏差。附近范围按城市中心估算，不是现场距离。</p>
      {message && <p role="status" className="text-[12px] text-ink-3">{message}</p>}
    </section>
    {geo ? <>
      {chips.length > 0 && <section aria-label="报道最多的城市" className="mb-4">
        <p className="mb-2 px-1 text-[12px] text-ink-4">报道最多的城市</p>
        <div className="flex flex-wrap gap-1.5">
          {chips.map(p => {
            const active = p.id === placeParam;
            return <Link
              key={p.id}
              to={`/cities?place=${encodeURIComponent(p.id)}`}
              className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors ${active ? "border-accent bg-accent-soft text-accent" : "border-line-soft text-ink-3 hover:border-line-strong hover:text-ink"}`}
            >
              {p.name} <span className="num text-ink-4">{p.count}</span>
            </Link>;
          })}
        </div>
        {allChips.length > chips.length && <p className="mt-2 px-1 text-[11.5px] text-ink-4">还有 {allChips.length - chips.length} 个地点在上面的选择器里，可以搜城市名或先选省份。</p>}
      </section>}
      {nearbyActive && <p className="mb-3 text-[13px] text-ink-3">当前范围：所选城市中心周边 {params.get("radius")} 公里 · <Link to="/cities" className="text-accent">查看全部</Link></p>}
      {(geo.placesTruncated || geo.catalogTruncated) && <p className="mb-3 text-[12px] text-ink-4">地点较多，选项最多展示 1000 个；请用选择器搜具体城市。新闻列表仍按全库筛选。</p>}
    </> : <>
      <Form method="get" className="mb-4 flex flex-wrap items-center gap-2"><input type="hidden" name="reviewed" value="0" /><label htmlFor="clue-city" className="text-[13px] text-ink-3">查找城市</label><select id="clue-city" name="city" className={`${control} flex-1`} defaultValue={result.city ?? ""}><option value="">最新全部</option>{CITY_PLACES.map(p => <option key={p.id} value={p.id}>{p.region} · {p.name}</option>)}</select><button type="submit" className={action}>查找线索</button></Form>
      <p className="rounded-xl bg-bg-sunk p-4 text-[13px] leading-relaxed text-ink-3">此处仅识别标题和摘要中的地名，可能只是机构所在地或顺带提及，不计入已审核的事件地点，也不触发【当地】标签。<Link to="/cities" className="text-accent">回到城市</Link></p>
    </>}
    <div className="mt-6"><h2 className="text-[18px] font-semibold text-ink">{geo ? selected?.name ? `${selected.name}的新闻` : nearbyActive ? "附近新闻" : "各地新闻" : "城市地名线索"}</h2><p className="mt-1 text-[12px] text-ink-4">{result.data.total}{geo?.totalCapped ? "+" : ""} 条{geo ? "已审核地点新闻" : "文本搜索结果"} · 本页 {items.length} 条{geo?.totalCapped ? " · 最多浏览最近 2000 条，请缩小地区范围" : ""} · <Link to="/all" className="text-accent">完整动态</Link></p></div>
    {items.length ? <div className="mt-4"><DayList items={items} todayCount={null} showTags /></div>
      : <div className="mt-4"><EmptyState title={geo ? "这个城市暂无已审核地点的新闻" : "本页没有明确的城市线索"}>{geo ? "地点审核还在逐步覆盖。可以先选相邻城市，或按 IP 估计看看附近。" : "可换一个城市，或查看完整动态。"}</EmptyState></div>}
    <Pagination page={result.data.page} pageCount={result.data.pageCount} href={href} />
    <p className="mt-5 text-[12px] leading-relaxed text-ink-4">{geo ? <>{`【当地】标签与这里的城市筛选只使用自动核准的事件地点；没有标到某座城市，不代表那里没有新闻。`}全国近 48 小时的热力分布见 <Link to="/hot" className="text-accent">热点</Link>，只看标题里的地名可以走 <Link to="/cities?reviewed=0" className="text-accent">地名线索</Link>。</> : <>地名线索来自标题与摘要的文本匹配，只用于查找，不代表事件发生地。</>}</p>
  </div>;
}
