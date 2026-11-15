// Exa 搜索的请求拼装与结果映射。这些是纯函数，不连库、不发请求——真正的一次搜索要花掉
// 每月 $10 免费额度里的 1/2500，不该在测试里跑。
//
// 重点守住两件事：
//   1. 默认**不取** contents。Exa 的 text / highlights 各按 $1/1000 页计费，一次 10 条结果若
//      默认带 highlights，费用约是搜索本身的 2.5 倍，免费额度会被吃掉得快三倍。
//   2. after:/before: 是 DeepSeek 的查询语法，Exa 不认。同一个源换引擎时，写死的日期标记必须
//      被抽成参数，而不是变成 Exa 的关键词。
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildExaBody, hostOf, parseExaResults } from "@aihot/backend/providers/exa";
import { instantOf, splitDateMarkers } from "@aihot/backend/sources/search";

const base = { query: "未成年人保护 公益诉讼", window: "2026-11-14:2026-11-07", subject: "test-exa" };

test("默认不请求 contents：省下 text / highlights 的按页计费", () => {
  const body = buildExaBody(base);
  assert.equal(body.contents, undefined);
  assert.equal(body.type, "auto");
  assert.equal(body.numResults, 10);
});

test("needContent 才带 text，highlights 才带 highlights", () => {
  const withText = buildExaBody({ ...base, needContent: true });
  assert.deepEqual(withText.contents, { text: { maxCharacters: 50_000 } });

  const withHighlights = buildExaBody({ ...base, highlights: true });
  assert.deepEqual(withHighlights.contents, { highlights: true });

  const both = buildExaBody({ ...base, needContent: true, highlights: true });
  assert.deepEqual(both.contents, { highlights: true, text: { maxCharacters: 50_000 } });
});

test("numResults 被夹在 1–100，日期窗口与类目原样传给参数", () => {
  assert.equal(buildExaBody({ ...base, count: 0 }).numResults, 1);
  assert.equal(buildExaBody({ ...base, count: 500 }).numResults, 100);
  const body = buildExaBody({
    ...base,
    count: 50,
    category: "news",
    startPublishedDate: "2026-11-07T00:00:00.000Z",
    endPublishedDate: "2026-11-14T00:00:00.000Z",
  });
  assert.equal(body.category, "news");
  assert.equal(body.startPublishedDate, "2026-11-07T00:00:00.000Z");
  assert.equal(body.endPublishedDate, "2026-11-14T00:00:00.000Z");
});

test("解析结果：保留完整时间戳，站点名取域名，缺 url 或 title 的丢弃", () => {
  const hits = parseExaResults({
    results: [
      {
        url: "https://www.mca.gov.cn/n152/n165/c1234/content.html",
        title: "民政部关于进一步加强困境儿童保障工作的通知",
        publishedDate: "2026-11-13T09:30:00.000Z",
        score: 0.82,
        highlights: ["……完善事实无人抚养儿童认定……", "……按月发放基本生活补贴……"],
      },
      { url: "https://example.org/no-title", publishedDate: "2026-11-13T00:00:00.000Z" },
      { title: "没有链接的条目" },
    ],
  });
  assert.equal(hits.length, 1);
  const hit = hits[0]!;
  assert.equal(hit.siteName, "mca.gov.cn");
  assert.equal(hit.date, "2026-11-13T09:30:00.000Z");
  assert.equal(hit.score, 0.82);
  assert.equal(hit.content, null);
  // highlights 拼成 snippet，供评分步骤读到上下文（未开 highlights 时这里是 null）。
  assert.match(hit.snippet!, /事实无人抚养儿童/);
  assert.match(hit.snippet!, /基本生活补贴/);
});

test("时间戳：完整 ISO 转 Date，坏值不猜", () => {
  assert.equal(instantOf("2026-11-13T09:30:00.000Z")?.toISOString(), "2026-11-13T09:30:00.000Z");
  assert.equal(instantOf(""), null);
  assert.equal(instantOf(null), null);
  assert.equal(instantOf("not-a-date"), null);
});

test("hostOf 去掉 www 前缀，坏 URL 返回 null", () => {
  assert.equal(hostOf("https://www.mca.gov.cn/a/b"), "mca.gov.cn");
  assert.equal(hostOf("https://spp.gov.cn/x"), "spp.gov.cn");
  assert.equal(hostOf("not a url"), null);
});

test("after:/before: 被抽成 Exa 参数并从查询词里剥掉", () => {
  const r = splitDateMarkers("未成年人保护 公益诉讼 after:2026-01-01 before:2026-06-30", "2026-11-07");
  assert.equal(r.q, "未成年人保护 公益诉讼");
  assert.equal(r.start, "2026-01-01T00:00:00.000Z");
  assert.equal(r.end, "2026-06-30T00:00:00.000Z");
});

test("没写日期标记时用 lookbackDays 推算的起点", () => {
  const r = splitDateMarkers("困境儿童 帮扶", "2026-11-07");
  assert.equal(r.q, "困境儿童 帮扶");
  assert.equal(r.start, "2026-11-07T00:00:00.000Z");
  assert.equal(r.end, undefined);
});
