import { load } from "cheerio";
import fs from "node:fs";

const $ = load(fs.readFileSync(process.argv[2]!, "utf8"));

// 1) comment-count links (commTag) reveal the per-item card structure
const commentLinks = $("a[href*='commTag']");
console.log("COMMENT_LINKS:", commentLinks.length);
if (commentLinks.length) {
  let el = commentLinks.first();
  for (let d = 0; d < 6; d++) {
    const p = el.parent();
    if (!p.length) break;
    const items = p.children("div, li, article").length;
    const tag = p[0]!.tagName;
    const cls = (p.attr("class") ?? "").slice(0, 50);
    console.log(`up d=${d} <${tag} class="${cls}"> childBlocks=${items} commTagKids=${p.find("a[href*='commTag']").length}`);
    if (items >= 3 && p.find("a[href*='commTag']").length >= 3) {
      console.log("=== ITEM HTML ===");
      console.log($.html(p.children("div, li, article").first()).slice(0, 800));
      break;
    }
    el = p;
  }
}

// 2) any date-ish text node?
const dateSpans = $("span, div, p, time").filter((_i, e) => {
  const t = $(e).text().trim();
  return /^\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/.test(t) && t.length < 30;
});
console.log("DATEISH_NODES:", dateSpans.length);
dateSpans.slice(0, 3).each((_i, e) => {
  console.log("  date sample:", $(e).text().trim().slice(0, 25), "| parent:", $(e).parent()[0]!.tagName, $(e).parent().attr("class"));
});

// 3) containers holding the most title links (the main list)
const byCount: Array<{ sel: string; n: number }> = [];
$("div, ul, section").each((_i, e) => {
  const n = $(e).find("a[href*='newsDetail_forward_']").length;
  if (n >= 5) {
    const tag = e.tagName;
    const cls = $(e).attr("class") ?? "";
    byCount.push({ sel: `${tag}.${cls.split(/\s+/).join(".")}`, n });
  }
});
byCount.sort((a, b) => b.n - a.n);
console.log("TOP_CONTAINERS:");
for (const c of byCount.slice(0, 6)) console.log(`  ${c.n}x ${c.sel.slice(0, 90)}`);
