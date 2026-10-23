// 打印列表首条的完整 HTML
import { load } from "cheerio";
import fs from "node:fs";

const $ = load(fs.readFileSync(process.argv[2]!, "utf8"));
const item = $(process.argv[3]!).first();
console.log($.html(item).slice(0, 1200));
