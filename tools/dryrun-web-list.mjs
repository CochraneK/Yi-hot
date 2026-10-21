// 只读 dry-run：按 sources.json 里的配置解析列表页，打印候选条数与样例，不写库、不采集。
// 用法：node dryrun-web-list.mjs <sourceId> [sourceId...]
import * as fs from "node:fs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const { fromHtml } = await import("@aihot/backend/sources/web-list");

const reg = JSON.parse(fs.readFileSync("/app/industry/sources.json", "utf8"));
const ids = process.argv.slice(2);

async function get(u) {
  const r = await fetch(u, { headers: { "user-agent": UA, accept: "text/html,*/*" }, redirect: "follow", signal: AbortSignal.timeout(25000) });
  const buf = Buffer.from(await r.arrayBuffer());
  const head = buf.subarray(0, 4096).toString("latin1");
  let cs = /charset=["']?([\w-]+)/i.exec(r.headers.get("content-type") || "")?.[1] || /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] || "utf-8";
  cs = cs.toLowerCase();
  let html;
  try { html = new TextDecoder(cs === "gb2312" ? "gbk" : cs).decode(buf); } catch { html = buf.toString("utf8"); }
  return { status: r.status, finalUrl: r.url, html };
}

for (const id of ids) {
  const s = reg.sources.find((x) => x.id === id);
  if (!s) { console.log(`✗ ${id} 不在 sources.json`); continue; }
  try {
    const p = await get(s.config.url);
    const cands = fromHtml(p.html, p.finalUrl, { id: s.id, config: s.config });
    const withDate = cands.filter((c) => c.publishedAt).length;
    const noDate = cands.filter((c) => !c.publishedAt);
    console.log(`\n### ${id}  ${s.name}`);
    console.log(`    status=${p.status} 候选=${cands.length} 有日期=${withDate} 无日期=${noDate.length}`);
    for (const c of cands.slice(0, 4)) {
      console.log(`    ${c.publishedAt ? c.publishedAt.toISOString().slice(0, 10) : "----------"} | ${c.title.slice(0, 40)}`);
      console.log(`               ${c.url.slice(0, 100)}`);
    }
    if (noDate.length) {
      console.log(`    无日期样例: ${noDate.slice(0, 2).map((c) => c.title.slice(0, 30)).join(" / ")}`);
    }
    // 主题词过滤后的入队数（模拟 requireMarkers 命中）
    const markers = s.config.ingestNoiseFilter?.requireMarkers ?? [];
    if (markers.length) {
      const hit = cands.filter((c) => markers.some((m) => c.title.includes(m))).length;
      console.log(`    主题词命中 ${hit}/${cands.length}（入库候选）`);
    }
  } catch (e) {
    console.log(`\n### ${id} 解析失败: ${String(e && e.message || e).slice(0, 120)}`);
  }
}
