// 哪条搜索词在花钱、又带来多少入选。
//
//   node --env-file-if-exists=/app/.env scripts/search-query-report.ts [days] [--min-req=2]
//
// 两条口径要分开看，不能混：
//   请求与搜索费 —— 来自回执 `receipts.request->>'query'`，**历史上就有**，可以回溯；
//   文章与入选   —— 来自 `article_discoveries.query`，2026-10-24 才上线，之前的记 unknown。
// 同一篇文章被多条 query 命中时只归给**首次带来它的那条**（article_discoveries 唯一键保证），
// 所以「入选数」列逐条相加等于总数，不会把一篇文章的付费算两遍。
import { closeDb, sql } from "@aihot/backend/db";

const days = Math.max(1, Math.min(90, Number(process.argv[2] ?? "7")));
const minReq = Number(process.argv.find((a) => a.startsWith("--min-req="))?.split("=")[1] ?? 1);
const pad = (v: string | number, n: number, right = false) => {
  const s = String(v);
  const w = [...s].length >= n ? 0 : n - [...s].length;
  return right ? " ".repeat(w) + s : s + " ".repeat(w);
};
const yuan = (v: unknown) => Number(v ?? 0).toFixed(4);

// 请求与搜索费（可回溯）。` after:YYYY-MM-DD` 是采集时按 lookback 追加的滚动窗口，
// 归一掉它，否则同一条词每天会分裂成一行。
const spend = await sql<{ source_id: string; q: string; req: number; cost: number }[]>`
  SELECT r.subject AS source_id,
         regexp_replace(coalesce(r.request->>'query', '(unknown)'), '\\s+after:\\d{4}-\\d{2}-\\d{2}$', '') AS q,
         count(DISTINCT r.id)::int AS req,
         round(coalesce(sum(a.cost), 0), 4)::float8 AS cost
  FROM receipts r LEFT JOIN receipt_attempts a ON a.receipt_id = r.id
  WHERE r.purpose = 'web_search' AND r.created_at > now() - (${days} || ' days')::interval
  GROUP BY 1, 2`;

// 归因（只对上线后采集的稿有效）。
const yielded = await sql<{ source_id: string; q: string; arts: number; sel: number; analysis: number }[]>`
  WITH d AS (
    SELECT source_id, query AS q, article_id FROM article_discoveries
    WHERE query IS NOT NULL AND discovered_at > now() - (${days} || ' days')::interval
  )
  SELECT d.source_id, d.q,
         count(DISTINCT d.article_id)::int AS arts,
         count(DISTINCT d.article_id) FILTER (WHERE p.selected)::int AS sel,
         round(coalesce(sum(r.cost), 0), 4)::float8 AS analysis
  FROM d
  LEFT JOIN publications p ON p.article_id = d.article_id
  LEFT JOIN articles ar ON ar.id = d.article_id
  LEFT JOIN receipts r ON r.subject = 'article:' || ar.id || '@' || ar.revision AND r.service = 'llm'
  GROUP BY 1, 2`;

const [unknown] = await sql<{ arts: number; sel: number }[]>`
  SELECT count(*)::int AS arts, count(*) FILTER (WHERE p.selected)::int AS sel
  FROM article_discoveries d JOIN articles ar ON ar.id = d.article_id
  LEFT JOIN publications p ON p.article_id = d.article_id
  WHERE d.query IS NULL AND d.discovered_at > now() - (${days} || ' days')::interval AND ar.source_id IN
    (SELECT id FROM sources WHERE kind = 'search')`;

const rows = new Map<string, { source: string; q: string; req: number; cost: number; arts: number; sel: number; analysis: number }>();
for (const r of spend) {
  rows.set(`${r.source_id}\u0000${r.q}`, { source: r.source_id, q: r.q, req: r.req, cost: Number(r.cost), arts: 0, sel: 0, analysis: 0 });
}
for (const r of yielded) {
  const key = `${r.source_id}\u0000${r.q}`;
  const row = rows.get(key) ?? { source: r.source_id, q: r.q, req: 0, cost: 0, arts: 0, sel: 0, analysis: 0 };
  row.arts = r.arts;
  row.sel = r.sel;
  row.analysis = Number(r.analysis);
  rows.set(key, row);
}

const list = [...rows.values()]
  .filter((r) => r.req >= minReq)
  .map((r) => ({ ...r, total: r.cost + r.analysis, perSel: r.sel > 0 ? (r.cost + r.analysis) / r.sel : null }))
  .sort((a, b) => b.total - a.total);

const sum = list.reduce((t, r) => ({ req: t.req + r.req, cost: t.cost + r.cost, arts: t.arts + r.arts, sel: t.sel + r.sel, analysis: t.analysis + r.analysis }), { req: 0, cost: 0, arts: 0, sel: 0, analysis: 0 });

console.log(`近 ${days} 天搜索词账本（${list.length} 条词）`);
console.log(`合计：请求 ${sum.req} 次 ¥${yuan(sum.cost)} · 带来 ${sum.arts} 篇/${sum.sel} 入选 · 这些稿的分析费 ¥${yuan(sum.analysis)} · 单篇入选综合成本 ¥${yuan(sum.sel ? (sum.cost + sum.analysis) / sum.sel : 0)}\n`);

console.log(`${pad("源", 26)}${pad("查询词", 34)}${pad("请求", 6, true)}${pad("搜索费", 10, true)}${pad("新稿", 6, true)}${pad("入选", 6, true)}${pad("分析费", 10, true)}${pad("元/入选", 10, true)}`);
for (const r of list.slice(0, 40)) {
  console.log(
    `${pad(r.source.slice(0, 25), 26)}${pad(r.q.slice(0, 33), 34)}${pad(r.req, 6, true)}${pad(`¥${yuan(r.cost)}`, 10, true)}` +
    `${pad(r.arts, 6, true)}${pad(r.sel, 6, true)}${pad(`¥${yuan(r.analysis)}`, 10, true)}${pad(r.perSel === null ? "—" : `¥${yuan(r.perSel)}`, 10, true)}`,
  );
}

if (unknown && unknown.arts > 0) {
  console.log(`\n未归因（query 字段上线前采集的搜索稿）：${unknown.arts} 篇 / ${unknown.sel} 入选 —— 标 unknown，不参与上表排序。`);
}
console.log("\n判据：单篇入选综合成本明显高于全站均值（当前约 ¥0.02–0.03）的词，是下一步该减或改写的候选。");

await closeDb();
