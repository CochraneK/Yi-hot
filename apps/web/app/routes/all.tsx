import { SITE, withSubject } from "@aihot/industry/site";
import { useState } from "react";
import { Link, useLoaderData, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/all";
import type { PoolResponse } from "@aihot/contracts/site";
import { isCategoryKey, isChannelKey } from "@aihot/contracts/taxonomy";
import { loadOr404, queryString } from "../lib/api.server";
import { listPath, pageMeta } from "../lib/seo";
import { TopicTabs, SearchField } from "../features/feed/Filters";
import { SAVE_THE_CHILDREN_TOPICS } from "@aihot/industry/save-the-children";
import { PillTabs } from "../components/ui/Tabs";
import { DayList, Pagination } from "../features/feed/DayList";
import { ToggleChip } from "../components/ui/Controls";
import { useReadSet } from "../lib/local-state";
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
  // Legacy deep-paging parameters (deep, anchorAt) still open a normal page.
  const page = Math.min(Math.max(Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1), 50);
  const data = await loadOr404<PoolResponse>(
    `/api/site/pool${queryString({ channel: channel === "all" ? null : channel, category, topic, tag, q, tab, page: page > 1 ? page : null })}`,
    { signal: request.signal, busyRedirect: "/all/search-busy" },
  );
  return { data };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const f = loaderData?.data.filters;
  const q = f?.q;
  const page = loaderData?.data.page ?? 1;
  const topicName = f?.topic ? SAVE_THE_CHILDREN_TOPICS.find((t) => t.slug === f.topic)?.name ?? null : null;
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
  const { data } = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const navigation = useNavigation();
  const f = data.filters;
  const topic = f.topic ?? null;
  const busy = navigation.state === "loading" && navigation.location?.pathname === "/all";
  const keep = { channel: f.channel === "all" ? null : f.channel, topic };
  const searchTabHref = (tab: "time" | "relevance") => {
    const sp = new URLSearchParams(params);
    sp.delete("page");
    if (tab === "relevance") sp.set("tab", "relevance");
    else sp.delete("tab");
    return `/all?${sp}`;
  };
  const title = f.q ? `搜索“${f.q}”` : f.tag ? `#${f.tag}` : topic ? SAVE_THE_CHILDREN_TOPICS.find((t) => t.slug === topic)?.name ?? null : null;
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

  return (
    <div className="pb-6">
      {/* Desktop, as on 精选: the title, then one filter row with the search field aligned on the right. */}
      <div className="hidden lg:block">
        <h1 className="text-[24px] font-semibold leading-[1.3] text-ink">{title ?? "动态"}</h1>
        <div className="mb-5 mt-4 flex items-center justify-between gap-4">
          <TopicTabs base="/all" topic={topic} channel={f.channel} layoutId="all-topic-desk" className="min-w-0" />
          <SearchField variant="track" defaultValue={f.q ?? ""} keep={keep} />
        </div>
      </div>

      {/* Phones: title with today's count, the search bar, then the same filter row as 精选. */}
      <div className="lg:hidden">
        <div className="flex items-baseline justify-between pb-3 pt-5">
          <h1 className="text-[22px] font-bold text-ink">{title ?? "动态"}</h1>
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

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] text-ink-4">
          {unreadOnly && hiddenCount > 0 ? `已隐藏本页 ${hiddenCount} 条读过的内容` : ""}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleChip on={selectedOnly} onToggle={() => setSelectedOnly((v) => !v)}>
            只看精选
          </ToggleChip>
          <ToggleChip on={unreadOnly} onToggle={() => setUnreadOnly((v) => !v)}>
            只看未读
          </ToggleChip>
        </div>
      </div>

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
                title="没有找到相关内容"
                action={
                  f.q && f.tab === "time" ? (
                    <Link to={searchTabHref("relevance")} className="text-[13px] font-medium text-accent hover:underline">
                      试试“全文相关”，连正文一起搜
                    </Link>
                  ) : undefined
                }
              >
                {f.q ? "换个说法，或者去掉筛选再试。" : "这个筛选下暂时没有内容。"}
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
