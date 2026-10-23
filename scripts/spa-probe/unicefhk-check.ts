// 探针：用与 web-list 相同的 cheerio 解析逻辑，预览 UNICEF 香港委员会新闻列表
// 只读本地 HTML，不写数据库、不触发采集。
import { load } from "cheerio";
import fs from "node:fs";

const file = process.argv[2]!;
const itemSelector = process.argv[3] ?? "div.item";
const $ = load(fs.readFileSync(file, "utf8"));

const items = $(itemSelector);
console.log(`选择器 ${itemSelector} 命中 ${items.length} 条\n`);

items.slice(0, 14).each((i, el) => {
  const node = $(el);
  const a = node.find("a[href]").first();
  const href = a.attr("href") ?? "";
  const text = node.text().replace(/\s+/g, " ").trim();
  // 日期在锚文本末尾，形如 dd/mm/yyyy
  const dm = text.match(/(\d{2})\/(\d{2})\/(\d{4})\s*$/);
  const title = text.replace(/\s*\d{2}\/\d{2}\/\d{4}\s*$/, "").trim();
  console.log(`${i + 1}. ${title.slice(0, 70)}`);
  console.log(`   日期: ${dm ? `20${dm[3]}-${dm[2]}-${dm[1]}（dd/mm/yyyy）` : "❌ 未取到"}`);
  console.log(`   链接: ${href.slice(0, 80)}`);
});
