import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeYesterdayHot, publicYesterdayHot, yesterdayRankingWindow } from "@aihot/backend/reports/yesterday-hot";

const ranking = [
  { rank: 2, storyPublicId: "story-b", title: "合成事件二", representativeItemId: "item-b", representativeSource: "合成来源乙", heat: 14.2 },
  { rank: 1, storyPublicId: "story-a", title: "合成事件一", representativeItemId: "item-a", representativeSource: "合成来源甲", heat: 24.5 },
  { rank: 3, storyPublicId: "story-a", title: "重复事件应被去重", representativeItemId: "item-c", representativeSource: "合成来源丙", heat: 9.5 },
  { rank: 4, storyPublicId: "story-without-public-item", title: "不可点击的无代表项", representativeItemId: null, representativeSource: null, heat: 2 },
];

test("previous Beijing day is a real [00:00, 24:00) UTC-aligned history window", () => {
  const { start, end } = yesterdayRankingWindow("2026-11-16");
  assert.equal(start.toISOString(), "2026-11-15T16:00:00.000Z");
  assert.equal(end.toISOString(), "2026-11-16T16:00:00.000Z");
  assert.equal(end.getTime()-start.getTime(), 86400000);
  assert.throws(() => yesterdayRankingWindow("not-a-date"));
});

test("yesterday ranking only accepts a published snapshot timestamp inside that day", () => {
  assert.equal(normalizeYesterdayHot("2026-11-16", "2026-11-17T02:00:00.000Z", ranking), null,
    "today's current leaderboard must not be described as yesterday");
  assert.equal(normalizeYesterdayHot("2026-11-16", "2026-11-15T15:59:59.000Z", ranking), null);
  assert.equal(normalizeYesterdayHot("2026-11-16", "2026-11-16T16:00:00.000Z", ranking), null);
  const snapshot = normalizeYesterdayHot("2026-11-16", "2026-11-16T15:30:00.000Z", ranking);
  assert.ok(snapshot);
  assert.deepEqual(snapshot.entries.map(e => [e.rank, e.itemId]), [[1,"item-a"],[2,"item-b"]]);
  assert.deepEqual(snapshot.entries.map(e => e.heat), [24.5, 14.2]);
  assert.equal(normalizeYesterdayHot("2026-11-16","2026-11-16T15:30:00Z", []), null);
});

test("withdrawn or no-longer-known ranking citations disappear without changing saved snapshots", () => {
  const snapshot = normalizeYesterdayHot("2026-11-16", "2026-11-16T15:30:00Z", ranking)!;
  assert.deepEqual(publicYesterdayHot(snapshot, new Map([
    ["item-a", {available:true}],["item-b",{available:false}]
  ]))?.entries.map(e=>e.itemId), ["item-a"]);
  assert.equal(publicYesterdayHot(snapshot, new Map([["item-a",{available:false}]])), null);
  assert.equal(publicYesterdayHot(null, new Map()), null, "older issues without snapshot stay compatible");
  assert.equal(snapshot.entries.length, 2, "raw report archive is immutable");
});
