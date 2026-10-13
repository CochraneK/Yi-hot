// Reuse existing model tags and the industry topic registry; no new analysis or network call.
import registry from "./topics.json" with { type: "json" };

const topics = registry.topics;
const values = (topic: (typeof topics)[number]) =>
  topic.entityId ? [`entity:${topic.entityId}`] : topic.tags;

export function cardTags(tags: string[]): string[] {
  const matched = topics.filter(topic => values(topic).some(tag => tags.includes(tag))).map(topic => topic.name);
  return [...new Set([...matched, ...tags.filter(tag => !tag.startsWith("entity:"))])].slice(0, 8);
}

/** A displayed topic label filters the same underlying tags that assigned it. */
export function cardTagValues(label: string): string[] {
  const topic = topics.find(topic => topic.name === label);
  return [...new Set([label, ...(topic ? values(topic) : [])])];
}
