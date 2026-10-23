import { load } from "cheerio";
import fs from "node:fs";

const $ = load(fs.readFileSync(process.argv[2]!, "utf8"));
const pattern = process.argv[3]!; // e.g. "/en/news/"

// anchors pointing at real articles (long-ish text, matching the pattern)
const anchors = $(`a[href*='${pattern}']`).filter((_i, el) => {
  const t = $(el).text().trim();
  return t.length > 10;
});
console.log("TITLE_ANCHORS:", anchors.length);
if (!anchors.length) {
  console.log("NO_ANCHOR");
  process.exit(0);
}
const first = anchors.first();
console.log("FIRST_TITLE:", first.text().trim().slice(0, 60));
console.log("FIRST_HREF:", first.attr("href"));

let el = first;
for (let depth = 0; depth < 8; depth++) {
  const parent = el.parent();
  if (!parent.length) break;
  const tag = parent[0]!.tagName;
  const cls = (parent.attr("class") ?? "").slice(0, 60);
  const kids = parent.children().length;
  const articleKids = parent.children().filter((_i, e) => $(e).find(`a[href*='${pattern}']`).length > 0).length;
  console.log(`up d=${depth} <${tag} class="${cls}"> children=${kids} kidsWithArticle=${articleKids}`);
  if (articleKids >= 3) {
    console.log("=== ITEM OUTER HTML ===");
    console.log($.html(el.closest("li, div, article").first() ?? el.parent()).slice(0, 900));
    break;
  }
  el = parent;
}
