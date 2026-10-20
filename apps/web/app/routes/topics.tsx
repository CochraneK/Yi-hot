import { Link, useLoaderData } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/topics";
import { apiGet } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { GROUPS, GROUP_COLORS, orderTopics, topicColor, type TopicSummary } from "../features/topics/palette";
import { IconChevronRight } from "../components/icons";

interface TopicsData {
  topics: TopicSummary[];
}

export async function loader({ request }: { request: Request }) {
  return apiGet<TopicsData>("/api/site/topics", { signal: request.signal });
}

export function meta({ loaderData }: Route.MetaArgs) {
  const total = loaderData?.topics.length;
  return pageMeta({
    title: "主题",
    description: total
      ? `按机构与平台、公益领域、内容形态浏览 ${total} 个主题：腾讯公益、壹基金、乡村振兴、儿童关爱、养老服务、透明慈善等方向的相关动态。`
      : "按机构与平台、公益领域、内容形态聚合的主题页。",
    path: "/topics",
    image: "/og/pages/topics.png",
  });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" };
}

/** 每个模块卡片先展示的子主题数量，点「加载更多」每次多展示这么多。 */
const PREVIEW_STEP = 6;

/** 入口页上的一张模块卡：先摆几个子主题，加载更多在卡内展开，底部进模块页看全量。 */
function ModuleCard({ group, topics }: { group: (typeof GROUPS)[number]; topics: TopicSummary[] }) {
  const [shown, setShown] = useState(PREVIEW_STEP);
  const visible = topics.slice(0, shown);
  const rest = topics.length - visible.length;
  return (
    <section aria-labelledby={`module-${group.key}`} className="card flex flex-col px-5 py-[18px] lg:px-6">
      <div className="flex items-baseline gap-x-3 gap-y-0.5">
        <h2 id={`module-${group.key}`} className="flex items-center text-[17px] font-bold text-ink">
          <span className="mr-2 inline-block size-3 rounded-[4px]" style={{ backgroundColor: GROUP_COLORS[group.key] }} aria-hidden="true" />
          {group.name}
        </h2>
        <span className="num text-[12px] text-ink-4">{topics.length} 个主题</span>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">{group.blurb}</p>
      <ul className="mt-3.5 grid gap-1.5 sm:grid-cols-2">
        {visible.map((t) => (
          <li key={t.slug}>
            <Link
              to={`/topics/${t.slug}`}
              prefetch="intent"
              aria-label={`查看${t.name}相关动态`}
              className="group/chip flex items-center gap-2 rounded-control px-2.5 py-2 transition-colors hover:bg-bg-sunk"
            >
              <span className="inline-block size-2 shrink-0 rounded-full" style={{ backgroundColor: topicColor(t) }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink transition-colors group-hover/chip:text-accent">{t.name}</span>
              <span className="num shrink-0 text-[11.5px] text-ink-4">{t.total}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between gap-3">
        {rest > 0 ? (
          <button
            type="button"
            onClick={() => setShown((n) => n + PREVIEW_STEP)}
            className="inline-flex items-center gap-1 rounded-control border border-line-strong px-3 py-1.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-accent hover:text-accent"
          >
            加载更多（还有 {rest} 个）
          </button>
        ) : (
          <span className="text-[12px] text-ink-4">已展示全部 {topics.length} 个主题</span>
        )}
        <Link
          to={`/topics/group/${group.key}`}
          prefetch="intent"
          className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-accent hover:underline"
        >
          进入模块 <IconChevronRight size={13} />
        </Link>
      </div>
    </section>
  );
}

export default function TopicsPage() {
  const { topics } = useLoaderData<TopicsData>();
  return (
    <div className="pb-10">
      <header className="pb-2 pt-5 lg:pt-1">
        <h1 className="text-[24px] font-semibold leading-[1.3] text-ink">按主题看公益</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
          三个模块、<span className="num">{topics.length}</span> 个主题，持续汇集相关动态。先从模块进去，或直接在下面展开看。
        </p>
      </header>
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {GROUPS.map((g) => (
          <ModuleCard key={g.key} group={g} topics={orderTopics(topics, g.key)} />
        ))}
      </div>
    </div>
  );
}
