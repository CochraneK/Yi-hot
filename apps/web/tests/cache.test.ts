// Run after `npm run build -w @aihot/web`. Real production server/router, synthetic HTTP API only.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { CATEGORY_KEYS } from "@aihot/contracts/taxonomy";
import { releaseBoundCache } from "../app/lib/api.server.ts";

let web: ChildProcess;
let origin: string;
let logs = "";
let deadline: number;
let refreshAt: string;
let metaDelayMs = 0;
const apiCookies: Array<string | undefined> = [];
const api = createServer((req, res) => {
  const url = new URL(req.url!, "http://api.local");
  apiCookies.push(req.headers.cookie);
  res.setHeader("Content-Type", "application/json");
  // Synthetic issue for the evidence-first reader regression. It is not a
  // generated report and must never be sent to a real content endpoint.
  if (url.pathname === "/api/site/reports/weekly/latest-page") {
    const refs = [
      { itemId: "fixture-policy", title: "合成新闻：某地公布项目评估办法",
        summary: "新办法明确部分项目要收集服务对象反馈。", sourceName: "合成官方信源",
        sourceUrl: "https://example.org/policy", sourceId: "agency-a", sourceIconUrl: null,
        firstParty: true, role: "官方", storyPublicId: "story-a",
        publishedAt: "2026-11-12T00:00:00Z", available: true },
      { itemId: "fixture-evaluation", title: "合成新闻：另一机构公开评估结果",
        summary: "报告披露项目覆盖范围及受益者回访情况。", sourceName: "合成独立信源",
        sourceUrl: "https://example.org/evaluation", sourceId: "agency-b", sourceIconUrl: null,
        firstParty: false, role: "媒体", storyPublicId: "story-b",
        publishedAt: "2026-11-13T00:00:00Z", available: true },
    ];
    const report = {
      kind: "weekly", key: "2026-W46", title: "合成周报",
      windowStart: "2026-11-09T00:00:00Z", windowEnd: "2026-11-16T00:00:00Z",
      generatedAt: "2026-11-16T00:00:00Z", revision: 1, lead: null,
      overview: "模拟旧版很长的新闻摘要，不应压过已核实的洞察。",
      insights: [{
        level: "pattern", claim: "项目评价开始关注结果与反馈",
        reasoning: "一项材料提出评价要求，另一项材料公开执行结果。两者涉及不同环节，仍不足以证明行业整体转向。",
        alternative: "也可能是两个孤立案例，尚未形成广泛实践。",
        watchFor: "核对更多机构是否发布结果与反馈的正式报告。",
        evidence: refs,
      }],
      highlights: [], sections: [{ label: "合成议题归档", summary: "旧的主题摘要不应在首屏重复", items: refs }],
      stories: refs.map(r => ({ ...r, label: "合成议题归档" })),
      flashes: [{ ...refs[0], itemId:"fixture-flash", title:"合成快讯：专项公开征求意见" }],
      peers: { label:"邻域", note:null, items:[{
        key:"sibling:1", peerId:"sibling", peerName:"合成姊妹站", peerUrl:"https://example.org/peer",
        title:"合成邻域报道", summary:"合成邻域摘要", reason:null, category:"公益", score:null,
        publishedAt:"2026-11-15T00:00:00Z", url:"https://example.org/peer/article",
        sourceName:"合成独立站点", originalUrl:"https://example.org/original",
      }] }, cover: null,
      yesterdayHot: { day: "2026-11-15", computedAt: "2026-11-15T15:30:00Z",
        entries: [{ rank: 1, storyPublicId: "story-a", itemId: "fixture-policy",
          title: "昨日热榜合成头条", sourceName: "合成官方信源", heat: 18.7 }] },
      metrics: { totalStories: 2, sourcesCount: 2 },
      readingMinutes: 1, prev: null, next: null,
    };
    return res.end(JSON.stringify({ index: [{ key: "2026-W46", title: "合成周报", count: 2 }], report }));
  }
  if (url.pathname === "/api/site/meta") {
    const respond = () => res.end(JSON.stringify({ changelogVersion: "2026-09-28T12:00" }));
    return metaDelayMs ? setTimeout(respond, metaDelayMs) : respond();
  }
  if (url.pathname === "/api/site/timeline") {
    const filters = { channel: "all", category: url.searchParams.get("category"), tag: null, topic: null };
    res.setHeader("X-Accel-Expires", `@${deadline}`);
    res.setHeader("Cache-Control", "public, max-age=30, s-maxage=30");
    return res.end(JSON.stringify({ filters, cards: [], nextCursor: null, refreshAt, dayCounts: [], hot: null, generatedAt: "2026-09-28T00:00:00Z" }));
  }
  // /all also loads the reviewed-city picker. Keep the synthetic fixture in
  // sync with the real loader so unrelated cache assertions are not false 404s.
  if (url.pathname === "/api/site/geo/places")
    return res.end(JSON.stringify({ places: [], generatedAt: "2026-09-28T00:00:00Z" }));
  if (url.pathname === "/api/site/pool") {
    const filters = { channel: "all", category: url.searchParams.get("category"), tag: url.searchParams.get("tag"), q: url.searchParams.get("q"), tab: "time" };
    return res.end(JSON.stringify({ filters, items: [], page: 1, pageCount: 1, total: 0, todayCount: 0, freshness: "2026-09-28T00:00:00Z", generatedAt: "2026-09-28T00:00:00Z" }));
  }
  if (url.pathname === "/api/site/hot") return res.end(JSON.stringify({ entries: [] }));
  if (url.pathname === "/api/site/echo-client") return res.end(JSON.stringify({ forwarded: req.headers["x-forwarded-for"], real: req.headers["x-real-ip"] }));
  if (url.pathname === "/api/site/items/long-lived") return res.end(JSON.stringify({ id: "long-lived", title: "t" }));
  if (url.pathname === "/api/site/contact") return res.end(JSON.stringify({ wechatQr: "/qr.png", feishuQr: "/qr.png" }));
  if (url.pathname === "/api/site/stories/merged") {
    res.statusCode = 308;
    return res.end(JSON.stringify({ mergedInto: "surviving-story" }));
  }
  res.statusCode = url.pathname.startsWith("/api/admin/") ? 401 : 404;
  res.end(JSON.stringify({ code: "not_found" }));
});

before(async () => {
  deadline = Math.floor(Date.now() / 1000) + 20;
  refreshAt = new Date((deadline + 5) * 1000).toISOString();
  api.listen(0, "127.0.0.1");
  await once(api, "listening");
  web = spawn(process.execPath, [fileURLToPath(new URL("../server.ts", import.meta.url))], {
    env: { ...process.env, WEB_PORT: "0", TRUST_PROXY: "false", API_BASE_URL: `http://127.0.0.1:${(api.address() as AddressInfo).port}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`web did not start: ${logs}`)), 15_000);
    web.on("exit", () => { clearTimeout(timeout); reject(new Error(`web exited: ${logs}`)); });
    web.stderr!.on("data", (chunk) => { logs += String(chunk); });
    web.stdout!.on("data", (chunk) => {
      logs += String(chunk);
      const match = logs.match(/"msg":"web started","port":(\d+)/);
      if (match) {
        origin = `http://127.0.0.1:${match[1]}`;
        clearTimeout(timeout);
        resolve();
      }
    });
  });
});

after(async () => {
  if (web && web.exitCode === null) {
    web.kill("SIGTERM");
    await once(web, "exit");
  }
  api.closeAllConnections();
  await new Promise<void>((resolve) => api.close(() => resolve()));
});

test("the retired selected page redirects to all dynamics and keeps filters", async () => {
  const category = CATEGORY_KEYS.at(-1)!;
  const home = await fetch(`${origin}/_.data?category=${category}&_routes=routes%2Fhome`);
  assert.equal(home.status, 202);
  assert.equal(home.headers.get("Cache-Control"), "private, no-store");
  assert.match(await home.text(), new RegExp(`/all\\?category=${category}`));
  const all = await fetch(`${origin}/all.data?category=${category}`);
  assert.equal(all.status, 200);
  assert.match(await all.text(), new RegExp(category));
});

test("HTML and navigation share freshness; cookies do not personalize public results", async () => {
  const html = await fetch(`${origin}/yihot/`);
  assert.equal(html.status, 200);
  assert.match(await html.text(), />动态</);
  const plain = await fetch(`${origin}/about.data`);
  const signedIn = await fetch(`${origin}/about.data?_routes=root`, { headers: { cookie: "admin_session=private; aihot_vid=reader" } });
  assert.match(plain.headers.get("Cache-Control")!, /^public,/);
  assert.match(plain.headers.get("X-Accel-Expires")!, /^@\d+$/);
  assert.equal(plain.headers.get("Cache-Control"), "public, max-age=300, s-maxage=300, must-revalidate");
  assert.equal(Date.parse(plain.headers.get("Date")!) / 1000 + 300, Number(plain.headers.get("X-Accel-Expires")!.slice(1)));
  assert.equal(signedIn.headers.get("Set-Cookie"), null);
  assert.equal(await signedIn.text(), await plain.text());
  assert.ok(apiCookies.every((cookie) => !cookie));
});

test("missing routes cannot be hidden by a root-only request; errors and redirects stay uncached", async () => {
  for (const pathname of ["/items/missing.data?_routes=root", "/does-not-exist.data?_routes=root", "/items/missing"]) {
    const res = await fetch(origin + pathname);
    assert.equal(res.status, 404, pathname);
    assert.equal(res.headers.get("Cache-Control"), "private, no-store");
    assert.equal(res.headers.get("X-Accel-Expires"), "0");
    await res.text();
  }
  for (const [pathname, target] of [["/story/merged.data?_routes=root", "/story/surviving-story"], ["/_.data?q=search&_routes=root", "/all?q=search"]]) {
    const res = await fetch(origin + pathname);
    assert.equal(res.status, 202);
    assert.equal(res.headers.get("Cache-Control"), "private, no-store");
    assert.match(await res.text(), new RegExp(target.replace("?", "\\?")));
  }
});

test("admin data and actions never become public cache entries", async () => {
  for (const path of ["sources", "geo"]) {
    const admin = await fetch(`${origin}/yihot/admin/${path}.data?_routes=admin-layout`);
    assert.equal(admin.status, 202);
    assert.equal(admin.headers.get("Cache-Control"), "private, no-store");
    assert.equal(admin.headers.get("X-Accel-Expires"), "0");
    assert.match(await admin.text(), /admin\/login/);
  }
  const action = await fetch(`${origin}/yihot/hot.data`, { method: "POST" });
  assert.equal(action.status, 405);
  assert.equal(action.headers.get("Cache-Control"), "private, no-store");
  assert.equal(action.headers.get("X-Accel-Expires"), "0");
  await action.text();
});

test("all dynamics keeps a bounded shared cache", async () => {
  const res = await fetch(origin + "/yihot/all");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=60, s-maxage=60, must-revalidate");
  await res.text();
  const now = Date.parse("2026-09-28T00:00:00Z");
  const upstream = new Headers({ "X-Accel-Expires": `@${now / 1000 + 7}` });
  const headers = releaseBoundCache(new Date(now + 20_000).toISOString(), 30, now + 2_000, upstream);
  assert.equal(headers["Cache-Control"], "public, max-age=0, s-maxage=5");
  assert.equal(headers["X-Accel-Expires"], upstream.get("X-Accel-Expires"));
});

test("the edge may keep a page longer than browsers, which a withdrawal purge cannot reach", async () => {
  const res = await fetch(`${origin}/items/long-lived.data`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=300, s-maxage=600, must-revalidate");
  await res.text();
});

test("browser caching preserves noindex and private sign-in responses", async () => {
  const feedback = await fetch(origin + "/feedback");
  assert.equal(feedback.status, 200);
  assert.match(await feedback.text(), /name="robots" content="noindex/);
  assert.equal(feedback.headers.get("Cache-Control"), "public, max-age=300, s-maxage=300, must-revalidate");
  const login = await fetch(origin + "/admin/login");
  assert.equal(login.status, 200);
  assert.equal(login.headers.get("Cache-Control"), "private, no-store");
  assert.equal(login.headers.get("X-Robots-Tag"), "noindex, nofollow");
  await login.text();
});

test("weekly report leads with cited real-source fields; full summaries stay in a closed archive", async () => {
  const response = await fetch(origin + "/yihot/weekly");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /这些新闻，值得放在一起看/);
  assert.match(html, /项目评价开始关注结果与反馈/);
  assert.match(html, /合成新闻：某地公布项目评估办法/);
  assert.match(html, /合成新闻：另一机构公开评估结果/);
  assert.match(html, /href="https:\/\/example\.org\/policy"/);
  assert.match(html, /href="https:\/\/example\.org\/evaluation"/);
  assert.match(html, /需要留意：/);
  assert.match(html, /昨日热榜合成头条/);
  assert.ok(html.includes("热度") && html.includes("18.7"), "historic snapshot must retain its measured heat value");
  assert.ok(html.indexOf("昨日热榜合成头条") < html.indexOf("合成议题归档"),
    "historical leaderboard must come before the story archive");
  // 总摘要自 11-17 起直接展示（`9a07bef`），只有分节 summary 还折叠；读周报第一眼要读到的就是它。
  assert.doesNotMatch(html, /<details id="report-overview"/, "the overview is set in full, not folded");
  assert.match(html, /本版原摘要/, "keep former section summary available under a foldout");
  // 折叠按钮的文案自 `9a07bef` 起只有「本版原摘要」；「查看本期原摘要」是总摘要折叠时代留下的旧词。
  assert.ok(html.indexOf("昨日热榜合成头条") < html.indexOf("本版原摘要"),
    "put historic ranking before the archived section summaries");
    assert.doesNotMatch(html, /00 ·/, "the analysis page stays unnumbered");
    assert.match(html, /本周观察/, "the weekly analysis stays evidence-led");
  assert.match(html, /<section id="report-archive"[^>]*>/,
    "the website's 01+ news pages must be visible without opening an outer foldout");
  assert.doesNotMatch(html, /<details id="report-archive"/);
  assert.ok(html.indexOf('id="s-yesterday-hot"') < html.indexOf('id="s-1"'),
    "01 historical hot ranks before the first subject");
  assert.ok(html.indexOf('id="s-1"') < html.indexOf('id="s-flash"'),
    "article categories precede overflow news");
  assert.ok(html.indexOf('id="s-flash"') < html.indexOf('id="s-peers"'),
    "peer neighbourhood must be the very last edition content section");
  assert.match(html, /本版原摘要/, "the original summaries remain individually expandable");
  assert.ok(html.indexOf("项目评价开始关注结果与反馈") < html.indexOf('id="report-archive"'),
    "evidence-driven body should appear before the full list of news");
  assert.doesNotMatch(html, /aria-label="头版"/, "do not repeat an overview before the evidence narrative");
});

test("a visitor cannot name its own address to the api without a trusted proxy in front", async () => {
  const res = await fetch(`${origin}/api/site/echo-client`, { headers: { "X-Forwarded-For": "6.6.6.6", "X-Real-IP": "6.6.6.6" } });
  assert.deepEqual(await res.json(), { forwarded: "127.0.0.1", real: "127.0.0.1" });
});
