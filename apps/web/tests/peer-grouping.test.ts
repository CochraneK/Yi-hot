// 邻域目录的分组规则：顺序由登记表定、空组不出现、填错的落进「其他」。
//
// 为什么要测：分组是页面的骨架，一旦「新加一家站把整页顺序打乱」或者「某家站因为 group 写错
// 直接从页面上消失」，肉眼看截图是发现不了的——卡片还在，只是位置不对或者少了一张。
import assert from "node:assert/strict";
import { test } from "node:test";
import type { PeerDirectoryEntry } from "@aihot/contracts/peers";
import { groupNeighborhoods, groupSites } from "../app/features/peers/grouping.ts";

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

test("顶层固定先同系邻域后其他邻域，原有行业方向保留且不会丢站", () => {
  const entries: PeerDirectoryEntry[] = [
    { ...site("o1", "product"), family: "other" },
    { ...site("s1", "market"), family: "same" },
    { ...site("s2", "health"), family: "same" },
    { ...site("o2", "civic"), family: "other" },
    { ...site("s3", "market"), family: "same" },
  ];
  const sections = groupNeighborhoods(entries);
  assert.deepEqual(sections.map((s) => s.label), ["同系邻域", "其他邻域"]);
  assert.deepEqual(sections.map((s) => s.id), ["same", "other"]);
  assert.deepEqual(sections[0]?.groups.map((g) => g.id), ["health", "market"]);
  assert.deepEqual(sections[0]?.groups.find((g) => g.id === "market")?.sites.map((s) => s.id), ["s1", "s3"]);
  assert.deepEqual(sections[1]?.groups.map((g) => g.id), ["civic", "product"]);
  const flattened = sections.flatMap((section) => section.groups.flatMap((group) => group.sites.map((s) => s.id)));
  assert.equal(new Set(flattened).size, entries.length);
  assert.deepEqual([...flattened].sort(), entries.map((e) => e.id).sort());
});

test("旧 API 无 family / 非法 family 时不丢卡、不错误归入同系", () => {
  const legacy = site("legacy", "news");
  const invalid = { ...site("unknown", "growth"), family: "unexpected" as "other" };
  const sections = groupNeighborhoods([legacy, invalid]);
  assert.equal(sections.length, 1);
  assert.equal(sections[0]?.id, "other");
  assert.deepEqual(sections[0]?.sites.map((s) => s.id), ["legacy", "unknown"]);
});

test("空的顶层类别不展示，两块复用行业分组兜底", () => {
  const sections = groupNeighborhoods([{ ...site("s1", "missing"), family: "same" }]);
  assert.equal(sections.length, 1);
  assert.equal(sections[0]?.id, "same");
  assert.equal(sections[0]?.groups[0]?.id, "other");
  assert.equal(groupNeighborhoods([]).length, 0);
});
