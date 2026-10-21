// 深度探测：从首页找出候选栏目页，再对每个候选页分析列表结构 + 日期命中率。
// 用法：node probe-deep.mjs <homeUrl> [maxCandidates]
import * as cheerio from "cheerio";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const home = process.argv[2];
const maxC = Number(process.argv[3] || 6);
if (!home) { console.error("need homeUrl"); process.exit(1); }

const DATE_RE = /\d{4}[-.\/年]\d{1,2}[-.\/月]\d{1,2}|\d{2}[-.\/]\d{2}[-.\/]\d{2}|\d{1,2}月\d{1,2}日/;

// 政府站大量用 GB2312，按 UTF-8 直接 text() 会全乱。与 http-fetch.ts 同策略：
// 先看 content-type，再看 meta charset，gb2312 一律按 gbk 解。
async function get(url) {
  try {
    const r = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    const buf = Buffer.from(await r.arrayBuffer());
    const head = buf.subarray(0, 4096).toString("latin1");
    let cs =
      /charset=["']?([\w-]+)/i.exec(r.headers.get("content-type") || "")?.[1] ||
      /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ||
      "utf-8";
    cs = cs.toLowerCase();
    let html;
    try {
      html = new TextDecoder(cs === "gb2312" ? "gbk" : cs).decode(buf);
    } catch {
      html = buf.toString("utf8");
    }
    return { status: r.status, finalUrl: r.url, html, charset: cs };
  } catch (e) {
    return { status: 0, finalUrl: url, html: "", err: String((e && e.message) || e).slice(0, 60) };
  }
}

function abs(href, base) {
  try { return new URL(href, base).toString(); } catch { return href; }
}

// 分析一个页面的列表结构：找出重复项容器，统计条目数、日期命中率
function analyze(html, pageUrl) {
  const $ = cheerio.load(html);
  const groups = new Map();

  $("a[href]").each((_, el) => {
    const a = $(el);
    const title = (a.attr("title") || a.text() || "").replace(/\s+/g, " ").trim();
    if (title.length < 8 || title.length > 120) return;
    const href = a.attr("href") || "";
    if (/^(#|javascript:|mailto:)/i.test(href)) return;
    const full = abs(href, pageUrl);
    if (!/^https?:/.test(full)) return;

    // 向上找 3 层，记录每层容器
    let node = a.parent();
    const chain = [];
    for (let d = 1; d <= 3 && node.length; d++) {
      const raw = node.get(0);
      const tag = raw && raw.tagName ? raw.tagName : "";
      if (!tag || /^(html|body)$/i.test(tag)) break;
      const cls = (node.attr("class") || "").split(/\s+/).filter(Boolean).slice(0, 2).join(".");
      chain.push({ tag, cls, sel: cls ? `${tag}.${cls}` : tag, depth: d });
      node = node.parent();
    }

    for (const c of chain) {
      if (!groups.has(c.sel)) groups.set(c.sel, { count: 0, samples: [], dated: 0, hrefs: [] });
      const g = groups.get(c.sel);
      g.count++;
      const box = a.parents().slice(0, c.depth).last();
      const txt = box.text().replace(/\s+/g, " ");
      if (DATE_RE.test(txt)) g.dated++;
      if (g.samples.length < 3) {
        g.samples.push({ title: title.slice(0, 52), href: full });
      }
      if (g.hrefs.length < 40) g.hrefs.push(full);
    }
  });

  const ranked = [...groups.entries()]
    .map(([sel, g]) => ({ sel, ...g, dateRate: g.count ? g.dated / g.count : 0 }))
    .filter((g) => g.count >= 5)                       // 至少 5 条才像列表
    .sort((a, b) => (b.dateRate - a.dateRate) || (b.count - a.count))
    .slice(0, 4);

  // 猜 detail 链接的共同前缀
  for (const g of ranked) {
    const hs = g.hrefs.slice(0, 12);
    let prefix = hs[0] || "";
    for (const h of hs) {
      while (prefix && !h.startsWith(prefix)) prefix = prefix.slice(0, -1);
    }
    g.sharedPrefix = prefix;
  }
  return ranked;
}

// 1) 抓首页，找候选栏目链接
const h = await get(home);
console.log(`########## HOME ${home}`);
console.log(`status=${h.status} bytes=${h.html.length} charset=${h.charset || "-"} final=${h.finalUrl}${h.err ? " err=" + h.err : ""}`);
if (!h.html) process.exit(0);

const KEY = /新闻|要闻|动态|资讯|时政|政策|公告|通知|评论|专题|观点|工作|发布|中心|child|news|press|protection|policy|topic/i;
const $h = cheerio.load(h.html);
const cands = [];
const seen = new Set();
$h("a[href]").each((_, el) => {
  const a = $h(el);
  const text = (a.text() || a.attr("title") || "").replace(/\s+/g, " ").trim();
  if (!text || text.length > 20) return;
  if (!KEY.test(text)) return;
  const full = abs(a.attr("href") || "", h.finalUrl);
  if (!/^https?:/.test(full)) return;
  if (seen.has(full)) return;
  seen.add(full);
  cands.push({ text, url: full });
});

// 若首页本身就有好结构，也报一下
const homeRanked = analyze(h.html, h.finalUrl);
if (homeRanked.length && homeRanked[0].dateRate >= 0.6) {
  console.log("--- 首页自身可用 ---");
  for (const g of homeRanked.slice(0, 2)) {
    console.log(`  ${g.sel} x${g.count} dateRate=${(g.dateRate * 100).toFixed(0)}% prefix=${g.sharedPrefix}`);
    for (const s of g.samples) console.log(`     ${s.href}\n       ${s.title}`);
  }
}

const picked = cands.slice(0, maxC);
console.log(`--- 候选栏目 ${cands.length} 个，取前 ${picked.length} ---`);

for (const c of picked) {
  const p = await get(c.url);
  const ranked = p.html ? analyze(p.html, p.finalUrl) : [];
  const best = ranked[0];
  const ok = best && best.dateRate >= 0.5 && best.count >= 6;
  console.log(`\n### ${c.text} -> ${c.url}`);
  console.log(`    status=${p.status} bytes=${p.html.length} charset=${p.charset || "-"}${p.err ? " err=" + p.err : ""} ${ok ? "★可用" : ""}`);
  for (const g of ranked.slice(0, 2)) {
    console.log(`    ${g.sel} x${g.count} dateRate=${(g.dateRate * 100).toFixed(0)}%`);
    for (const s of g.samples.slice(0, 2)) console.log(`       ${s.href} | ${s.title}`);
  }
}
