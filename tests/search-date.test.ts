// 搜索结果的 date：DeepSeek 给的是「北京这一天零点」的 RFC3339（前一日 16:00Z），不是 UTC 日期。
// 按字符串前 10 位取日会把整批搜索结果标早一天——页面上「11 月 1 日发布」的稿子写成 10 月 31 日。
import assert from "node:assert/strict";
import { test } from "node:test";
import { dayOf } from "@aihot/backend/sources/search";

const iso = (v: string | null) => dayOf(v)?.toISOString() ?? null;

test("搜索结果的 date 按北京时间取日，不按字符串截断", () => {
  // 16:00Z 就是北京次日零点：这是搜索接口最常见的写法
  assert.equal(iso("2026-10-31T16:00:00+00:00"), "2026-11-01T00:00:00.000Z");
  assert.equal(iso("2026-10-31T16:00:00Z"), "2026-11-01T00:00:00.000Z");
  // 北京白天的时间仍算同一天
  assert.equal(iso("2026-11-01T03:30:00Z"), "2026-11-01T00:00:00.000Z");
  // 北京的深夜（UTC 前一日下午）也要归到北京那天
  assert.equal(iso("2026-10-31T23:30:00Z"), "2026-11-01T00:00:00.000Z");
  // 纯日期不带时刻，原样保留
  assert.equal(iso("2026-11-01"), "2026-11-01T00:00:00.000Z");
  assert.equal(iso(null), null);
  assert.equal(iso("not a date"), null);
});

test("归一的日期始终是该日 00:00Z，与 date 精度的存法一致", () => {
  for (const raw of ["2026-10-31T16:00:00Z", "2026-11-01T12:00:00+08:00", "2026-11-01"]) {
    assert.match(iso(raw)!, /T00:00:00\.000Z$/, raw);
  }
});
