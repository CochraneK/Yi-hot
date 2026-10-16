import { SITE, withSubject } from "@aihot/industry/site";
import { data as withHeaders, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/home";
import type { TimelineResponse } from "@aihot/contracts/site";
import { isCategoryKey, isChannelKey } from "@aihot/contracts/taxonomy";
import { loadOr404, queryString, releaseBoundCache } from "../lib/api.server";
import { listPath, organizationLd, pageMeta } from "../lib/seo";
import { Wordmark } from "../components/Logo";
import { Timeline } from "../features/feed/Timeline";
import { HotTopics } from "../features/feed/HotTopics";
import { TopicTabs, SearchField, SearchIconLink } from "../features/feed/Filters";
import { SAVE_THE_CHILDREN_TOPICS } from "@aihot/industry/save-the-children";
import { beijingDate, beijingWeekday } from "../lib/format";
import { FEATURES } from "@aihot/industry/features";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  if (!FEATURES.selectedFeed) throw redirect(`/all${url.search}`);
  const q = url.searchParams.get("q");
  // Search lives on /all; keep the parameters so old links still land on results.
  if (q && q.trim()) throw redirect(`/all${url.search}`);
  const channelParam = url.searchParams.get("channel") ?? "all";
  const categoryParam = url.searchParams.get("category");
  const channel = isChannelKey(channelParam) ? channelParam : "all";
  const category = categoryParam && isCategoryKey(categoryParam) ? categoryParam : null;
  const tag = url.searchParams.get("tag")?.trim() || null;
  const topic = url.searchParams.get("topic")?.trim() || null;
  const upstream = new Headers();
  const data = await loadOr404<TimelineResponse>(`/api/site/timeline${queryString({ channel: channel === "all" ? null : channel, category, tag, topic })}`, { responseHeaders: upstream, signal: request.signal });
  return withHeaders({ data, filters: { channel, category, tag, topic } }, { headers: releaseBoundCache(data.refreshAt, 60, Date.now(), upstream) });
}

export function meta({ loaderData }: Route.MetaArgs) {
  const f = loaderData?.filters;
  const path = listPath("/", { channel: f && f.channel !== "all" ? f.channel : null, category: f?.category, topic: f?.topic, tag: f?.tag });
  return pageMeta({ path, jsonLd: path === "/" ? organizationLd() : undefined });
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

function TodayLabel() {
  const today = beijingDate(Date.now());
  const [, m, d] = today.split("-").map(Number) as [number, number, number];
  return (
    <span className="text-[12.5px] text-ink-4" suppressHydrationWarning>
      {m}月{d}日 · {beijingWeekday(today).replace("星期", "周")}
    </span>
  );
}

export default function Home() {
  const { data, filters } = useLoaderData<typeof loader>();
  const topicName = filters.topic ? SAVE_THE_CHILDREN_TOPICS.find((t) => t.slug === filters.topic)?.name ?? null : null;
  const title = filters.tag ? `#${filters.tag}` : topicName ?? "精选";
  return (
    <div className="pb-6">
      {/* Phones: brand bar, today's hot topics, then the feed under "最新精选". */}
      <div className="flex h-14 items-center justify-between lg:hidden">
        <Wordmark size={20} className="text-ink" />
        <TodayLabel />
      </div>
      <div className="hidden lg:block">
        <h1 className="text-[24px] font-semibold leading-[1.3] text-ink">{title}</h1>
        <div className="mb-5 mt-4 flex items-center justify-between gap-4">
          <TopicTabs base="/" topic={filters.topic} channel={filters.channel} layoutId="home-topic-desk" className="min-w-0" />
          <SearchField variant="track" keep={{ topic: filters.topic }} />
        </div>
      </div>

      {data.hot && <HotTopics entries={data.hot} />}

      <h2 className="mt-6 text-[20px] font-bold text-ink lg:hidden">{filters.tag ? title : topicName ?? "最新精选"}</h2>
      <div className="-mx-4 mt-3 flex items-center gap-2 pl-4 pr-2 lg:hidden">
        <TopicTabs base="/" topic={filters.topic} channel={filters.channel} layoutId="home-topic-mobile" size="sm" className="min-w-0 flex-1" />
        <SearchIconLink />
      </div>

      <Timeline initial={data} filters={data.filters} />
    </div>
  );
}
