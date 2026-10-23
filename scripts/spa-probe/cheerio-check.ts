// 用解析器同款路径验证：cheerio 加载渲染后的 HTML，看能找到哪些文章锚点
import { load } from "cheerio";
import fs from "node:fs";

const html = fs.readFileSync(process.argv[2]!, "utf8");
const $ = load(html);
const anchors = $("a[href]").toArray();
console.log("TOTAL_ANCHORS:", anchors.length);
const contentLinks: string[] = [];
for (const a of anchors) {
  const href = $(a).attr("href") ?? "";
  if (href.includes("content/content_")) contentLinks.push(`${href} | ${$(a).text().trim().slice(0, 50)}`);
}
console.log("CONTENT_ANCHORS:", contentLinks.length);
for (const l of contentLinks.slice(0, 25)) console.log("  ", l);
// 看看带日期的元素长什么样
console.log("DATE_TEXT_NODES:");
$("*")
  .contents()
  .filter((_i, n) => n.type === "text" && /\d{4}-\d{2}-\d{2}/.test($(n).text().trim()))
  .each((_i, n) => {
    const t = $(n).text().trim();
    if (t.length < 30) console.log("  ", JSON.stringify(t), "parent:", n.parent?.tagName, $(n).parent().attr("class") ?? "");
  });
