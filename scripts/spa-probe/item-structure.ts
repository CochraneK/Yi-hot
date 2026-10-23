// 打印 ndcpa 列表条目的容器结构：从第一个文章锚点向上找共同父级
import { load } from "cheerio";
import fs from "node:fs";

const $ = load(fs.readFileSync(process.argv[2]!, "utf8"));
const pattern = process.argv[4] ?? "content/content_";
const first = $(`a[href*='${pattern}']`).first();
if (!first.length) {
  console.log("NO_CONTENT_ANCHOR");
  process.exit(0);
}
let el = first;
for (let depth = 0; depth < 6; depth++) {
  const parent = el.parent();
  if (!parent.length) break;
  const sameLevel = parent.children(`a[href*='${pattern}']`).length;
  const tag = parent[0]!.tagName;
  const cls = parent.attr("class") ?? "";
  console.log(`depth=${depth} <${tag} class="${cls}"> direct-content-children=${sameLevel}`);
  if (sameLevel >= 3) {
    console.log("=== ITEM OUTER HTML ===");
    console.log($.html(el).slice(0, 600));
    break;
  }
  el = parent;
}
