#!/usr/bin/env node
// 只读批量探测：给一批站点 URL，找出「最像新闻列表」的容器与日期覆盖率。
// 用于补省级垂直厅局（残联/妇联/团委）时先判可达性与结构，再决定是否建源。
// 用法：node tools/probe-province-vertical.mjs https://a.example/ https://b.example/
//   或：node tools/probe-province-vertical.mjs --file sites.txt   （每行一个 URL）
// 只打印结果，不写库、不建源、不改任何配置。
import { load } from "cheerio";
import { readFileSync } from "node:fs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const args = process.argv.slice(2);
const list = args[0] === "--file" ? readFileSync(args[1], "utf8").split("\n").map((s) => s.trim()).filter(Boolean) : args;

function decode(buf) {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  return (utf8.match(/\uFFFD/g) ?? []).length > 20 ? new TextDecoder("gb18030").decode(buf) : utf8;
}

for (const url of list) {
  try {
    const res = await fetch(url, { redirect: "follow", headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(18000) });
    const html = decode(new Uint8Array(await res.arrayBuffer()).slice(0, 600 * 1024));
    const $ = load(html);
    const groups = new Map();
    $("li,tr").each((_i, el) => {
      const $el = $(el);
      const links = $el.find("a[href]");
      if (links.length !== 1) return;
      const href = links.attr("href") || "";
      if (!/\.(s?html?|jhtml)$|\/\d{6}|content|post_|art/.test(href)) return;
      const title = (links.attr("title") || links.text() || "").replace(/\s+/g, " ").trim();
      if (title.length < 8) return;
      const parent = $el.parent().get(0);
      if (!parent) return;
      const key = `${parent.tagName}.${($(parent).attr("class") || "").split(/\s+/)[0] || ""}`;
      if (!groups.has(key)) groups.set(key, []);
      const date = /(20\d{2})[-/年.](\d{1,2})[-/月.](\d{1,2})/.exec($el.text());
      groups.get(key).push({ title, date: date ? date[0] : "" });
    });
    const best = [...groups.entries()].map(([k, l]) => ({ k, n: l.length, dated: l.filter((x) => x.date).length, l })).sort((a, b) => b.n - a.n)[0];
    console.log(`\n${url}  HTTP ${res.status}  html=${html.length}  ${best ? `${best.k} n=${best.n} dated=${best.dated}` : "NO_LIST"}`);
    best?.l.slice(0, 3).forEach((x) => console.log(`   - ${x.date || "(无日期)"} | ${x.title.slice(0, 48)}`));
  } catch (error) {
    console.log(`\n${url}  ERR ${String(error).slice(0, 80)}`);
  }
}
