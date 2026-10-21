// 精细解析单个站的列表结构：找出重复的文章项容器与标题/日期选择器。
// 用法：node probe-one.mjs <url>
import * as cheerio from "cheerio";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const url = process.argv[2];
if (!url) { console.error("need url"); process.exit(1); }

const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,*/*" }, redirect: "follow" });
const html = await res.text();
console.log("STATUS", res.status, "BYTES", html.length, "FINAL", res.url);
const $ = cheerio.load(html);

const groups = new Map();
$("a[href]").each((_, el) => {
  const a = $(el);
  const title = (a.attr("title") || a.text() || "").replace(/\s+/g, " ").trim();
  if (title.length < 8) return;
  const href = a.attr("href") || "";
  if (/^(#|javascript:)/i.test(href)) return;
  let node = a.parent();
  for (let depth = 1; depth <= 3 && node.length; depth++) {
    const raw = node.get(0);
    const tag = raw && raw.tagName ? raw.tagName : "";
    const cls = (node.attr("class") || "").split(/\s+/).filter(Boolean).slice(0, 2).join(".");
    const sel = cls ? tag + "." + cls : tag;
    const key = sel + "|d" + depth;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ title: title.slice(0, 44), href, depth });
    node = node.parent();
  }
});

const ranked = [...groups.entries()]
  .filter(([, v]) => v.length >= 4)
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 5);

for (const [key, items] of ranked) {
  console.log("\n=== " + key + "  x" + items.length);
  for (const it of items.slice(0, 3)) console.log("   ", it.href, "|", it.title);
  const link = $('a[href="' + items[0].href + '"]').first();
  const box = link.parent();
  const dates = [];
  for (const sel of [".date", ".time", "span", "em", "i", "small"]) {
    const t = box.find(sel).map((_, e) => $(e).text().replace(/\s+/g, " ").trim()).get()
      .filter((x) => /\d{4}[-.\/年]\d{1,2}/.test(x));
    if (t.length) dates.push(sel + "=" + t[0]);
  }
  if (dates.length) console.log("    date candidates:", dates.join(" ; "));
}
