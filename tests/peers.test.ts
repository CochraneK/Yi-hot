// 「邻域」的选稿规则。纯函数，不连库、不发请求。
//
// 这里守的是一条容易被写错、且很难在页面上看出来的规则：**各姊妹站的分数不能跨站比较**。
// 每一家跑的是自己的模型、自己的评分标准，PsyHOT 的 78 分和 FilmTechNews 的 78 分不是一回事。
// 一旦按全局 score 排序，某个打分偏高的站会连着把整版占满，而这个错误在页面上只表现为
// 「怎么老是那一家」，不报错、不掉数据，所以必须有测试钉住「轮流取」这个行为。
import assert from "node:assert/strict";
import { test } from "node:test";
import { interleavePicks, rotationOrder, sortWithinPeer } from "@aihot/backend/peers/select";

const item = (peerId: string, n: number, score: number | null, publishedAt: string | null = null) => ({
  key: `${peerId}:${n}`,
  peerId,
  score,
  publishedAt,
});

test("站内排序：分数高的在前，没分数的按时间新的在前", () => {
  const sorted = sortWithinPeer([
    item("a", 1, 50, "2026-11-10T00:00:00.000Z"),
    item("a", 2, 90, "2026-11-09T00:00:00.000Z"),
    item("a", 3, null, "2026-11-14T00:00:00.000Z"),
    item("a", 4, null, "2026-11-12T00:00:00.000Z"),
  ]);
  assert.deepEqual(sorted.map((i) => i.key), ["a:2", "a:1", "a:3", "a:4"]);
});

test("轮流取：每家站的第 1 名都取完，才轮到第 2 名", () => {
  const groups = new Map([
    ["hot", [item("hot", 1, 99), item("hot", 2, 98), item("hot", 3, 97)]],
    ["cold", [item("cold", 1, 40), item("cold", 2, 39)]],
    ["mid", [item("mid", 1, 70)]],
  ]);
  const picks = interleavePicks(groups, ["cold", "hot", "mid"], 4);
  // 第 4 条回到登记顺序的第一家：轮转是固定的，不因为谁分数高就插队。
  assert.deepEqual(picks.map((p) => p.key), ["cold:1", "hot:1", "mid:1", "cold:2"]);
});

test("分数再高也不能让一家站占满整版（跨站分数不可比）", () => {
  const groups = new Map([
    ["loud", Array.from({ length: 10 }, (_, i) => item("loud", i + 1, 100 - i))],
    ["quiet", [item("quiet", 1, 1)]],
  ]);
  const picks = interleavePicks(groups, ["loud", "quiet"], 4);
  assert.deepEqual(picks.map((p) => p.peerId), ["loud", "quiet", "loud", "loud"]);
  assert.equal(picks.filter((p) => p.peerId === "loud").length, 3);
});

test("去重：本期已用过的 key 不会再出现", () => {
  const groups = new Map([["a", [item("a", 1, 90), item("a", 2, 80)]]]);
  const picks = interleavePicks(groups, ["a"], 3, new Set(["a:1"]));
  assert.deepEqual(picks.map((p) => p.key), ["a:2"]);
});

test("边界：limit 为 0、全空、全被去重都返回空数组，不抛错", () => {
  assert.deepEqual(interleavePicks(new Map(), ["a"], 3), []);
  assert.deepEqual(interleavePicks(new Map([["a", []]]), ["a"], 3), []);
  assert.deepEqual(interleavePicks(new Map([["a", [item("a", 1, 1)]]]), ["a"], 3, new Set(["a:1"])), []);
  assert.deepEqual(interleavePicks(new Map([["a", [item("a", 1, 1)]]]), ["a"], 0), []);
});

test("出场顺序：近期出现少的先上，同次数保持登记顺序", () => {
  const ids = ["a", "b", "c", "d"];
  assert.deepEqual(rotationOrder(ids, new Map()), ["a", "b", "c", "d"]);
  assert.deepEqual(rotationOrder(ids, new Map([["a", 3], ["b", 3]])), ["c", "d", "a", "b"]);
  assert.deepEqual(rotationOrder(ids, new Map([["d", 1], ["a", 2]])), ["b", "c", "d", "a"]);
});

test("日报三天轮一遍：9 家 3 个名额，不会总是同三家", () => {
  const peers = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
  const counts = new Map<string, number>();
  const shown: string[] = [];
  for (let day = 0; day < 3; day += 1) {
    const order = rotationOrder(peers, counts);
    const today = order.slice(0, 3);
    shown.push(...today);
    for (const id of today) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  assert.deepEqual(shown, peers, "三天应当把 9 家各轮到一次");
});

test("素材不够时尽力填满，不重复取同一条", () => {
  const groups = new Map([
    ["a", [item("a", 1, 10), item("a", 2, 9)]],
    ["b", [item("b", 1, 8)]],
  ]);
  const picks = interleavePicks(groups, ["a", "b"], 8);
  assert.equal(picks.length, 3);
  assert.equal(new Set(picks.map((p) => p.key)).size, 3);
});

test("登记表里没有的站不丢内容，排到最后", () => {
  const groups = new Map([
    ["known", [item("known", 1, 10)]],
    ["newcomer", [item("newcomer", 1, 10)]],
  ]);
  const picks = interleavePicks(groups, ["known"], 2);
  assert.deepEqual(picks.map((p) => p.peerId), ["known", "newcomer"]);
});
