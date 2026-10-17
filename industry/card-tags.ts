// Reuse existing model tags and the industry topic registry; no new analysis or network call.
import registry from "./topics.json" with { type: "json" };

const topics = registry.topics;
const values = (topic: (typeof topics)[number]) =>
  topic.entityId ? [`entity:${topic.entityId}`] : topic.tags;

const genreLabels: Record<string, string> = {
  policy: "政策",
  "policy-analysis": "政策分析",
  organization: "机构",
  project: "项目",
  fundraising: "募集",
  research: "研究",
  "field-stories": "一线",
  opinion: "观点",
  trends: "行业趋势",
};

const genreTopics = topics.filter(topic => topic.group === "genre");
const conciseGenreLabel = (tag: string) => {
  const topic = genreTopics.find(candidate => values(candidate).includes(tag));
  return topic ? (genreLabels[topic.slug] ?? topic.name) : tag;
};

export function cardTags(tags: string[]): string[] {
  // Field and organization topics keep their registered names. Content genres use
  // the same short labels as the category filter, so cards do not mix two names
  // such as “政策” and “政策与监管” for the same dimension.
  const matchedTopics = topics.filter(topic => topic.group !== "genre" && values(topic).some(tag => tags.includes(tag)));
  const covered = new Set(matchedTopics.flatMap(values));
  const matched = matchedTopics.map(topic => topic.name);
  const remaining = tags
    .filter(tag => !tag.startsWith("entity:") && !covered.has(tag))
    .map(conciseGenreLabel);
  return [...new Set([...matched, ...remaining])].slice(0, 8);
}

/** A displayed topic label filters the same underlying tags that assigned it. */
export function cardTagValues(label: string): string[] {
  const topic = topics.find(topic => topic.name === label);
  if (topic) return [...new Set([label, ...values(topic)])];

  const matchingGenres = genreTopics.filter(candidate => (genreLabels[candidate.slug] ?? candidate.name) === label);
  return [...new Set([label, ...matchingGenres.flatMap(values)])];
}
