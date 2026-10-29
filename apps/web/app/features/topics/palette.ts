// 主题页三模块（机构与平台 / 公益领域 / 内容形态）共享的分组定义、配色与排序。
// 入口页 /topics 与模块页 /topics/group/:group 都用这一份，保证同一主题在两处颜色、顺序一致。

export interface TopicSummary {
  slug: string;
  name: string;
  group: "company" | "field" | "genre";
  definition: string;
  total: number;
  recent: number;
  indexable: boolean;
  latestAt: string | null;
}

export type TopicGroup = TopicSummary["group"];

export const GROUPS = [
  { key: "company", name: "机构与平台", blurb: "按机构与平台追踪：各基金会与公益平台在做什么" },
  { key: "field", name: "公益领域", blurb: "按公益领域深挖：乡村振兴、儿童关爱、养老服务、透明慈善……" },
  { key: "genre", name: "内容形态", blurb: "按内容类型浏览：政策与监管、机构动态、研究与标准、一线与人物……" },
] as const;

export const GROUP_KEYS = GROUPS.map((g) => g.key);

export function isTopicGroup(value: string | undefined): value is TopicGroup {
  return !!value && (GROUP_KEYS as readonly string[]).includes(value);
}

/** Each block on the topics page wears its own colour (CSS vars keep both themes in step). */
export const GROUP_COLORS: Record<string, string> = {
  company: "var(--accent)",
  field: "var(--hot)",
  genre: "var(--amber)",
};

/** Field topics carry a colour of their own — the Save the Children dashboard palette for the
 *  mission topics, same-family accents for the rest, so a topic reads the same colour here, on
 *  the filter pills and on the dashboard. Unmapped topics fall back to the group colour. */
export const TOPIC_COLORS: Record<string, string> = {
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
export const BRAND_RED = "#DA291C";
const COMPANY_GROUPS = [
  { color: BRAND_RED, names: ["救助儿童会"] },
  { color: "#D97706", names: ["壹基金", "中国慈善联合会", "中国乡村发展基金会", "希望工程", "南都公益基金会"] },
  { color: "#1677FF", names: ["腾讯公益", "支付宝公益", "抖音公益", "阿里公益", "基金会中心网"] },
  { color: "#6A4C93", names: ["民政部", "生态环境部"] },
] as const;
const STC_FIELDS = ["儿童教育", "营养健康", "性别平等", "儿童保护", "网络保护", "青年发展", "亲子养育", "残障融合", "应急救援", "环境保护", "募集筹款", "政策倡导"];
const GENRE_COLORS = ["#3A86FF", "#17A398", "#FF8FA3", "#8338EC", "#FB8500", "#2A9D8F", "#B08968", "#588157"];

export function topicColor(t: TopicSummary): string {
  if (t.name === "救助儿童会") return BRAND_RED;
  if (t.group === "company") return COMPANY_GROUPS.find((g) => g.names.some((name) => name === t.name))?.color ?? GROUP_COLORS.company;
  if (t.group === "genre") return GENRE_COLORS[Math.abs([...t.slug].reduce((n, c) => n + c.charCodeAt(0), 0)) % GENRE_COLORS.length]!;
  return TOPIC_COLORS[t.name] ?? GROUP_COLORS[t.group] ?? "var(--line-strong)";
}

export function orderTopics(items: TopicSummary[], group: TopicGroup): TopicSummary[] {
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
