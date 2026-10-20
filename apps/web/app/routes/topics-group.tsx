import { Link, useLoaderData } from "react-router";
import { useState } from "react";
import { SITE } from "@aihot/industry/site";
import type { Route } from "./+types/topics-group";
import { apiGet } from "../lib/api.server";
import { breadcrumbLd, pageMeta } from "../lib/seo";
import { GROUPS, GROUP_COLORS, isTopicGroup, orderTopics, topicColor, type TopicSummary } from "../features/topics/palette";

interface TopicsData {
  topics: TopicSummary[];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!isTopicGroup(params.group)) throw new Response("Not found", { status: 404 });
  const { topics } = await apiGet<TopicsData>("/api/site/topics", { signal: request.signal });
  return { group: params.group, topics: orderTopics(topics, params.group) };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: "模块不存在" }, { name: "robots", content: "noindex" }];
  const group = GROUPS.find((g) => g.key === loaderData.group)!;
  return pageMeta({
    title: `${group.name} · 主题`,
    description: `${group.blurb}，共 ${loaderData.topics.length} 个主题。`,
    path: `/topics/group/${group.key}`,
    image: "/og/pages/topics.png",
    jsonLd: breadcrumbLd([{ name: SITE.name, path: "/" }, { name: "主题", path: "/topics" }, { name: group.name, path: `/topics/group/${group.key}` }]),
  });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" };
}

/** 模块页每屏展示的主题数，点「加载更多」每次多展示这么多。 */
const PAGE_STEP = 12;

export default function TopicsGroupPage() {
  const { group, topics } = useLoaderData<typeof loader>();
  const meta = GROUPS.find((g) => g.key === group)!;
  const [shown, setShown] = useState(PAGE_STEP);
  const visible = topics.slice(0, shown);
  const rest = topics.length - visible.length;
  return (
    <div className="pb-10">
      <header className="pb-2 pt-5 lg:pt-1">
        <nav aria-label="面包屑" className="mb-2 flex items-center gap-1.5 text-[12px] text-ink-4">
          <Link to="/topics" className="transition-colors hover:text-accent">主题</Link>
          <span aria-hidden="true">/</span>
          <span className="text-ink-3">{meta.name}</span>
        </nav>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h1 className="flex items-center text-[24px] font-semibold leading-[1.3] text-ink">
            <span className="mr-2 inline-block size-3.5 rounded-[5px]" style={{ backgroundColor: GROUP_COLORS[group] }} aria-hidden="true" />
            {meta.name}
          </h1>
          <span className="num text-[13px] text-ink-4">{topics.length} 个主题</span>
        </div>
        <p className="mt-1.5 max-w-[640px] text-[13px] leading-relaxed text-ink-3">{meta.blurb}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {GROUPS.map((g) => (
            <Link
              key={g.key}
              to={`/topics/group/${g.key}`}
              aria-current={g.key === group ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                g.key === group ? "border-transparent bg-bg-sunk text-ink" : "border-line text-ink-3 hover:border-line-strong hover:text-ink"
              }`}
            >
              <span className="inline-block size-2 rounded-full" style={{ backgroundColor: GROUP_COLORS[g.key] }} aria-hidden="true" />
              {g.name}
            </Link>
          ))}
        </div>
      </header>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((t) => (
          <li key={t.slug}>
            <Link
              to={`/topics/${t.slug}`}
              prefetch="intent"
              aria-label={`查看${t.name}相关动态`}
              className="card card-hover group flex h-full flex-col px-5 py-[18px]"
              style={{ borderColor: topicColor(t), borderWidth: 1.5 }}
            >
              <span className="flex items-center gap-1.5 text-[15px] font-bold text-ink transition-colors group-hover:text-accent">
                <span className="inline-block size-2 shrink-0 rounded-full" style={{ backgroundColor: topicColor(t) }} aria-hidden="true" />
                {t.name}
              </span>
              <span className="mt-1.5 line-clamp-2 flex-1 text-[12.5px] leading-[1.7] text-ink-3">{t.definition}</span>
              <span className="mono mt-3 text-[11.5px] text-accent">
                查看 {t.total} 条动态 <span className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">→</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {rest > 0 && (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE_STEP)}
            className="inline-flex items-center gap-1.5 rounded-control border border-line-strong px-5 py-2 text-[13px] font-medium text-ink-2 transition-colors hover:border-accent hover:text-accent"
          >
            加载更多（还有 {rest} 个主题）
          </button>
        </div>
      )}
    </div>
  );
}
