// 邻域目录的分组规则：顺序由登记表定、空组不出现、填错的落进「其他」。
//
// 为什么要测：分组是页面的骨架，一旦「新加一家站把整页顺序打乱」或者「某家站因为 group 写错
// 直接从页面上消失」，肉眼看截图是发现不了的——卡片还在，只是位置不对或者少了一张。
import assert from "node:assert/strict";
import { test } from "node:test";
import type { PeerDirectoryEntry } from "@aihot/contracts/peers";
import { filterPeerSites, groupNeighborhoods, groupSites } from "../app/features/peers/grouping.ts";

function site(id: string, group: string): PeerDirectoryEntry {
  return {
    id,
    name: id,
    url: `https://${id}.example`,
    note: "",
    group,
    accent: "#000000",
    ok: true,
    checkedAt: null,
    items: 0,
    latest: null,
  };
}

test("组顺序按 PEER_GROUPS，不按传入顺序", () => {
  const groups = groupSites([site("m1", "market"), site("h1", "health"), site("p1", "product")]);
  assert.deepEqual(
    groups.map((g) => g.id),
    ["health", "product", "market"],
  );
});

test("空组不出现", () => {
  const groups = groupSites([site("h1", "health")]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, "health");
});

test("组内保持传入顺序", () => {
  const groups = groupSites([site("a", "market"), site("b", "health"), site("c", "market")]);
  const market = groups.find((g) => g.id === "market");
  assert.deepEqual(
    market?.sites.map((s) => s.id),
    ["a", "c"],
  );
});

test("未知或漏填的分组落进「其他」，排在最后，且不丢卡", () => {
  const groups = groupSites([site("x", ""), site("h1", "health"), site("y", "nope")]);
  assert.deepEqual(
    groups.map((g) => g.id),
    ["health", "other"],
  );
  assert.deepEqual(
    groups.at(-1)?.sites.map((s) => s.id),
    ["x", "y"],
  );
});

test("全部未归类时只有一组「其他」", () => {
  const groups = groupSites([site("x", ""), site("y", "")]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, "其他");
});


test("正式和候选按主题混排，资源不进入邻域，保留同系属性与顺序", () => {
  const entries: PeerDirectoryEntry[] = [
    { ...site("o1", "product"), family: "other", tier: "official" },
    { ...site("s1", "market"), family: "same", tier: "official" },
    { ...site("s2", "health"), family: "same", tier: "official" },
    { ...site("r1", "civic"), family: "other", tier: "resource", browseOnly: true },
    { ...site("r2", "research"), family: "other", tier: "resource" },
    { ...site("c1", "growth"), family: "same", tier: "candidate", browseOnly: true },
    { ...site("c2", "market"), family: "other", tier: "candidate" },
  ];
  const groups = groupNeighborhoods(entries);
  assert.deepEqual(groups.map(g => g.id), ["health", "product", "market", "growth"]);
  assert.deepEqual(groups.find(g => g.id === "market")?.sites.map(s => s.id), ["s1", "c2"]);
  assert.equal(groups.find(g => g.id === "market")?.sites[1]?.tier, "candidate");
  assert.equal(groups.find(g => g.id === "market")?.sites[1]?.family, "other");
  assert.deepEqual(groups.flatMap(g => g.sites).length, 5);
  assert.ok(!groups.flatMap(g => g.sites).some(s => s.tier === "resource"));
});

test("普通发布源不占邻域卡片，且原始候选仍可见", () => {
  const entries: PeerDirectoryEntry[] = [
    { ...site("un-news-sdgs", "nonprofit"), family: "other", tier: "official" },
    { ...site("un-geneva-news", "civic"), family: "other", tier: "official" },
    { ...site("psyhot", "health"), family: "same", tier: "official" },
    { ...site("medhot", "health"), family: "same", tier: "candidate", browseOnly: true },
    { ...site("ai-pulse-lab", "news"), family: "other", tier: "official" },
  ];
  const grouped = groupNeighborhoods(entries);
  assert.deepEqual(grouped.map(g => g.id), ["health", "news"]);
  assert.deepEqual(grouped[0].sites.map(s => s.id), ["psyhot", "medhot"]);
  assert.deepEqual(grouped[1].sites.map(s => s.id), ["ai-pulse-lab"]);
});

test("付费核心内容在旧缓存 API 中也不显示，免费候选继续按主题展示", () => {
  const input: PeerDirectoryEntry[] = [
    { ...site("aimfast", "market"), tier: "candidate", family: "other" },
    { ...site("myhot-finance", "market"), tier: "official", family: "same" },
    { ...site("medhot", "health"), tier: "candidate", family: "same" },
  ];
  const topics = groupNeighborhoods(input);
  assert.deepEqual(topics.map(g => g.id), ["health", "market"]);
  assert.deepEqual(topics.flatMap(g => g.sites).map(s => s.id), ["medhot", "myhot-finance"]);
  assert.deepEqual(groupNeighborhoods(filterPeerSites(input, "AimFast")), []);
});

test("旧 API 未提供 tier 或无效 tier 时保守视为候选，而非删除", () => {
  const legacy = { ...site("legacy", "news"), family: "same" as const };
  const invalid = { ...site("invalid", "growth"), tier: "invalid" as "candidate" };
  const groups = groupNeighborhoods([legacy, invalid]);
  assert.deepEqual(groups.map(g => g.id), ["news", "growth"]);
  assert.deepEqual(groups.flatMap(g => g.sites).map(s => s.id), ["legacy", "invalid"]);
});

test("空主题不出现，未知行业使用兜底", () => {
  const groups = groupNeighborhoods([{ ...site("x", "not-a-group"), tier: "candidate" }]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.id, "other");
  assert.deepEqual(groupNeighborhoods([]), []);
});

test("可能重合、浏览-only、同步失败均不使聚合站消失", () => {
  const entries: PeerDirectoryEntry[] = [
    { ...site("overlap", "news"), family: "other", tier: "official", overlapPossible: true, browseOnly: true },
    { ...site("sync-error", "health"), family: "same", tier: "official", ok: false },
    { ...site("candidate", "health"), family: "same", tier: "candidate", browseOnly: true },
  ];
  const groups = groupNeighborhoods(entries);
  assert.equal(groups.flatMap(g => g.sites).length, 3);
  assert.equal(groups.find(g => g.id === "news")?.sites[0]?.overlapPossible, true);
  assert.equal(groups.find(g => g.id === "health")?.sites[0]?.ok, false);
});

test("搜索兼容大小写、Unicode 全半角、行业主题与候选标记", () => {
  const entries: PeerDirectoryEntry[] = [
    { ...site("psyhot", "health"), name: "PsyHOT", note: "精神医学", tier: "official", family: "same" },
    { ...site("research", "research"), name: "研究观察", note: "机器人与机器学习", tier: "official", family: "other" },
    { ...site("demo", "market"), name: "Psy Demo", note: "创业分析", tier: "candidate", family: "other" },
  ];
  assert.deepEqual(filterPeerSites(entries, "  PSYhot ").map(e => e.id), ["psyhot"]);
  assert.deepEqual(filterPeerSites(entries, "Ｐｓｙｈｏｔ").map(e => e.id), ["psyhot"]);
  assert.deepEqual(filterPeerSites(entries, "精神医学").map(e => e.id), ["psyhot"]);
  assert.deepEqual(filterPeerSites(entries, "研究与工程").map(e => e.id), ["research"]);
  assert.deepEqual(filterPeerSites(entries, "同系邻域").map(e => e.id), ["psyhot"]);
  assert.deepEqual(filterPeerSites(entries, "候选信息").map(e => e.id), ["demo"]);
});

test("空查询保持原顺序和引用，组合词必须同时匹配", () => {
  const entries: PeerDirectoryEntry[] = [
    { ...site("first", "health"), name: "Mental AI", note: "心理健康", tier: "official" },
    { ...site("second", "market"), name: "AI Market", note: "行业观察", tier: "official" },
    { ...site("third", "health"), name: "Mental Health", note: "公共服务", tier: "official" },
  ];
  assert.equal(filterPeerSites(entries, ""), entries);
  assert.equal(filterPeerSites(entries, " \t "), entries);
  assert.deepEqual(filterPeerSites(entries, "MENTAL AI").map(e => e.id), ["first"]);
  assert.deepEqual(filterPeerSites(entries, "AI 产业").map(e => e.id), ["second"]);
  assert.deepEqual(filterPeerSites(entries, "没找到"), []);
  assert.deepEqual(filterPeerSites(entries, "AI").map(e => e.id), ["first", "second"]);
});

test("搜索后仍按主题合并正式和候选，不出现独立候选区域", () => {
  const entries: PeerDirectoryEntry[] = [
    { ...site("a", "news"), name: "Psy News", family: "same", tier: "official" },
    { ...site("b", "news"), name: "Psy Digest", family: "other", tier: "official" },
    { ...site("c", "research"), name: "Psy Index", family: "other", tier: "resource" },
    { ...site("d", "news"), name: "Psy Demo", family: "same", tier: "candidate", browseOnly: true },
  ];
  const groups = groupNeighborhoods(filterPeerSites(entries, "psy"));
  assert.deepEqual(groups.map(g => g.id), ["news"]);
  assert.deepEqual(groups[0].sites.map(s => s.id), ["a", "b", "d"]);
  assert.deepEqual(groupNeighborhoods(filterPeerSites(entries, "Psy Demo"))[0].sites.map(s => s.id), ["d"]);
});
