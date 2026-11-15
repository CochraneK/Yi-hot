// 月日标签的跨年规则：同年的日子不带年份，别的年份必须带。
//
// 站里有 2018 年以来的公开条目（166 条），时间线还能翻到、搜索还能命中它们。
// 只写「3月5日」的话，读者会当成今年的——上游 6d82afb/58168ec/04427b9 修的就是这个。
import assert from "node:assert/strict";
import { test } from "node:test";
import { monthDay, monthDayTime } from "../app/lib/format.ts";
import { chipLabel, dayLabel, neighbourLabel } from "../app/features/report/format.ts";

test("同年的日子不带年份", () => {
  assert.equal(monthDay("2026-10-05", "2026-10-19"), "10月5日");
  assert.equal(monthDay("2026-01-01", "2026-12-31"), "1月1日");
});

test("不是今年的日子带上年份", () => {
  assert.equal(monthDay("2019-02-19", "2026-10-19"), "2019年2月19日");
  assert.equal(monthDay("2025-12-31", "2026-01-01"), "2025年12月31日");
  assert.equal(monthDay("2020-03-05", "2026-11-15"), "2020年3月5日");
});

test("带钟点的标签同样跨年带年份", () => {
  assert.equal(monthDayTime("2026-11-15T02:51:00Z", "2026-11-15"), "11月15日 10:51");
  assert.equal(monthDayTime("2019-02-19T02:51:00Z", "2026-11-15"), "2019年2月19日 10:51");
});

test("日报的日期标签：上一年的 12 月 31 日在一月读起来不歧义", () => {
  assert.equal(dayLabel("2026-11-15", "2026-11-15"), "11月15日");
  assert.equal(dayLabel("2026-12-31", "2027-01-02"), "2026年12月31日");
  assert.equal(chipLabel("daily", "2026-12-31", [], "2027-01-02"), "2026年12月31日");
  assert.equal(neighbourLabel("daily", "2026-12-31", "prev", "2027-01-02"), "前一日 · 2026年12月31日");
});

test("同年的日报标签保持原样，不因为这次改动多出年份", () => {
  assert.equal(neighbourLabel("daily", "2026-11-14", "prev", "2026-11-15"), "前一日 · 11月14日");
  assert.equal(chipLabel("daily", "2026-11-15", [], "2026-11-15"), "今天");
});
