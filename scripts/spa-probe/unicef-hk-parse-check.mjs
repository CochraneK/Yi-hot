// 只读探针：用真实的 web-list 解析逻辑跑一遍 UNICEF 中国香港列表页，确认选择器与
// dd/mm/yyyy 解析（publishedAtDayFirst）都正确。不写库、不发布。
import { readFileSync } from "node:fs";
import * as cheerio from "cheerio";

const html = readFileSync(process.argv[2], "utf8");
const $ = cheerio.load(html);

const BASE = "https://www.unicef.org.hk";
const ITEM = "div.item";
const LINK = "a[href*='/zh-hant/news/latest_news/']";
const TITLE = "span.name";
const DATE = "span.date";

// parseLooseDate 的 dd/mm/yyyy 分支（与源码实现一致，此处独立复算以便离线验证）
function atOffset(y, mo, d, h, mi, s, off) {
  const p = (n) => String(n).padStart(2, "0");
  return new Date(Date.parse(`${y}-${p(mo)}-${p(d)}T${p(h)}:${p(mi)}:${p(s)}${off}`));
}
function parseDayFirst(v, off) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(v.trim());
  if (!m) return null;
  return atOffset(m[3], m[2], m[1], m[4] ?? "00", m[5] ?? "00", m[6] ?? "00", off);
}

const seen = new Set();
let n = 0, noDate = 0;
for (const node of $(ITEM).toArray()) {
  const el = $(node);
  const linkEl = el.is(LINK) ? el : el.find(LINK).first();
  const href = linkEl.attr("href");
  if (!href) continue;
  const url = new URL(href, BASE).toString().split("?")[0];
  if (seen.has(url)) continue;
  seen.add(url);
  const title = el.find(TITLE).first().text().replace(/\s+/g, " ").trim();
  const rawDate = el.find(DATE).first().text().trim();
  const at = parseDayFirst(rawDate, "+08:00");
  if (!at) noDate++;
  n++;
  console.log(
    `${at ? at.toISOString().slice(0, 10) : "无日期"}\t${rawDate || "-"}\t${title.slice(0, 40)}\t${url.replace(BASE, "")}`
  );
}
console.log(`\n条目 ${n} 条，其中无日期 ${noDate} 条`);
