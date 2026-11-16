import { SITE, withSubject } from "@aihot/industry/site";
import { useState } from "react";
import { Link, useLoaderData, useNavigation, useSearchParams, useNavigate } from "react-router";
import type { Route } from "./+types/all";
import type { GeoPlacesResponse, PoolResponse } from "@aihot/contracts/site";
import { isCategoryKey, isChannelKey } from "@aihot/contracts/taxonomy";
import { loadOr404, queryString } from "../lib/api.server";
import { listPath, pageMeta } from "../lib/seo";
import { TopicTabs, SearchField } from "../features/feed/Filters";
import { FEED_TOPIC_PILLS } from "@aihot/industry/save-the-children";
import { PillTabs } from "../components/ui/Tabs";
import { DayList, Pagination } from "../features/feed/DayList";
import { ToggleChip } from "../components/ui/Controls";
import { useReadSet } from "../lib/local-state";
import { canonicalCity, saveReaderLocation, useReaderLocation } from "../features/cities/reader-city";
import { EmptyState } from "../components/ui/Page";
import { RingMark } from "../components/Logo";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const channelParam = url.searchParams.get("channel") ?? "all";
  const categoryParam = url.searchParams.get("category");
  const topicParam = url.searchParams.get("topic");
  const channel = isChannelKey(channelParam) ? channelParam : "all";
  const category = categoryParam && isCategoryKey(categoryParam) ? categoryParam : null;
  const topic = topicParam?.trim() || null;
  const tag = url.searchParams.get("tag")?.trim() || null;
  const q = url.searchParams.get("q")?.trim().slice(0, 200) || null;
  const tab = url.searchParams.get("tab") === "relevance" ? "relevance" : null;
  // A canonical reviewed place id. The reader's own city is resolved on the client
  // and written here, so the server filters the whole pool instead of one page.
  const placeParam = url.searchParams.get("place")?.trim() || null;
  const place = placeParam && /^[a-z0-9][a-z0-9-]{1,79}$/.test(placeParam) ? placeParam : null;
  // Legacy deep-paging parameters (deep, anchorAt) still open a normal page.
  const page = Math.min(Math.max(Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1), 50);
  const [data, places] = await Promise.all([
    loadOr404<PoolResponse>(
      `/api/site/pool${queryString({ channel: channel === "all" ? null : channel, category, topic, tag, q, tab, place, page: page > 1 ? page : null })}`,
      { signal: request.signal, busyRedirect: "/all/search-busy" },
    ),
    // Cities the reader may pick as 当地. Canonical ids only — the short ids in the
    // old static list matched no reviewed place and filtered the feed to nothing.
    loadOr404<GeoPlacesResponse>("/api/site/geo/places", { signal: request.signal }),
  ]);
  return { data, place, places: places.places };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const f = loaderData?.data.filters;
  const q = f?.q;
  const page = loaderData?.data.page ?? 1;
  const topicName = f?.topic ? FEED_TOPIC_PILLS.find((t) => t.slug === f.topic)?.name ?? null : null;
  return pageMeta({
    title: q ? `搜索：${q}` : topicName ?? "动态",
    description: `${SITE.name} 收录的动态，按原文发布时间排列；原文只标注日期的，按本站收录时间落位。可按主题与标签筛选，支持中英文搜索。`,
    path: listPath("/all", { channel: f && f.channel !== "all" ? f.channel : null, topic: f?.topic, tag: f?.tag, q, tab: f?.tab === "relevance" ? "relevance" : null, page: page > 1 ? page : null }),
    noindex: !!q,
  });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=30" };
}

function pageHref(params: URLSearchParams, page: number) {
  const sp = new URLSearchParams(params);
  sp.delete("deep");
  sp.delete("anchorAt");
  sp.delete("search");
  if (page <= 1) sp.delete("page");
  else sp.set("page", String(page));
  const s = sp.toString();
  return s ? `/all?${s}` : "/all";
}

export default function AllPage() {
  const { data, place, places } = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const reader = useReaderLocation();
  const f = data.filters;
  const topic = f.topic ?? null;
  const busy = navigation.state === "loading" && navigation.location?.pathname === "/all";
  const keep = { channel: f.channel === "all" ? null : f.channel, topic, place };
  const searchTabHref = (tab: "time" | "relevance") => {
    const sp = new URLSearchParams(params);
    sp.delete("page");
    if (tab === "relevance") sp.set("tab", "relevance");
    else sp.delete("tab");
    return `/all?${sp}`;
  };
  const title = f.q ? `搜索“${f.q}”` : f.tag ? `#${f.tag}` : topic ? FEED_TOPIC_PILLS.find((t) => t.slug === topic)?.name ?? null : null;
  const updated = new Date(data.freshness).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" });
  // 只看未读 is a reader-side filter over this page: the read record lives in this browser only, so
  // the server never has to know who read what. Turning it on can empty a page, and the note below
  // the list says so instead of leaving a blank screen.
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const readSet = useReadSet();
  const items = data.items.filter(
    (it) => (!unreadOnly || !readSet.has(it.id)) && (!selectedOnly || it.selected),
  );
  const hiddenCount = data.items.length - items.length;

  // 只看当地 is a server filter, not a page-local one: the reader's city lives in
  // this browser, so its canonical id goes into the URL and the API decides what
  // belongs to it. A stored city that predates canonical places is matched by name
  // here, otherwise the filter would accept an id the pool has never heard of.
  const here = canonicalCity(reader, places);
  const toggleLocal = () => {
    const sp = new URLSearchParams(params);
    sp.delete("page");
    if (place) sp.delete("place");
    else if (here) sp.set("place", here.id);
    else { navigate("/cities"); return; }
    const query = sp.toString();
    navigate(query ? `/all?${query}` : "/all");
  };
  const chooseLocal = (id: string) => {
    const city = places.find(p => p.id === id);
    if (!city) return;
    saveReaderLocation({ id: city.id, name: city.name, countryCode: city.countryCode, region: city.region, city: city.city ?? city.name, lat: city.lat, lon: city.lon });
    const sp = new URLSearchParams(params);
    sp.delete("page");
    sp.set("place", city.id);
    navigate(`/all?${sp.toString()}`);
  };
  const localLabel = place ? `只看当地 · ${here?.name ?? reader?.name ?? "本城"}` : "只看当地";

  // The narrow filters sit under the search field on desktop and under the topic
  // row on phones. Without a city the 只看当地 chip would only bounce the reader
  // to /cities, so the city picker stands in for it until one is chosen.
  const localControls = (
    <div className="flex flex-wrap items-center gap-1.5">
      {here ? (
        <ToggleChip on={!!place} onToggle={toggleLocal}>
          {localLabel}
        </ToggleChip>
      ) : (
        <select
          aria-label="选择我的城市"
          value=""
          onChange={e => chooseLocal(e.target.value)}
          className="h-8 max-w-[9rem] rounded-full border border-line-strong bg-surface px-3 text-[12.5px] text-ink-2"
        >
          <option value="">选择我的城市…</option>
          {places.map(city => (
            <option key={city.id} value={city.id}>{city.name} · {city.count}</option>
          ))}
        </select>
      )}
      <ToggleChip on={selectedOnly} onToggle={() => setSelectedOnly((v) => !v)}>
        只看精选
      </ToggleChip>
      <ToggleChip on={unreadOnly} onToggle={() => setUnreadOnly((v) => !v)}>
        只看未读
      </ToggleChip>
    </div>
  );

  return (
    <div className="pb-6">
      {/* Desktop, as on 精选: the title, then one filter row with the search field
          and the narrow filters stacked on the right. */}
      <div className="hidden lg:block">
        <div className="flex items-center justify-between gap-3"><h1 className="text-[24px] font-semibold leading-[1.3] text-ink">{title ?? "动态"}</h1><Link to="/cities" className="text-[12px] font-medium text-accent hover:underline">城市地图</Link></div>
        <div className="mb-5 mt-4 flex items-center justify-between gap-6">
          <TopicTabs base="/all" topic={topic} channel={f.channel} layoutId="all-topic-desk" className="min-w-0 flex-1" />
          <div className="flex shrink-0 flex-col items-end gap-2">
            <SearchField variant="track" defaultValue={f.q ?? ""} keep={keep} />
            {localControls}
          </div>
        </div>
      </div>

      {/* Phones: title with today's count, the search bar, then the same filter row as 精选. */}
      <div className="lg:hidden">
        <div className="flex items-baseline justify-between pb-3 pt-5">
          <div className="flex items-center gap-2"><h1 className="text-[22px] font-bold text-ink">{title ?? "动态"}</h1><Link to="/cities" className="text-[12px] text-accent">地图</Link></div>
          {!f.q && (
            <span className="text-[12.5px] text-ink-4">
              今日 <span className="num">{data.todayCount}</span> 条
            </span>
          )}
        </div>
        <SearchField variant="bar" defaultValue={f.q ?? ""} keep={keep} autoFocus={params.get("search") === "1"} />
        <div className="-mx-4 mt-3 border-b border-line-soft px-4 pb-3">
          <TopicTabs base="/all" topic={topic} channel={f.channel} layoutId="all-topic-mobile" size="sm" className="min-w-0" />
        </div>
        <div className="mb-1 mt-3">{localControls}</div>
      </div>

      {f.q && (
        <div className="mb-3 mt-3 flex flex-wrap items-center justify-between gap-2 lg:mt-0">
          <PillTabs
            size="xs"
            layoutId="all-search-sort"
            label="搜索排序"
            active={f.tab}
            items={(["time", "relevance"] as const).map((t) => ({ key: t, label: t === "time" ? "最新（标题与摘要）" : "全文相关", to: searchTabHref(t) }))}
          />
          <span className="text-[12px] text-ink-4">
            找到 <span className="num">{data.total >= 2000 ? "2000+" : data.total}</span> 条 · 更新于 <span className="num">{updated}</span>
          </span>
        </div>
      )}

      {unreadOnly && hiddenCount > 0 && (
        <p className="mb-2 text-[12px] text-ink-4">已隐藏本页 {hiddenCount} 条读过的内容</p>
      )}

      <div className={`transition-opacity duration-200 ${busy ? "opacity-50" : ""}`}>
        {items.length === 0 ? (
          <div className="mt-2 lg:card">
            {data.items.length > 0 && (unreadOnly || selectedOnly) ? (
              <EmptyState
                title={
                  selectedOnly && !unreadOnly
                    ? "这一页没有精选内容"
                    : unreadOnly && !selectedOnly
                      ? "这一页都读过了"
                      : "没有符合筛选的内容"
                }
                action={
                  <button type="button" onClick={() => { setUnreadOnly(false); setSelectedOnly(false); }} className="text-[13px] font-medium text-accent hover:underline">
                    看全部内容
                  </button>
                }
              >
                {selectedOnly && !unreadOnly
                  ? "关掉「只看精选」，或在主题、搜索里找更多。"
                  : unreadOnly && !selectedOnly
                    ? "翻到下一页，或者关掉「只看未读」。"
                    : "关掉筛选，或者翻到下一页看看。"}
              </EmptyState>
            ) : (
              <EmptyState
                title={place ? "这个城市暂时没有已审核的新闻" : "没有找到相关内容"}
                action={
                  place ? (
                    <button type="button" onClick={toggleLocal} className="text-[13px] font-medium text-accent hover:underline">
                      看全部动态
                    </button>
                  ) : f.q && f.tab === "time" ? (
                    <Link to={searchTabHref("relevance")} className="text-[13px] font-medium text-accent hover:underline">
                      试试“全文相关”，连正文一起搜
                    </Link>
                  ) : undefined
                }
              >
                {place
                  ? "只有地点审核通过的新闻才会归到城市；也可以关掉「只看当地」看全部。"
                  : f.q ? "换个说法，或者去掉筛选再试。" : "这个筛选下暂时没有内容。"}
              </EmptyState>
            )}
          </div>
        ) : (
          <DayList items={items} todayCount={f.q ? null : data.todayCount} showTags />
        )}
      </div>
      <Pagination page={data.page} pageCount={data.pageCount} href={(p) => pageHref(params, p)} />
      {data.page >= 50 && <p className="mt-4 text-center text-[12px] text-ink-4">最多提供 50 页，更早的内容请使用搜索或主题页。</p>}
    </div>
  );
}

export function SearchBusy() {
  return (
    <div className="mx-auto max-w-sm py-24 text-center">
      <RingMark className="mx-auto mb-5 size-10 text-accent" spinning />
      <h1 className="text-[20px] font-bold text-ink">搜索有点忙</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-3">现在搜索的人比较多，请稍等几秒再试。列表浏览不受影响。</p>
      <div className="mt-6 flex justify-center gap-2.5">
        <Link to="/all" className="inline-flex h-9 items-center rounded-full bg-accent px-4 text-[13.5px] font-medium text-accent-contrast hover:bg-accent-ink">浏览动态</Link>
      </div>
    </div>
  );
}
