#!/usr/bin/env node
// 详情页找日期：列表不给日期时，日期通常在内页的 <span class="time"> / 来源行里。
// 用法：node tools/probe-detail-date.mjs <列表页URL> [条目数]
// 打印前几条的详情页地址与「日期可能所在元素」的候选。
import { load } from "cheerio";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const [listUrl, n = "3"] = process.argv.slice(2);

function decode(buf) {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  return (utf8.match(/\uFFFD/g) ?? []).length > 20 ? new TextDecoder("gb18030").decode(buf) : utf8;
}
async function get(url) {
  const res = await fetch(url, { redirect: "follow", headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(20000) });
  return { status: res.status, url: res.url, html: decode(new Uint8Array(await res.arrayBuffer()).slice(0, 800 * 1024)) };
}

const list = await get(listUrl);
const $ = load(list.html);
const links = [];
$("a[href]").each((_i, el) => {
  const href = $(el).attr("href") || "";
  const text = ($(el).attr("title") || $(el).text() || "").replace(/\s+/g, " ").trim();
  if (text.length < 8 || /^(javascript|#)/.test(href)) return;
  let abs;
  try {
    abs = new URL(href, list.url).href;
  } catch {
    return;
  }
  if (new URL(abs).origin !== new URL(list.url).origin) return;
  if (!links.some((x) => x.abs === abs)) links.push({ text, abs });
});
console.log(`${listUrl} → ${links.length} 条候选，取前 ${n} 条详情页`);

for (const link of links.slice(0, Number(n))) {
  try {
    const page = await get(link.abs);
    const $$ = load(page.html);
    console.log(`\n-- ${link.abs}`);
    console.log(`   ${page.status} ${page.html.length}B  ${link.text.slice(0, 44)}`);
    // 找出「文本里含完整日期」的最小元素，取它的 tag.class 作为 publishedAtSelector 候选
    const hits = [];
    $$("*").each((_i, el) => {
      const $el = $$(el);
      if ($el.children().length) return;
      const t = ($el.text() || "").replace(/\s+/g, " ").trim();
      if (!/20\d{2}[-/年.]\d{1,2}[-/月.]\d{1,2}/.test(t) || t.length > 40) return;
      const cls = ($el.attr("class") || "").trim().split(/\s+/).filter(Boolean).join(".");
      const key = `${el.tagName}${cls ? "." + cls : ""}`;
      if (!hits.some((h) => h.key === key)) hits.push({ key, text: t });
    });
    hits.slice(0, 6).forEach((h) => console.log(`   [${h.key}]  ${h.text}`));
    if (!hits.length) console.log("   （内页也没有可解析的日期）");
  } catch (e) {
    console.log(`\n-- ${link.abs}  ERR ${String(e).slice(0, 60)}`);
  }
}
