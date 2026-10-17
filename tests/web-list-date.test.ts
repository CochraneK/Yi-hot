// Published dates on list pages: a date without a zone is read in the source's offset, whatever zone
// the server runs in (Docker runs in UTC; run this file with TZ=UTC and TZ=Asia/Shanghai to see both).
import assert from "node:assert/strict";
import { test } from "node:test";
import { fromHtml, parseLooseDate } from "@aihot/backend/sources/web-list";

const iso = (v: string, offset?: string) => parseLooseDate(v, offset)?.toISOString() ?? null;

test("a date and time without a zone is in the source's offset, not the server's", () => {
  assert.equal(iso("2026-09-26 10:00"), "2026-09-26T02:00:00.000Z");
  assert.equal(iso("2026-09-26T10:00:00"), "2026-09-26T02:00:00.000Z");
  assert.equal(iso("2026/09/26 10:00"), "2026-09-26T02:00:00.000Z");
  assert.equal(iso("2026年9月26日 10:00"), "2026-09-26T02:00:00.000Z");
  assert.equal(iso("2026-09-26 10:00", "-07:00"), "2026-09-26T17:00:00.000Z");
});

test("a bare date is midnight in the source's offset; an ISO date alone stays UTC midnight", () => {
  assert.equal(iso("2026/09/26"), "2026-09-25T16:00:00.000Z");
  assert.equal(iso("2026年9月26日"), "2026-09-25T16:00:00.000Z");
  assert.equal(iso("Sep 26, 2026"), "2026-09-25T16:00:00.000Z");
  assert.equal(iso("2026-09-26"), "2026-09-26T00:00:00.000Z");
  assert.equal(iso("September 26th, 2026", "+00:00"), "2026-09-26T00:00:00.000Z");
});

test("a date that carries its zone keeps it", () => {
  assert.equal(iso("2026-09-26T10:00:00Z"), "2026-09-26T10:00:00.000Z");
  assert.equal(iso("2026-09-26T10:00:00.000+09:00"), "2026-09-26T01:00:00.000Z");
  assert.equal(iso("Sat, 26 Sep 2026 10:00:00 GMT"), "2026-09-26T10:00:00.000Z");
  assert.equal(iso("Sat, 26 Sep 2026 10:00:00 +0200", "-07:00"), "2026-09-26T08:00:00.000Z");
});

test("a month-first dotted date (One Foundation's <time>) is in the source's offset", () => {
  assert.equal(iso("09.21.2026"), "2026-09-20T16:00:00.000Z");
  assert.equal(iso("08.05.2026"), "2026-08-04T16:00:00.000Z");
  assert.equal(iso("9.2.2026"), "2026-09-01T16:00:00.000Z");
  assert.equal(iso("12.31.2025", "-07:00"), "2025-12-31T07:00:00.000Z");
  // year-first dotted dates are still read year-first, not as MM.DD.YYYY
  assert.equal(iso("2026.1.2"), "2026-01-01T16:00:00.000Z");
});

test("no date at all is null", () => {
  assert.equal(iso(""), null);
  assert.equal(iso("yesterday"), null);
});

test("a list can prefer the link title attribute when visible text is truncated", () => {
  const source = { id: "demo", config: {
    url: "https://example.org/news", itemSelector: "li", linkSelector: "a",
    titleFromAttribute: true, publishedAtSelector: "time",
  } } as any;
  const items = fromHtml('<li><a href="/post/1" title="完整的公益项目新闻标题">截断的公益项目...</a><time>2026-10-17</time></li>', "https://example.org/news", source);
  assert.equal(items[0]?.title, "完整的公益项目新闻标题");
  assert.equal(items[0]?.publishedAt?.toISOString(), "2026-10-17T00:00:00.000Z");
});

test("query-identified articles are not mistaken for their index.php listing", () => {
  const source = { id: "query-cms", config: {
    url: "https://example.org/index.php?a=lists&catid=26", itemSelector: "li", linkSelector: "a",
    allowUrlPrefixes: ["https://example.org/index.php?a=show&catid=26"],
  } } as any;
  const items = fromHtml('<li><a href="/index.php?a=show&catid=26&id=1">一条通过查询参数标识的完整新闻</a></li>', source.config.url, source);
  assert.equal(items.length, 1);
});
