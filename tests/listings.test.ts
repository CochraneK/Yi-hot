// A listing that names one article more than once stores it once, a feed whose entries are sections
// of one page (release notes #september-24-2026 …) keeps one article per section when the source says
// so, and a feed that garbles different characters on every load keeps one version. Before the
// fixes all three became revisions of one article on every fetch. A changelog whose updates sit under
// date headings (a foundation's update log) yields its updates, not the headings.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { collectSource } from "@aihot/backend/sources/collect";

const T = tag();
const DUP_SOURCE = `test-rss-dup-${T}`;
const NOTES_SOURCE = `test-rss-notes-${T}`;
const GARBLED_SOURCE = `test-rss-garbled-${T}`;
const CHANGELOG_SOURCE = `test-web-changelog-${T}`;
const AGE_SOURCE = `test-rss-age-${T}`;
const ARCHIVE_SOURCE = `test-web-archive-${T}`;
const UNDATED_SOURCE = `test-web-undated-${T}`;
const DAY = 86_400_000;

const item = (title: string, link: string, daysAgo: number) =>
  `<item><title>${title}</title><link>${link}</link><guid>${link}</guid><pubDate>${new Date(Date.now() - daysAgo * DAY).toUTCString()}</pubDate><description>${title} summary</description></item>`;
const feeds: Record<string, string> = {
  // a foundation's media page lists one report twice, under two titles.
  "/dup.xml": [item(`公益报告 — 透明度专题 ${T}`, `https://example.org/watch-${T}`, 0.1), item(`公开募捐资金流向年度盘点 ${T}`, `https://example.org/watch-${T}`, 0.1)].join(""),
  "/notes.xml": ["september-24", "september-23", "september-22"].map((d, i) => item(`Release notes — ${d} ${T}`, `https://example.org/notes-${T}/overview#${d}`, 0.1 + i)).join(""),
  // 年龄闸门用：一条刚发的，一条四十天前的（闸门设 2 天，所以它该被拦下）。
  [`/age-${T}.xml`]: [item(`旧稿 ${T}`, `https://example.org/old-${T}`, 40), item(`新稿 ${T}`, `https://example.org/new-${T}`, 0.1)].join(""),
};
// A feed that loses a character here and there on every load, sent as two or three U+FFFD, in titles and
// in descriptions longer than the excerpt kept from them.
const story = "9月25日，维多利亚的秘密上海淮海旗舰店开业，这是维密在中国市场运营十周年之际对线下门店的一次重新布局。".repeat(50);
const lose = (s: string, at: number, n: number) => s.slice(0, at) + "\uFFFD".repeat(n) + s.slice(at + 1);
const title = `维密重回上海淮海路，中国市场进入扩店阶段 ${T}`;
const garbledLoads = [[title, story], [title, lose(story, 120, 3)], [lose(title, 2, 2), lose(story, 700, 2)]];
let garbledLoad = 0;
// A trimmed copy of a foundation's update log (Docusaurus): each date heading, in either of the two
// label styles the page uses, is followed by the update headings that belong to it.
const heading = (level: number, id: string, text: string) =>
  `<h${level} class="anchor" id="${id}">${text}<a href="#${id}" class="hash-link" title="${text}的直接链接">\u200b</a></h${level}>`;
const changelog = `<!doctype html><html><body><article><div class="theme-doc-markdown markdown"><div class="row"><div class="col"><h1>更新日志</h1><hr>
${heading(2, "时间-2026-09-10", "时间: 2026-09-10")}
${heading(3, "nutrition-phase-2", `乡村儿童营养项目二期启动 ${T}`)}<p>今天，我们正式启动二期项目，覆盖范围扩大到 12 个省份。</p>
${heading(2, "时间-2025-12-01", "时间: 2025-12-01")}
${heading(3, "annual-transparency-report", `年度透明报告发布 ${T}`)}<p>年度透明报告已上传至公开平台，包含全部资金流向。</p>
${heading(3, "volunteer-platform-v2", `志愿者平台 2.0 上线 ${T}`)}<p>志愿者平台 2.0 正式版上线。</p>
${heading(2, "时间2024-05-17", "时间：2024-05-17")}
${heading(3, "fund-flow-disclosure", `募捐资金流向季度公示 ${T}`)}<p>募捐资金流向按季度公示，本季度报告已发布。</p>
</div></div></div></article></body></html>`;
const server = http.createServer((req, res) => {
  // 两种列表：一种印日期（但侧栏混进了几条归档文件，没有日期），一种整页都不印日期。
  if (req.url?.startsWith(`/archive-${T}/`)) {
    const dated = [
      ["儿童康复救助项目启动", "a1", "2026-10-20"],
      ["未成年人保护工作站挂牌", "a2", "2026-10-18"],
      ["困境儿童助学名单公示", "a3", "2026-09-30"],
      ["残障儿童辅具适配完成", "a4", "2025-08-01"],
    ].map(([t, s, d]) => `<li><a href="/archive-${T}/${s}.html">${t} ${T}</a><span class="d">${d}</span></li>`);
    const undated = ["2008 年国妇儿工委字 1 号", "2018 年度工作要点"].map(
      (t, i) => `<li><a href="/archive-${T}/old-${i}.html">${t} ${T}</a></li>`,
    );
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html><body><ul class="news">${dated.join("")}${undated.join("")}</ul></body></html>`);
    return;
  }
  if (req.url?.startsWith(`/undated-${T}/`)) {
    const items = ["区残联开展助残日活动", "街道走访困境儿童家庭", "残疾人就业招聘会举行"].map(
      (t, i) => `<li><a href="/undated-${T}/n${i}.html">${t} ${T}</a></li>`,
    );
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html><body><ul class="news">${items.join("")}</ul></body></html>`);
    return;
  }
  if (req.url === "/updates/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(changelog);
    return;
  }
  let entries = feeds[req.url ?? ""] ?? "";
  if (req.url === "/garbled.xml") {
    const [t, description] = garbledLoads[garbledLoad++ % garbledLoads.length]!;
    entries = `<item><title>${t}</title><link>https://example.org/p/${T}?f=rss</link><pubDate>${new Date().toUTCString()}</pubDate><description><![CDATA[<p>${description}</p>]]></description></item>`;
  }
  res.writeHead(200, { "content-type": "application/rss+xml; charset=utf-8" });
  res.end(`<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${entries}</channel></rss>`);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
config.allowPrivateNetworkFetch = true;

before(async () => {
  const cursor = sql.json({ initializedAt: new Date().toISOString() });
  // 更新日志是档案型页面：越老的条目越是该有的，增量采集的年龄闸门（默认 365 天）会把 2024 年
  // 那条当成旧稿丢掉，所以那个源显式写 ingestMaxAgeDays: 0 —— 不设闸门。
  await sql`INSERT INTO sources (id, name, kind, config, tier, participation_mode, cursor, next_fetch_at) VALUES
    (${DUP_SOURCE}, 'Test feed', 'rss', ${sql.json({ feedUrl: `${base}/dup.xml` })}, 'T1', 'editorial', ${cursor}, '2100-01-01'),
    (${NOTES_SOURCE}, 'Test release notes', 'rss', ${sql.json({ feedUrl: `${base}/notes.xml`, preserveUrlFragment: true })}, 'T1', 'editorial', ${cursor}, '2100-01-01'),
    (${GARBLED_SOURCE}, 'Test garbling feed', 'rss', ${sql.json({ feedUrl: `${base}/garbled.xml` })}, 'T1', 'hot_signal', ${cursor}, '2100-01-01'),
    (${AGE_SOURCE}, 'Test age gate', 'rss', ${sql.json({ feedUrl: `${base}/age-${T}.xml`, _aihot: { ingestMaxAgeDays: 2 } })}, 'T1', 'editorial', ${cursor}, '2100-01-01'),
    (${CHANGELOG_SOURCE}, 'Test changelog', 'web_list', ${sql.json({ url: `${base}/updates/`, baseUrl: `${base}/updates/`, parseMode: "docusaurus_changelog", allowUrlPrefixes: [`${base}/updates/`], preserveUrlFragment: true, _aihot: { ingestMaxAgeDays: 0 } })}, 'T1', 'editorial', ${cursor}, '2100-01-01'),
    (${ARCHIVE_SOURCE}, 'Test archive sidebar', 'web_list', ${sql.json({ url: `${base}/archive-${T}/`, baseUrl: `${base}/archive-${T}/`, itemSelector: "ul.news li", linkSelector: "a", titleSelector: "a", publishedAtSelector: "span.d", allowUrlPrefixes: [`${base}/archive-${T}/`], _aihot: { initialBackfillLimit: 20 } })}, 'T1', 'editorial', ${cursor}, '2100-01-01'),
    (${UNDATED_SOURCE}, 'Test undated listing', 'web_list', ${sql.json({ url: `${base}/undated-${T}/`, baseUrl: `${base}/undated-${T}/`, itemSelector: "ul.news li", linkSelector: "a", titleSelector: "a", publishedAtSelector: "span.d", allowUrlPrefixes: [`${base}/undated-${T}/`], _aihot: { initialBackfillLimit: 20 } })}, 'T1', 'editorial', ${cursor}, '2100-01-01')`;
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await stopBoss();
  await closeDb();
});

const articles = (sourceId: string) =>
  sql<{ url: string; title: string; revision: number }[]>`SELECT url, title, revision FROM articles WHERE source_id = ${sourceId} ORDER BY url`;

test("an article a feed lists twice is stored once and stays put across fetches", async () => {
  for (let run = 0; run < 3; run++) assert.equal((await collectSource(DUP_SOURCE, { force: true })).status, "ok");
  const rows = await articles(DUP_SOURCE);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0]!.title, rows[0]!.revision], [`公益报告 — 透明度专题 ${T}`, 1], "the first entry, never revised");
});

test("sections of one page are separate articles when the source keeps fragments", async () => {
  for (let run = 0; run < 2; run++) assert.equal((await collectSource(NOTES_SOURCE, { force: true })).status, "ok");
  const rows = await articles(NOTES_SOURCE);
  assert.deepEqual(
    rows.map((r) => [r.url.replace(/^.*#/, "#"), r.revision]),
    [["#september-22", 1], ["#september-23", 1], ["#september-24", 1]],
  );
});

test("a feed that garbles different characters on every load keeps one version", async () => {
  for (let run = 0; run < 3; run++) assert.equal((await collectSource(GARBLED_SOURCE, { force: true })).status, "ok");
  const rows = await articles(GARBLED_SOURCE);
  assert.deepEqual(rows.map((r) => [r.title, r.revision]), [[title, 1]]);
});

test("增量采集不收比闸门更老的稿子，拦了几条写进运行记录", async () => {
  // 归档页会把几年前的老条目一起列出来，增量跑一次就全当新稿灌进来 —— 那是「今天收录了 2024 年的
  // 稿子」的来路。闸门只管增量（首采另有 initialBackfillMonths），档案型源写 0 关掉。
  assert.equal((await collectSource(AGE_SOURCE, { force: true })).status, "ok");
  const rows = await articles(AGE_SOURCE);
  assert.deepEqual(rows.map((r) => r.title), [`新稿 ${T}`], "四十天前的那条不该进来");
  const [run] = await sql<{ detail: { droppedOld?: number } | null }[]>`
    SELECT detail FROM fetch_runs WHERE source_id = ${AGE_SOURCE} ORDER BY id DESC LIMIT 1`;
  assert.equal(run!.detail?.droppedOld, 1, "整批被拦时也要看得见拦了几条");
});

test("a changelog's date headings date its updates and are no articles themselves", async () => {
  assert.equal((await collectSource(CHANGELOG_SOURCE, { force: true })).status, "ok");
  const rows = await sql<{ url: string; title: string; published_at: Date | null }[]>`
    SELECT url, title, published_at FROM articles WHERE source_id = ${CHANGELOG_SOURCE} ORDER BY published_at DESC, url`;
  assert.deepEqual(
    rows.map((r) => [decodeURIComponent(r.url.replace(/^.*#/, "#")), r.title.replace(` ${T}`, ""), r.published_at?.toISOString()]),
    [
      ["#nutrition-phase-2", "乡村儿童营养项目二期启动", "2026-09-09T16:00:00.000Z"],
      ["#annual-transparency-report", "年度透明报告发布", "2025-11-30T16:00:00.000Z"],
      ["#volunteer-platform-v2", "志愿者平台 2.0 上线", "2025-11-30T16:00:00.000Z"],
      ["#fund-flow-disclosure", "募捐资金流向季度公示", "2024-05-16T16:00:00.000Z"],
    ],
  );
});

test("首采丢掉「列表印日期、自己却没有日期」的侧栏归档条目", async () => {
  // 侧栏、栏目导航、历史文件常和正文用同一种条目选择器。它们解析不出日期，按收录时间落位就绕过了
  // 12 个月窗——「今天收录了 2018 年的稿子」就是这么来的。判据：本轮过半条目带日期时，无日期的当归档。
  assert.equal((await collectSource(ARCHIVE_SOURCE, { force: true })).status, "ok");
  const rows = await articles(ARCHIVE_SOURCE);
  assert.deepEqual(
    rows.map((r) => r.title.replace(` ${T}`, "")).sort(),
    ["儿童康复救助项目启动", "困境儿童助学名单公示", "未成年人保护工作站挂牌"],
    "四条带日期里 2025-08 那条超窗，两条无日期的当归档丢掉",
  );
  const [run] = await sql<{ detail: { droppedOld?: number } | null }[]>`
    SELECT detail FROM fetch_runs WHERE source_id = ${ARCHIVE_SOURCE} ORDER BY id DESC LIMIT 1`;
  assert.equal(run!.detail?.droppedOld, 3, "超窗一条 + 无日期两条，都该在运行记录里看得见");
});

test("整页都不印日期的列表照旧全收，不误杀", async () => {
  // 很多区政府站的列表就是不给日期，只能靠详情页；这种站若也按「无日期=归档」处理会被清空。
  assert.equal((await collectSource(UNDATED_SOURCE, { force: true })).status, "ok");
  const rows = await articles(UNDATED_SOURCE);
  assert.equal(rows.length, 3);
});
