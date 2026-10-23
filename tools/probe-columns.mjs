#!/usr/bin/env node
// 找「业务栏目」：首页往往把要闻、领导讲话放在最显眼的列表里，地方业务稿在二级栏目。
// 给定站点，先抓首页链接，挑出名字像新闻/业务栏目的，再逐个探列表结构与日期覆盖率。
// 用法：node tools/probe-columns.mjs --file sites.txt [--per 8]
// 只打印，不写库。
import { load } from "cheerio";
import { readFileSync } from "node:fs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const argv = process.argv.slice(2);
const sites = argv[0] === "--file" ? readFileSync(argv[1], "utf8").split("\n").map((s) => s.trim()).filter(Boolean) : argv;
const per = Number(argv.includes("--per") ? argv[argv.indexOf("--per") + 1] : 8);

function decode(buf) {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  return (utf8.match(/\uFFFD/g) ?? []).length > 20 ? new TextDecoder("gb18030").decode(buf) : utf8;
}
async function get(url) {
  const res = await fetch(url, { redirect: "follow", headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(18000) });
  const buf = new Uint8Array(await res.arrayBuffer()).slice(0, 800 * 1024);
  return { status: res.status, url: res.url, html: decode(buf) };
}
// 列表质量：条目数、日期覆盖率、标题样例。挑「含 1 个链接、标题 ≥ 8 字」的 li/tr/div。
function bestList(html) {
  const $ = load(html);
  const groups = new Map();
  $("li,tr,div").each((_i, el) => {
    const $el = $(el);
    const as = $el.find("a[href]");
    if (as.length !== 1) return;
    const title = (as.attr("title") || as.text() || "").replace(/\s+/g, " ").trim();
    if (title.length < 8) return;
    const parent = $el.parent().get(0);
    if (!parent) return;
    if ($(parent).children("li,tr,div").length < 4) return;
    const cls = ($(parent).attr("class") || "").trim().split(/\s+/).filter(Boolean).join(".");
    const key = `${parent.tagName}${cls ? "." + cls : ""}`;
    if (!groups.has(key)) groups.set(key, []);
    const dated = /(20\d{2})[-/年.](\d{1,2})[-/月.](\d{1,2})/.test($el.text());
    groups.get(key).push({ title, dated, href: as.attr("href") || "" });
  });
  let best = null;
  for (const [key, items] of groups) {
    const dated = items.filter((x) => x.dated).length;
    const score = items.length + dated * 2;
    if (!best || score > best.score) best = { key, items, dated, score };
  }
  return best;
}

const COLUMN_HINT = /动态|要闻|新闻|工作|业务|基层|地方|康复|就业|维权|教育|助残|服务|资讯|简报|信息|专题/;
const SKIP = /\.(pdf|doc|docx|xls|xlsx|zip|jpg|png|gif|mp4)$|javascript:|^#|mailto:/i;

for (const site of sites) {
  console.log(`\n===== ${site}`);
  let home;
  try {
    home = await get(site);
  } catch (e) {
    // 换 https 或去 www 再试一次，区分「协议/主机名写错」与「真不可达」
    const alt = site.startsWith("https:") ? site.replace("https://", "http://") : site.replace("http://", "https://");
    try {
      home = await get(alt);
      console.log(`  首页走 ${alt} 才通`);
    } catch (e2) {
      console.log(`  不可达：${String(e).slice(0, 60)} / ${String(e2).slice(0, 40)}`);
      continue;
    }
  }
  const $ = load(home.html);
  const origin = new URL(home.url).origin;
  const seen = new Set();
  const candidates = [];
  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href") || "";
    const text = ($(el).text() || "").replace(/\s+/g, "").trim();
    if (!text || text.length > 12 || !COLUMN_HINT.test(text) || SKIP.test(href)) return;
    let abs;
    try {
      abs = new URL(href, home.url).href;
    } catch {
      return;
    }
    if (!abs.startsWith(origin) || abs === home.url || seen.has(abs)) return;
    seen.add(abs);
    candidates.push({ text, abs });
  });
  console.log(`  首页 ${home.status} ${home.html.length}B，候选栏目 ${candidates.length} 个`);

  const ranked = [];
  for (const c of candidates.slice(0, per)) {
    try {
      const page = await get(c.abs);
      const best = bestList(page.html);
      if (!best) continue;
      ranked.push({ ...c, ...best, len: page.html.length });
    } catch {
      /* 单个栏目打不开就跳过 */
    }
  }
  ranked.sort((a, b) => b.score - a.score);
  for (const r of ranked.slice(0, 3)) {
    console.log(`  [${r.score}] ${r.text} ${r.abs}`);
    console.log(`        ${r.key} n=${r.items.length} dated=${r.dated}`);
    r.items.slice(0, 3).forEach((x) => console.log(`        - ${x.dated ? "有日期" : "无日期"} ${x.title.slice(0, 44)}`));
  }
  if (!ranked.length) console.log("  候选栏目都没有可用列表");
}
