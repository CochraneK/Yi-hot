// 输出指定列表页里前 N 个条目的 outerHTML，用于确认 itemSelector/日期元素。
// 用法：node dump-items.mjs <url> <itemSelector> [n]
import * as cheerio from "cheerio";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const url = process.argv[2];
const sel = process.argv[3];
const n = Number(process.argv[4] || 2);

async function get(u) {
  const r = await fetch(u, { headers: { "user-agent": UA, accept: "text/html,*/*" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
  const buf = Buffer.from(await r.arrayBuffer());
  const head = buf.subarray(0, 4096).toString("latin1");
  let cs = /charset=["']?([\w-]+)/i.exec(r.headers.get("content-type") || "")?.[1] || /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] || "utf-8";
  cs = cs.toLowerCase();
  let html;
  try { html = new TextDecoder(cs === "gb2312" ? "gbk" : cs).decode(buf); } catch { html = buf.toString("utf8"); }
  return { status: r.status, finalUrl: r.url, html };
}

const p = await get(url);
const $ = cheerio.load(p.html);
const nodes = $(sel).toArray();
console.log(`url=${url} status=${p.status} selector=${sel} matched=${nodes.length}`);
for (const node of nodes.slice(0, n)) {
  const html = $.html(node).replace(/\s+/g, " ");
  console.log("\n--- item ---");
  console.log(html.length > 900 ? html.slice(0, 900) + " …" : html);
}
