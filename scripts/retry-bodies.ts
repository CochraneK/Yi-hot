// 临时：对全部 unconfirmed 文章重跑正文抽取（allowJina 由环境变量控制，默认关，避免触发代理/Jina）。
// 用法：JINA=0 node scripts/retry-bodies.ts
import { sql } from "@aihot/backend/db";
import { extractArticleBody } from "@aihot/backend/content/extract";

const allowJina = process.env.JINA === "1";
const rows = await sql<{ id: string; url: string; host: string }[]>`
  SELECT a.id, a.url, split_part(regexp_replace(a.url, '^https?://', ''), '/', 1) AS host
  FROM articles a WHERE a.body_status = 'unconfirmed' ORDER BY host`;

let ok = 0, unconfirmed = 0, skipped = 0;
const recovered: string[] = [];
for (const r of rows) {
  // 政府站会限流，连发容易整批失败；每条之间留间隔。
  await new Promise((res) => setTimeout(res, 1200));
  const state = await extractArticleBody(r.id, allowJina);
  if (state === "ok") {
    ok++;
    recovered.push(r.host);
    const [b] = await sql<{ body_text: string }[]>`SELECT body_text FROM articles WHERE id = ${r.id}`;
    const head = (b?.body_text ?? "").replace(/\s+/g, " ").trim().slice(0, 70);
    console.log(`OK    [${r.host}] ${head}`);
  } else if (state === "unconfirmed") {
    unconfirmed++;
  } else skipped++;
}
console.log(`\n== allowJina=${allowJina} total=${rows.length} ok=${ok} unconfirmed=${unconfirmed} skipped=${skipped}`);
