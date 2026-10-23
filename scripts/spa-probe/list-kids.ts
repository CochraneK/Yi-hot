import { load } from "cheerio";
import fs from "node:fs";

const $ = load(fs.readFileSync(process.argv[2]!, "utf8"));
const list = $("div.leftcontent__XcRTe").first();
if (!list.length) {
  console.log("NO_LEFTCONTENT");
  process.exit(0);
}
// direct children of the list container = item rows
const kids = list.children();
console.log("LIST_DIRECT_CHILDREN:", kids.length);
const classCounts = new Map<string, number>();
kids.each((_i, e) => {
  const cls = $(e).attr("class") ?? "(none)";
  classCounts.set(cls, (classCounts.get(cls) ?? 0) + 1);
});
for (const [cls, n] of [...classCounts].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
  console.log(`  ${n}x class="${cls.slice(0, 70)}"`);
}
// for each direct child, count title links inside
let withTitle = 0;
let withCommTag = 0;
kids.each((_i, e) => {
  const k = $(e);
  if (k.find("a[href*='newsDetail_forward_']").length) withTitle++;
  if (k.find("a[href*='commTag']").length) withCommTag++;
});
console.log("CHILDREN_WITH_TITLE_LINK:", withTitle, "WITH_COMMTAG:", withCommTag);
// print the HTML of a child that has NO ant-card inside (a text-only item?)
const textOnly = kids.filter((_i, e) => $(e).find("div.ant-card").length === 0 && $(e).find("a[href*='newsDetail_forward_']").length > 0).first();
if (textOnly.length) {
  console.log("=== NON-CARD ITEM HTML ===");
  console.log($.html(textOnly).slice(0, 700));
} else {
  console.log("ALL_TITLE_ITEMS_ARE_ANT_CARDS");
}
