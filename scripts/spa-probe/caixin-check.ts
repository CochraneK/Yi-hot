import { load } from "cheerio";
import fs from "node:fs";

const $ = load(fs.readFileSync(process.argv[2]!, "utf8"));

// 1) all article anchors (href contains /20xx- date path, excluding image hosts)
const all = $("a[href*='caixin.com/20']");
console.log("ALL_CAIXIN_DATE_ANCHORS:", all.length);

const byParent = new Map<string, number>();
const imgHrefs: string[] = [];
all.each((_i, el) => {
  const href = $(el).attr("href") ?? "";
  if (href.startsWith("https://img.caixin.com/")) {
    imgHrefs.push(href);
    return;
  }
  const p = $(el).parent();
  const key = `${p[0]?.tagName ?? "?"}[class="${(p.attr("class") ?? "").slice(0, 40)}"]`;
  byParent.set(key, (byParent.get(key) ?? 0) + 1);
});
console.log("IMG_HOST_ANCHORS:", imgHrefs.length);
for (const [k, n] of [...byParent].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
  console.log(`  ${n}x ${k}`);
}

// 2) what the li:has selector actually catches
const items = $("li:has(a[href*='caixin.com/20'])");
console.log("LI_HAS_ITEMS:", items.length);
let bad = 0;
items.each((_i, el) => {
  const a = $(el).find("a[href]").first();
  const href = a.attr("href") ?? "";
  if (!/^https:\/\/(www|china|international|finance|opinion|promote)\.caixin\.com\/20\d\d-/.test(href)) {
    bad++;
    if (bad <= 3) console.log("  BAD_ITEM_HREF:", href.slice(0, 80), "| title:", a.text().trim().slice(0, 30));
  }
});
console.log("BAD_ITEMS:", bad);

// 3) sample items (first 3) full HTML
items.slice(0, 3).each((_i, el) => console.log("ITEM:", $.html(el).slice(0, 200)));
