// 救助儿童会使命主题：/all 的筛选轴按这套字段呈现（2026-10 品牌化重构，替代原“内容类型”轴）。
// 每个 slug 对应 industry/topics.json 里的主题页（4 个原有 + 9 个新增）；颜色与救助儿童会
// dashboard 同一套色板，保证筛选 pill、主题卡片、dashboard 三处同色。
export interface MissionTopic {
  slug: string;
  name: string;
  color: string;
}

export const SAVE_THE_CHILDREN_TOPICS: readonly MissionTopic[] = [
  { slug: "child-education", name: "儿童教育", color: "#3A86FF" },
  { slug: "health-nutrition", name: "营养健康", color: "#17A398" },
  { slug: "gender-equality", name: "性别平等", color: "#FF5DA2" },
  { slug: "child-protection", name: "儿童保护", color: "#E4572E" },
  { slug: "online-safety", name: "网络保护", color: "#4361EE" },
  { slug: "youth-development", name: "青年发展", color: "#8338EC" },
  { slug: "parenting", name: "亲子养育", color: "#FFB703" },
  { slug: "disability-inclusion", name: "残障融合", color: "#FB8500" },
  { slug: "emergency-relief", name: "应急救援", color: "#E9C46A" },
  { slug: "environment", name: "环境保护", color: "#2A9D8F" },
  { slug: "fundraising-campaign", name: "募集筹款", color: "#D62828" },
  { slug: "policy-advocacy", name: "政策倡导", color: "#6A4C93" },
] as const;

/** slug → 颜色，供筛选 pill 与主题卡片共用。 */
export const MISSION_TOPIC_COLORS: Record<string, string> = Object.fromEntries(
  SAVE_THE_CHILDREN_TOPICS.map((t) => [t.slug, t.color]),
);
