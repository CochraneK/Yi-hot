// 统计选择器命中的条目数 vs 含文章链接的条目数
import { load } from "cheerio";
import fs from "node:fs";

const $ = load(fs.readFileSync(process.argv[2]!, "utf8"));
const sel = process.argv[3]!;
const items = $(sel);
console.log(`SELECTOR ${sel} → ${items.length} items`);
let withLink = 0;
const samples: string[] = [];
items.each((_i, el) => {
  const a = $(el).find("a[href]").first();
  const href = a.attr("href") ?? "";
  if (/content_/.test(href)) {
    withLink++;
    if (samples.length < 5) samples.push(`${href} | ${a.text().trim().slice(0, 40)}`);
  }
});
console.log(`WITH_CONTENT_LINK: ${withLink}`);
for (const s of samples) console.log("  ", s);
