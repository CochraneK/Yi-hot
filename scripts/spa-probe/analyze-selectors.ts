// Inspect a saved rendered HTML to derive web_list item/title selectors for article links.
import * as cheerio from "cheerio";
import { readFileSync } from "node:fs";

const file = process.argv[2] || "/tmp/cdrf.html";
const html = readFileSync(file, "utf8");
const $ = cheerio.load(html);

// Article links on cdrf: /<section>/<digits>.htm  (nav are /index.htm or bare /<name>.htm)
const ART = /\/[a-z0-9_-]+\/\d+\.htm(?:#.*)?$/i;

function chain(el: cheerio.Element): string {
  const parts: string[] = [];
  let cur: cheerio.Element | null = el;
  let depth = 0;
  while (cur && depth < 5) {
    const c = $(cur);
    const cls = (c.attr("class") || "").replace(/\s+/g, ".").trim();
    parts.push(`${cur.tagName}${cls ? "." + cls : ""}`);
    cur = cur.parent as cheerio.Element | null;
    depth++;
  }
  return parts.join(" > ");
}

const articles: Array<{ href: string; text: string; chain: string }> = [];
$("a[href]").each((_i, a) => {
  const href = $(a).attr("href") || "";
  if (!ART.test(href)) return;
  articles.push({ href, text: $(a).text().replace(/\s+/g, " ").trim().slice(0, 60), chain: chain(a) });
});

console.log(`ARTICLE_COUNT: ${articles.length}`);
console.log("--- distinct ancestor chains (depth<=4) ---");
const chains = new Map<string, number>();
for (const a of articles) {
  // trim chain to a plausible container (first 4 levels)
  const key = a.chain.split(" > ").slice(0, 4).join(" > ");
  chains.set(key, (chains.get(key) || 0) + 1);
}
for (const [k, n] of [...chains.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10)) {
  console.log(`${n}\t${k}`);
}
console.log("--- sample articles ---");
for (const a of articles.slice(0, 12)) console.log(`${a.href}\t${a.text}`);
console.log("--- possible list containers (class has list/news/info/main/content) ---");
const cand = new Map<string, number>();
$("[class]").each((_i, el) => {
  const cls = ($(el).attr("class") || "").replace(/\s+/g, ".").trim();
  if (/(list|news|info|main|content|item|article|ul)/i.test(cls)) {
    const n = $(el).find("a[href]").filter((_j, a) => ART.test($(a).attr("href") || "")).length;
    if (n > 0) cand.set(`${el.tagName}.${cls}`, n);
  }
});
for (const [k, n] of [...cand.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12)) {
  console.log(`${n}\t${k}`);
}
