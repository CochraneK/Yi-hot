import * as cheerio from "cheerio";
import { readFileSync } from "node:fs";

const file = process.argv[2] || "/tmp/zxdt.html";
const sel = process.argv[3] || "ul.article-list li";
const html = readFileSync(file, "utf8");
const $ = cheerio.load(html);

const first = $(sel).first();
console.log("=== outerHTML of first item ===");
console.log(first.html());
console.log("=== child tags with text ===");
first.find("*").each((_i, e) => {
  const t = $(e);
  const txt = t.text().replace(/\s+/g, " ").trim();
  if (txt) console.log(`${e.tagName} class="${t.attr("class") || ""}" text="${txt.slice(0, 50)}"`);
});
