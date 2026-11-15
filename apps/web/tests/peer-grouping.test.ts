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

test("三层顺序固定，原有行业分组和同系归属均保留", () => {
  const entries: PeerDirectoryEntry[] = [
    { ...site("o1", "product"), family: "other", tier: "official" },
    { ...site("s1", "market"), family: "same", tier: "official" },
    { ...site("s2", "health"), family: "same", tier: "official" },
    { ...site("r1", "civic"), family: "other", tier: "resource", browseOnly: true },
    { ...site("r2", "research"), family: "other", tier: "resource", browseOnly: false },
    { ...site("c1", "growth"), family: "same", tier: "candidate", browseOnly: true },
    { ...site("c2", "market"), family: "other", tier: "candidate" },
  ];
  const sections = groupNeighborhoods(entries);
  assert.deepEqual(sections.map(s => s.label), ["正式邻域", "实用资源", "候选信息"]);
  assert.deepEqual(sections.map(s => s.id), ["official", "resource", "candidate"]);
  assert.deepEqual(sections[0]?.groups.map(g => g.id), ["health", "product", "market"]);
  assert.deepEqual(sections[1]?.groups.map(g => g.id), ["civic", "research"]);
  assert.deepEqual(sections[2]?.groups.map(g => g.id), ["market", "growth"]);
  assert.equal(sections[0]?.sites.find(s => s.id === "s1")?.family, "same");
  assert.deepEqual(sections[0]?.families?.map(f => f.id), ["same", "other"]);
  assert.deepEqual(sections[0]?.families?.[0]?.sites.map(s => s.id), ["s1", "s2"]);
  assert.deepEqual(sections[0]?.families?.[1]?.sites.map(s => s.id), ["o1"]);
  assert.deepEqual(sections[0]?.families?.[0]?.groups.map(g => g.id), ["health", "market"]);
  assert.equal(sections[1]?.families, undefined, "资源不需要再按同系分级");
  assert.equal(sections[2]?.families, undefined, "候选不需要再按同系分级");
  const all = sections.flatMap(section => section.sites.map(s => s.id));
  assert.equal(new Set(all).size, entries.length);
  assert.deepEqual([...all].sort(), entries.map(e => e.id).sort());
});

test("旧 API 未提供 tier 或无效 tier 时落候选信息，不误标为正式邻域", () => {
  const legacy = { ...site("legacy", "news"), family: "same" as const };
  const invalid = { ...site("invalid", "growth"), tier: "invalid" as "candidate" };
  const sections = groupNeighborhoods([legacy, invalid]);
  assert.equal(sections.length, 1);
  assert.equal(sections[0]?.id, "candidate");
  assert.deepEqual(sections[0]?.sites.map(s => s.id), ["legacy", "invalid"]);
});

test("空类别不显示，未知行业保留兜底", () => {
  const sections = groupNeighborhoods([{ ...site("x", "not-a-group"), tier: "candidate" }]);
  assert.equal(sections.length, 1);
  assert.equal(sections[0]?.groups[0]?.id, "other");
  assert.deepEqual(groupNeighborhoods([]), []);
});

test("可能重合、没有同步接口和同步失败的正式邻域仍保留归属与可见性", () => {
  const sources: PeerDirectoryEntry[] = [
    { ...site("overlap", "news"), family: "other", tier: "official", overlapPossible: true, browseOnly: true },
    { ...site("sync-error", "health"), family: "same", tier: "official", ok: false, browseOnly: false },
    { ...site("source-only", "market"), family: "same", tier: "official", browseOnly: true },
  ];
  const sections = groupNeighborhoods(sources);
  assert.equal(sections.length, 1);
  assert.equal(sections[0]?.id, "official");
  assert.equal(sections[0]?.sites.length, 3);
  assert.equal(sections[0]?.families?.[0]?.sites.length, 2);
  assert.equal(sections[0]?.families?.[1]?.sites.length, 1);
  assert.equal(sections[0]?.families?.[1]?.sites[0]?.overlapPossible, true);
  assert.equal(sections[0]?.families?.[0]?.sites.find(x => x.id === "sync-error")?.ok, false);
});

test("站点搜索兼容大小写、Unicode 全半角、领域名称与谱系", () => {
  const entries: PeerDirectoryEntry[] = [
    { ...site("psyhot", "health"), name: "PsyHOT", note: "精神医学", tier: "official", family: "same" },
    { ...site("research", "research"), name: "研究观察", note: "机器人与机器学习", tier: "official", family: "other" },
    { ...site("funding", "nonprofit"), name: "资助平台", note: "项目机会", tier: "resource", family: "other" },
  ];
  assert.deepEqual(filterPeerSites(entries, "  PSYhot ").map(e => e.id), ["psyhot"]);
  assert.deepEqual(filterPeerSites(entries, "Ｐｓｙｈｏｔ").map(e => e.id), ["psyhot"]);
  assert.deepEqual(filterPeerSites(entries, "精神医学").map(e => e.id), ["psyhot"]);
  assert.deepEqual(filterPeerSites(entries, "研究与工程").map(e => e.id), ["research"]);
  assert.deepEqual(filterPeerSites(entries, "同系邻域").map(e => e.id), ["psyhot"]);
  assert.deepEqual(filterPeerSites(entries, "实用资源").map(e => e.id), ["funding"]);
});

test("空查询保持原顺序和引用，多个关键词必须同时匹配", () => {
  const entries: PeerDirectoryEntry[] = [
    { ...site("first", "health"), name: "Mental AI", note: "心理健康", tier: "official" },
    { ...site("second", "market"), name: "AI Market", note: "行业观察", tier: "official" },
    { ...site("third", "health"), name: "Mental Health", note: "公共服务", tier: "official" },
  ];
  assert.equal(filterPeerSites(entries, ""), entries);
  assert.equal(filterPeerSites(entries, " \t "), entries);
  assert.deepEqual(filterPeerSites(entries, "MENTAL 心理").map(e => e.id), ["first"]);
  assert.deepEqual(filterPeerSites(entries, "AI 产业").map(e => e.id), []);
  assert.deepEqual(filterPeerSites(entries, "没找到"), []);
  assert.deepEqual(filterPeerSites(entries, "AI").map(e => e.id), ["first", "second"]);
});

test("过滤后仍保留三层、同系/其他与行业分组，候选可被准确搜索", () => {
  const entries: PeerDirectoryEntry[] = [
    { ...site("a", "news"), name: "Psy News", family: "same", tier: "official" },
    { ...site("b", "news"), name: "Psy Digest", family: "other", tier: "official" },
    { ...site("c", "research"), name: "Psy Index", family: "other", tier: "resource" },
    { ...site("d", "market"), name: "Psy Demo", family: "same", tier: "candidate", browseOnly: true },
  ];
  const sections = groupNeighborhoods(filterPeerSites(entries, "psy"));
  assert.deepEqual(sections.map(s => s.id), ["official", "resource", "candidate"]);
  assert.deepEqual(sections[0]?.families?.map(f => f.id), ["same", "other"]);
  assert.deepEqual(sections[0]?.families?.map(f => f.sites.length), [1, 1]);
  assert.equal(sections[2]?.sites[0]?.id, "d");
  assert.deepEqual(groupNeighborhoods(filterPeerSites(entries, "Psy Demo")).map(s => s.id), ["candidate"]);
});
