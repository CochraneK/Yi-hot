// Render a SPA URL in headless chromium and dump the links it actually mounts, so we can derive
// the listing URL + item/title selectors for a web_list source. Run inside the worker container:
//   node /app/packages/backend/src/render-probe.ts <url> [waitSelector]
import * as cheerio from "cheerio";
import { renderBrowser } from "./lib/browser-render.ts";

const url = process.argv[2];
const wait = process.argv[3];
if (!url) {
  console.error("usage: node render-probe.ts <url> [waitSelector]");
  process.exit(1);
}

const t0 = Date.now();
const page = await renderBrowser(url, {
  timeoutMs: 45_000,
  waitForSelector: wait || undefined,
  acceptLanguage: "zh-CN,zh;q=0.9,en;q=0.8",
});
const ms = Date.now() - t0;
const $ = cheerio.load(page.html);
const seen = new Set<string>();
const rows: Array<{ href: string; text: string }> = [];
for (const a of $("a[href]").toArray()) {
  const href = $(a).attr("href") || "";
  let abs: string;
  try {
    abs = new URL(href, page.url).toString();
  } catch {
    continue;
  }
  if (abs.startsWith("javascript:") || abs.startsWith("#")) continue;
  const text = $(a).text().replace(/\s+/g, " ").trim();
  if (seen.has(abs)) continue;
  seen.add(abs);
  rows.push({ href: abs, text });
}

import { writeFileSync } from "node:fs";
const outPath = process.env.RENDER_SAVE || "/tmp/rendered.html";
writeFileSync(outPath, page.html);
console.log(`URL: ${url}`);
console.log(`FINAL: ${page.url}`);
console.log(`RENDER_MS: ${ms}`);
console.log(`HTML_BYTES: ${Buffer.byteLength(page.html)}`);
console.log(`SAVED: ${outPath}`);
console.log(`LINK_COUNT: ${rows.length}`);
console.log("--- links (first 120) ---");
for (const r of rows.slice(0, 120)) {
  console.log(`${r.href}\t${r.text.slice(0, 80)}`);
}
