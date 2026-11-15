// 「邻域」的选稿规则。纯函数，不连库、不发请求。
//
// 这里守的是一条容易被写错、且很难在页面上看出来的规则：**各姊妹站的分数不能跨站比较**。
// 每一家跑的是自己的模型、自己的评分标准，PsyHOT 的 78 分和 FilmTechNews 的 78 分不是一回事。
// 一旦按全局 score 排序，某个打分偏高的站会连着把整版占满，而这个错误在页面上只表现为
// 「怎么老是那一家」，不报错、不掉数据，所以必须有测试钉住「轮流取」这个行为。
import assert from "node:assert/strict";
import { test } from "node:test";
import { interleavePicks, rotationOrder, sortWithinPeer } from "@aihot/backend/peers/select";
import { peerFeedUrl, parseFeed, fetchPeer } from "@aihot/backend/peers/refresh";
import { PEER_SITES } from "@aihot/industry/peers";
import { readFileSync } from "node:fs";

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

test("邻域和 RSS 来源是两个模块：同站共享经过核实的 Feed 地址，但配置/开关独立", () => {
  const seed = JSON.parse(readFileSync(new URL("../industry/sources.json", import.meta.url), "utf8")).sources;
  const expected = [
    ["urhot", "rss-peer-urhot", "https://huangzhenhao90.github.io/ai-ux-research-hot/rss.xml"],
    ["aiman-robot-hot", "rss-peer-aiman-robot-hot", "https://www.aiman.world/robot-hot/feed.xml"],
  ];
  assert.equal(new Set(PEER_SITES.map(x => x.id)).size, PEER_SITES.length, "duplicate peer IDs");
  for (const [peerId, sourceId, url] of expected) {
    const peer = PEER_SITES.find(x => x.id === peerId);
    const source = seed.find((x: { id: string }) => x.id === sourceId);
    assert.ok(peer, peerId);
    assert.equal(peer.enabled, true, "visible as a cross-industry directory site");
    assert.equal(peer.strategy, "rss");
    assert.equal(peerFeedUrl(peer), url);
    assert.ok(source, sourceId);
    assert.equal(source.kind, "rss");
    assert.equal(source.config.feedUrl, url);
    assert.equal(source.enabled, false, "cross-sector RSS cannot silently start public ingestion");
    assert.equal(source.participation_mode, "isolated");
    assert.equal(source.site_fulltext, false);
    assert.equal(source.syndicate_fulltext, false);
    assert.ok(source.config.ingestNoiseFilter.requireMarkers.length > 5);
    assert.ok(source.config._aihot.initialBackfillLimit <= 4);
  }
  assert.equal(peerFeedUrl({ url: "https://example.org/foo/" }), "https://example.org/foo/feed.xml");
});

test("邻域 RSS 自定义路径只能留在站点的 HTTPS 主机", () => {
  for (const path of [
    "//evil.example/secret", "/foo/../bar", "/foo/./bar", "/ok?redirect=evil",
    "/ok#fragment", "https://evil.example/rss.xml", "/foo/%2e%2e/rss.xml",
  ]) {
    assert.throws(() => peerFeedUrl({ url: "https://example.org", feedPath: path }), path);
  }
  assert.equal(peerFeedUrl({ url: "https://example.org/site/", feedPath: "/site/rss.xml" }),
    "https://example.org/site/rss.xml");
});

test("已核实来源的两种 RSS 格式都能解析并保留时间、引用链接", () => {
  const urhot = `<?xml version="1.0"?><rss version="2.0"><channel><title>URHOT</title><item>
    <title>研究在环</title><link>https://www.nngroup.com/articles/research-in-the-loop/</link>
    <description><![CDATA[一项用户研究方法讨论]]></description><pubDate>Fri, 13 Nov 2026 18:00:00 GMT</pubDate>
  </item></channel></rss>`;
  const aiman = `<?xml version="1.0"?><rss version="2.0"><channel><title>聚身之家</title><item>
    <title><![CDATA[机器人研究项目]]></title><link>https://www.aiman.world/robot-hot/items/abc</link>
    <guid>abc</guid><pubDate>Fri, 13 Nov 2026 05:00:00 GMT</pubDate>
    <description><![CDATA[原始研究的公开摘要]]></description>
  </item></channel></rss>`;
  const u = parseFeed(urhot), a = parseFeed(aiman);
  assert.equal(u.length, 1);
  assert.equal(a.length, 1);
  assert.match(u[0]!.title, /研究在环/);
  assert.match(a[0]!.title, /机器人研究/);
  assert.equal(u[0]!.itemUrl, "https://www.nngroup.com/articles/research-in-the-loop/");
  assert.equal(a[0]!.itemUrl, "https://www.aiman.world/robot-hot/items/abc");
  assert.ok(u[0]!.publishedAt?.startsWith("2026-11-13"));
  assert.ok(a[0]!.publishedAt?.startsWith("2026-11-13"));
});

test("新增 3 个可同步邻域网站与独立关闭的 RSS 一一对应", () => {
  const sources = JSON.parse(readFileSync(new URL("../industry/sources.json", import.meta.url), "utf8")).sources;
  const cases = [
    ["autohot", "rss-peer-autohot", "https://www.autohot.top/feed.xml"],
    ["huifangyun", "rss-peer-huifangyun", "https://info.huifangyun.com/feed.xml"],
    ["fai-lab", "rss-peer-fai-lab", "https://fai.fashion/feed.xml"],
  ];
  assert.equal(new Set(PEER_SITES.map(x => x.id)).size, PEER_SITES.length);
  assert.equal(new Set(sources.map((x: {id: string}) => x.id)).size, sources.length);
  for (const [peerId, sourceId, expectedFeed] of cases) {
    const peer = PEER_SITES.find(x => x.id === peerId);
    const source = sources.find((x: {id: string}) => x.id === sourceId);
    assert.ok(peer, peerId);
    assert.equal(peer.enabled, true);
    assert.equal(peer.strategy, "rss");
    assert.equal(peerFeedUrl(peer), expectedFeed);
    assert.ok(source, sourceId);
    assert.equal(source.kind, "rss");
    assert.equal(source.enabled, false, "RSS collection must require explicit separate review");
    assert.equal(source.participation_mode, "isolated");
    assert.equal(source.config.feedUrl, expectedFeed);
    assert.equal(source.site_fulltext, false);
    assert.equal(source.syndicate_fulltext, false);
    assert.ok(source.config.ingestNoiseFilter.requireMarkers.length > 8);
    assert.ok(source.config._aihot.initialBackfillLimit <= 4);
  }
});

test("仅浏览的 4 个邻域链接不发外部请求，也不伪装 RSS 或独立证据", async () => {
  const sources = JSON.parse(readFileSync(new URL("../industry/sources.json", import.meta.url), "utf8")).sources;
  const candidates = ["ai4scihot", "horizon-uu", "fengxiang-demo", "newsiq"];
  for (const id of candidates) {
    const peer = PEER_SITES.find(x => x.id === id);
    assert.ok(peer, id);
    assert.equal(peer.enabled, true);
    assert.equal(peer.strategy, "link");
    assert.ok(peer.url.startsWith("https://"));
    assert.equal(peer.feedPath, undefined, id);
    assert.ok(!sources.some((x: {id: string}) => x.id === `rss-peer-${id}`));
    const result = await fetchPeer(peer);
    assert.deepEqual(result, { via: "none", items: [], error: null });
  }
  assert.ok(PEER_SITES.some(x => x.strategy === "none" && !x.enabled),
    "disabled/unavailable sites must remain distinct from readable link-only sites");
});

test("现有 RSS/Atom 解析支持新增跨行业来源的摘要而不制造已验证事实", () => {
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Vertical RSS</title>
  <item><title><![CDATA[2026年物业服务合规通知]]></title>
  <link>https://info.huifangyun.com/items/example</link>
  <pubDate>Fri, 13 Nov 2026 05:00:00 GMT</pubDate>
  <description><![CDATA[一份政策新闻的摘要，不代表法律意见。]]></description>
  </item></channel></rss>`;
  const entries = parseFeed(xml);
  assert.equal(entries.length, 1);
  assert.match(entries[0]!.title, /物业服务/);
  assert.match(entries[0]!.summary, /不代表法律意见/);
  assert.ok(entries[0]!.publishedAt?.startsWith("2026-11-13"));
});

test("本轮 3 个新 RSS 邻域源与关闭的独立技术信源一一对应", () => {
  const sources = JSON.parse(readFileSync(new URL("../industry/sources.json", import.meta.url), "utf8")).sources;
  const expected = [
    ["gamehot", "rss-peer-gamehot", "https://gamehot.org/feed.xml"],
    ["myhot-finance", "rss-peer-myhot-finance", "https://aihot.wscn.net/feed.xml"],
    ["ai-pulse-lab", "rss-peer-ai-pulse-lab", "https://ai-pulse-lab.com/feed.xml"],
  ];
  const peers = new Set(PEER_SITES.map(x => x.id));
  assert.equal(peers.size, PEER_SITES.length, "邻域站点 ID 不可重复");
  assert.equal(new Set(sources.map((x: {id: string}) => x.id)).size, sources.length, "信源 ID 不可重复");
  for (const [peerId, sourceId, expectedFeed] of expected) {
    const p = PEER_SITES.find(x => x.id === peerId);
    const src = sources.find((x: {id: string}) => x.id === sourceId);
    assert.ok(p, peerId);
    assert.equal(p.strategy, "rss");
    assert.equal(p.enabled, true);
    assert.equal(peerFeedUrl(p), expectedFeed);
    assert.ok(src, sourceId);
    assert.equal(src.kind, "rss");
    assert.equal(src.config.feedUrl, expectedFeed);
    assert.equal(src.enabled, false, "新增跨行业 RSS 不能自动启用");
    assert.equal(src.participation_mode, "isolated");
    assert.equal(src.site_fulltext, false);
    assert.equal(src.syndicate_fulltext, false);
    assert.ok(src.config._aihot.initialBackfillLimit <= 4);
    assert.ok(src.config.ingestNoiseFilter.requireMarkers.length >= 12);
  }
  assert.ok(PEER_SITES.length >= 39, "新增站点不应覆盖其他 Agent 的邻域登记");
});

test("研究、项目与行业工作台仅浏览站不执行第三方抓取", async () => {
  const justLink = ["xocto", "aimfast", "sanyu-insights"];
  const sources = JSON.parse(readFileSync(new URL("../industry/sources.json", import.meta.url), "utf8")).sources;
  for (const id of justLink) {
    const p = PEER_SITES.find(x => x.id === id);
    assert.ok(p, id);
    assert.equal(p.strategy, "link");
    assert.equal(p.enabled, true);
    assert.ok(p.url.startsWith("https://"));
    assert.equal(p.feedPath, undefined);
    assert.ok(!sources.some((x: {id: string}) => x.id === `rss-peer-${id}`));
    assert.deepEqual(await fetchPeer(p), { via: "none", items: [], error: null });
  }
});

test("公共领域 8 家新邻域可访问的站点配置遵循 RSS/仅浏览两套边界", async () => {
  const sources = JSON.parse(readFileSync(new URL("../industry/sources.json", import.meta.url), "utf8")).sources;
  const live = [
    ["china-law-translate", "rss-peer-china-law-translate", "https://www.chinalawtranslate.com/feed/"],
    ["open-contracting", "rss-peer-open-contracting", "https://www.open-contracting.org/feed/"],
    ["our-world-in-data", "rss-peer-our-world-in-data", "https://ourworldindata.org/atom.xml"],
  ];
  for (const [peerId, rssId, url] of live) {
    const peer = PEER_SITES.find(p => p.id === peerId);
    const seed = sources.find((s: {id: string}) => s.id === rssId);
    assert.ok(peer, peerId);
    assert.equal(peer.enabled, true);
    assert.equal(peer.strategy, "rss");
    assert.equal(peerFeedUrl(peer), url);
    assert.ok(seed, rssId);
    assert.equal(seed.kind, "rss");
    assert.equal(seed.config.feedUrl, url);
    assert.equal(seed.enabled, false, "技术 RSS 应默认关闭，不能混入主新闻付费流程");
    assert.equal(seed.participation_mode, "isolated");
    assert.equal(seed.site_fulltext, false);
    assert.equal(seed.syndicate_fulltext, false);
    assert.ok(seed.config._aihot.initialBackfillLimit <= 4);
  }
  for (const id of ["cdb-ngo", "foundation-center", "reliefweb-jobs", "funding-radar", "openalex-research"]) {
    const peer = PEER_SITES.find(p => p.id === id);
    assert.ok(peer, id);
    assert.equal(peer.enabled, true);
    assert.equal(peer.strategy, "link");
    assert.ok(peer.url.startsWith("https://"));
    assert.deepEqual(await fetchPeer(peer), { via: "none", items: [], error: null });
    assert.ok(!sources.some((s: {id: string}) => s.id === `rss-peer-${id}`));
  }
  assert.equal(new Set(PEER_SITES.map(x => x.id)).size, PEER_SITES.length);
  assert.equal(new Set(sources.map((x: {id: string}) => x.id)).size, sources.length);
});

test("同源 HTTPS 允许 /feed/ 与 /atom.xml，但保持路径校验", () => {
  const host = "https://www.chinalawtranslate.com/";
  assert.equal(peerFeedUrl({ url: host, feedPath: "/feed/" }),
    "https://www.chinalawtranslate.com/feed/");
  assert.equal(peerFeedUrl({ url: "https://ourworldindata.org/", feedPath: "/atom.xml" }),
    "https://ourworldindata.org/atom.xml");
  for (const path of ["//evil/", "/foo/../", "/foo//bar", "/feed/?url=evil", "/feed/#top"]) {
    assert.throws(() => peerFeedUrl({ url: host, feedPath: path }), path);
  }
});

test("Atom feed with self+alternate links retains the article, not self API URL", () => {
  const atom = `<?xml version="1.0" encoding="utf-8"?>
  <feed xmlns="http://www.w3.org/2005/Atom">
    <title>Our World in Data</title>
    <entry>
      <id>https://ourworldindata.org/article-01</id>
      <title>New evidence about children's education</title>
      <link rel="self" href="https://ourworldindata.org/atom.xml?article=01"/>
      <link rel="alternate" type="text/html" href="https://ourworldindata.org/article-01"/>
      <updated>2026-11-02T12:00:00Z</updated>
      <summary type="html">Research data and explanations</summary>
    </entry>
  </feed>`;
  const parsed = parseFeed(atom);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.itemUrl, "https://ourworldindata.org/article-01");
  assert.match(parsed[0]?.title || "", /children/);
  assert.equal(parsed[0]?.publishedAt, "2026-11-02T12:00:00.000Z");
});

test("所有邻域站点在唯一事实源中标有同系/其他归属，与行业分类正交", () => {
  const same = PEER_SITES.filter(p => p.family === "same");
  const other = PEER_SITES.filter(p => p.family === "other");
  assert.equal(same.length + other.length, PEER_SITES.length, "不允许漏标、第三类或隐式同系");
  assert.equal(new Set(PEER_SITES.map(p => p.id)).size, PEER_SITES.length);
  assert.ok(same.length > 0 && other.length > 0);
  assert.equal(PEER_SITES.length, 39, "归类不应改变现有登记数量");
  assert.equal(PEER_SITES.find(p => p.id === "urhot")?.family, "same",
    "URHOT README explicitly credits adaptation from AIHOT selection pipeline");
  assert.equal(PEER_SITES.find(p => p.id === "fai-lab")?.family, "same",
    "FAI About publicly identifies the original open-source framework");
  for (const id of ["cdb-ngo", "openalex-research", "foundation-center", "our-world-in-data"]) {
    assert.equal(PEER_SITES.find(p => p.id === id)?.family, "other", id);
  }
  for (const p of PEER_SITES) {
    assert.ok(["health", "public", "tech", "ai", "biz"].includes(p.group), p.id);
  }
});
