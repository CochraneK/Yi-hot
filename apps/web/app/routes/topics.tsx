import { Link, useLoaderData } from "react-router";
import { apiGet } from "../lib/api.server";
import { pageMeta } from "../lib/seo";

interface TopicSummary {
  slug: string;
  name: string;
  group: "company" | "field" | "genre";
  definition: string;
  total: number;
  recent: number;
  indexable: boolean;
  latestAt: string | null;
}

export async function loader({ request }: { request: Request }) {
  return apiGet<{ topics: TopicSummary[] }>("/api/site/topics", { signal: request.signal });
}

export function meta() {
  return pageMeta({ title: "主题", description: "按机构与平台、公益领域、内容形态聚合的主题页：腾讯公益、壹基金、乡村振兴、儿童关爱、养老服务、透明慈善等 31 个方向。", path: "/topics", image: "/og/pages/topics.png" });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" };
}

const GROUPS = [
  { key: "company", name: "机构与平台", blurb: "按机构与平台追踪：各基金会与公益平台在做什么" },
  { key: "field", name: "公益领域", blurb: "按公益领域深挖：乡村振兴、儿童关爱、养老服务、透明慈善……" },
  { key: "genre", name: "内容形态", blurb: "按内容类型浏览：政策与监管、机构动态、研究与标准、一线与人物……" },
] as const;

/** Each block on the topics page wears its own colour (CSS vars keep both themes in step). */
const GROUP_COLORS: Record<string, string> = {
  company: "var(--accent)",
  field: "var(--hot)",
  genre: "var(--amber)",
};

/** Field topics carry a colour of their own — the Save the Children dashboard palette for the
 *  mission topics, same-family accents for the rest, so a topic reads the same colour here, on
 *  the filter pills and on the dashboard. Unmapped topics fall back to the group colour. */
const TOPIC_COLORS: Record<string, string> = {
  // 救助儿童会使命主题（与 industry/save-the-children.ts、dashboard 同色板）
  儿童教育: "#3A86FF", 营养健康: "#17A398", 性别平等: "#FF5DA2", 儿童保护: "#E4572E",
  网络保护: "#4361EE", 青年发展: "#8338EC", 亲子养育: "#FFB703", 残障融合: "#FB8500",
  应急救援: "#E9C46A", 环境保护: "#2A9D8F", 募集筹款: "#D62828", 政策倡导: "#6A4C93",
  // 既有公益领域主题（同风格补充色）
  乡村振兴: "#6A994E", 乡村教育: "#A7C957", 儿童关爱: "#FF8FA3", 儿童心理: "#F4A261",
  养老服务: "#E9C46A", 医疗救助: "#588157", 社区公益: "#3A7CA5", 透明慈善: "#4D6489",
  志愿者: "#B08968", 企业公益: "#577590", 慈善捐赠: "#A4133C", 公益金融: "#3E92CC",
  公益科技: "#5E60CE", 国际公益: "#008C95", 资助申请: "#B8873A",
};

/** Save the Children itself always wears the brand red, wherever it shows up. */
const BRAND_RED = "#E4002B";
const COMPANY_GROUPS = [
  { color: BRAND_RED, names: ["救助儿童会"] },
  { color: "#D97706", names: ["壹基金", "中国慈善联合会", "中国乡村发展基金会", "希望工程", "南都公益基金会"] },
  { color: "#1677FF", names: ["腾讯公益", "支付宝公益", "抖音公益", "阿里公益", "基金会中心网"] },
  { color: "#6A4C93", names: ["民政部", "生态环境部"] },
] as const;
const STC_FIELDS = ["儿童教育", "营养健康", "性别平等", "儿童保护", "网络保护", "青年发展", "亲子养育", "残障融合", "应急救援", "环境保护", "募集筹款", "政策倡导"];
const GENRE_COLORS = ["#3A86FF", "#17A398", "#FF8FA3", "#8338EC", "#FB8500", "#2A9D8F", "#B08968", "#588157"];

function topicColor(t: TopicSummary): string {
  if (t.name === "救助儿童会") return BRAND_RED;
  if (t.group === "company") return COMPANY_GROUPS.find((g) => g.names.some((name) => name === t.name))?.color ?? GROUP_COLORS.company;
  if (t.group === "genre") return GENRE_COLORS[Math.abs([...t.slug].reduce((n, c) => n + c.charCodeAt(0), 0)) % GENRE_COLORS.length]!;
  return TOPIC_COLORS[t.name] ?? GROUP_COLORS[t.group] ?? "var(--line-strong)";
}

function orderTopics(items: TopicSummary[], group: TopicSummary["group"]) {
  return items.filter((t) => t.group === group).sort((a, b) => {
    if (group === "company") {
      const rank = (name: string) => { const i = COMPANY_GROUPS.findIndex((g) => g.names.some((entry) => entry === name)); return i < 0 ? 999 : i; };
      return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, "zh-CN");
    }
    if (group === "field") {
      const ai = STC_FIELDS.indexOf(a.name), bi = STC_FIELDS.indexOf(b.name);
      if (ai >= 0 || bi >= 0) return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
      return a.name.localeCompare(b.name, "zh-CN");
    }
    return a.name.localeCompare(b.name, "zh-CN");
  });
}

export default function TopicsPage() {
  const { topics } = useLoaderData<typeof loader>();
  return (
    <div className="pb-10">
      <header className="pb-2 pt-5 lg:pt-1">
        <h1 className="text-[24px] font-semibold leading-[1.3] text-ink">按主题看公益</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
          按机构与平台、公益领域、内容形态浏览 <span className="num">{topics.length}</span> 个主题，持续汇集相关动态。
        </p>
      </header>
      {GROUPS.map((g) => (
        <section key={g.key} aria-labelledby={`topics-${g.key}`} className="pt-8">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h2 id={`topics-${g.key}`} className="text-[15px] font-bold text-ink">
              <span className="mr-1.5 inline-block size-2.5 rounded-[3px] align-middle" style={{ backgroundColor: GROUP_COLORS[g.key] }} aria-hidden="true" />
              {g.name}
            </h2>
            <p className="text-[12px] text-ink-4">{g.blurb}</p>
          </div>
          <ul className="mt-3.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {orderTopics(topics, g.key)
              .map((t) => (
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
        </section>
      ))}
    </div>
  );
}
