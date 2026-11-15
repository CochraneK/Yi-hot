// 邻域目录的分组规则：顺序由登记表定、空组不出现、填错的落进「其他」。
//
// 为什么要测：分组是页面的骨架，一旦「新加一家站把整页顺序打乱」或者「某家站因为 group 写错
// 直接从页面上消失」，肉眼看截图是发现不了的——卡片还在，只是位置不对或者少了一张。
import assert from "node:assert/strict";
import { test } from "node:test";
import type { PeerDirectoryEntry } from "@aihot/contracts/peers";
import { groupSites } from "../app/features/peers/grouping.ts";

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
  const groups = groupSites([site("b1", "biz"), site("h1", "health"), site("t1", "tech")]);
  assert.deepEqual(
    groups.map((g) => g.id),
    ["health", "tech", "biz"],
  );
});

test("空组不出现", () => {
  const groups = groupSites([site("h1", "health")]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, "health");
});

test("组内保持传入顺序", () => {
  const groups = groupSites([site("a", "biz"), site("b", "health"), site("c", "biz")]);
  const biz = groups.find((g) => g.id === "biz");
  assert.deepEqual(
    biz?.sites.map((s) => s.id),
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
