import { test } from "node:test";
import assert from "node:assert/strict";
import type { ReportCitation } from "@aihot/contracts/site";
import {
  compilePeriodInsights, periodObservationBrief, projectPeriodInsights,
  type InsightEntry, type StoredReportInsight,
} from "@aihot/backend/reports/insights";

const sample: InsightEntry[] = [
  { itemId: "news-a", factId: "fact-a", sourceId: "org-a", category: "policy" },
  { itemId: "news-b", factId: "fact-b", sourceId: "org-b", category: "policy" },
  { itemId: "news-c", factId: "fact-c", sourceId: "org-a", category: "practice" },
  { itemId: "news-d", factId: "fact-a", sourceId: "org-b", category: "policy" },
];
const good = {
  claim: "不同项目开始公开各自的儿童保护评估安排",
  reasoning: "两家机构分别披露评估安排，说明本站样本中出现了相近的行动方向，但不能推广至全国。",
  alternative: "可能是同一轮宣传窗口中的个别项目发布，并非整个行业的制度化改变。",
  watchFor: "下期查看是否有更多独立机构披露有日期和责任人的评估结果。",
  refs: [1, 2],
};
const citation = (id: string, available = true): ReportCitation => ({
  itemId: id, title: id, summary: "已发表摘要", sourceName: id, sourceUrl: "https://example.org/",
  sourceId: id, sourceIconUrl: null, firstParty: true, role: "官方",
  storyPublicId: null, publishedAt: "2026-11-16T00:00:00Z", available,
});
function publicSources(available = true) {
  return new Map([
    ["news-a", { citation: citation("news-a", available), sourceId: "org-a", factId: "fact-a" }],
    ["news-b", { citation: citation("news-b"), sourceId: "org-b", factId: "fact-b" }],
  ]);
}

test("weekly patterns and monthly hypotheses require independent source and event evidence", () => {
  assert.deepEqual(compilePeriodInsights("weekly", [good], sample).map(i => i.level), ["pattern"]);
  assert.deepEqual(compilePeriodInsights("monthly", [good], sample).map(i => i.level), ["hypothesis"]);
  for (const bad of [
    { ...good, refs: [1, 3] }, // same source
    { ...good, refs: [1, 4] }, // same underlying event
    { ...good, refs: [1, 999] }, // fabricated index
    { ...good, refs: [1, 1] }, // repeated same post
    { ...good, refs: ["1", "bad"] },
    { ...good, alternative: " " }, // no competing explanation
    { ...good, watchFor: "" },
  ]) assert.deepEqual(compilePeriodInsights("weekly", [bad], sample), []);
  const items = compilePeriodInsights("weekly", [good, good], sample);
  assert.equal(items.length, 1, "duplicate model claims must not pad the section");
  assert.deepEqual(items[0]?.evidenceIds, ["news-a", "news-b"]);
});

test("missing or withdrawn evidence never leaves an apparently corroborated published insight", () => {
  const stored = compilePeriodInsights("monthly", [good], sample);
  assert.equal(projectPeriodInsights("monthly", stored, publicSources()).length, 1);
  assert.equal(projectPeriodInsights("weekly", stored, publicSources()).length, 0, "cannot change level");
  assert.equal(projectPeriodInsights("monthly", stored, publicSources(false)).length, 0);
  const withoutSecond = publicSources(); withoutSecond.delete("news-b");
  assert.equal(projectPeriodInsights("monthly", stored, withoutSecond).length, 0);
  assert.deepEqual(projectPeriodInsights("monthly", undefined, publicSources()), []);
  const fabricated: StoredReportInsight = { ...stored[0]!, evidenceIds: ["news-a", "unknown"] };
  assert.deepEqual(projectPeriodInsights("monthly", [fabricated], publicSources()), []);
  const citation2 = publicSources(); citation2.get("news-b")!.sourceId = "org-a";
  assert.equal(projectPeriodInsights("monthly", stored, citation2).length, 0);
});

test("comparison text always distinguishes sampled output from real-world event incidence", () => {
  const insufficient = periodObservationBrief("weekly", sample, [], { policy: "政策", practice: "服务" });
  assert.match(insufficient, /可比性不足/);
  assert.match(insufficient, /禁止使用增长、下降/);
  const current = [...Array.from({length: 20}, (_, i) => ({ ...sample[i % 2]!, itemId: "a" + i, factId: "fa" + i }))];
  const previous = [...Array.from({length: 20}, (_, i) => ({ ...sample[(i + 1) % 3]!, itemId: "b" + i, factId: "fb" + i }))];
  const compared = periodObservationBrief("monthly", current, previous, { policy: "政策", practice: "服务" });
  assert.match(compared, /候选样本/);
  assert.match(compared, /每100条中的份额/);
  assert.match(compared, /不可称社会事件或公益资金整体变化/);
});
