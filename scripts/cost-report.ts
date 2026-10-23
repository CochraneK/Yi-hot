// 看账：钱花在哪一天、哪一步、是今天的新闻还是补历史。
//
// 站点上唯一真花钱的是模型调用与网页搜索，而"花了多少"有两种读法：
//   - 按天：`receipt_attempts.started_at`，北京时间自然日；
//   - 按稿：`receipts.subject` 形如 `article:<id>@<rev>`，能 join 回 `articles.backfill`。
// 只按天看会觉得"每天都很贵"，按稿看才发现绝大部分是加新源时的首采回填——一次性成本。
// 所以下面两张表要一起看：先看日总额，再看总额里 live / backfill 各占多少。
//
// node --env-file-if-exists=/app/.env scripts/cost-report.ts [days]
import { closeDb, sql } from "@aihot/backend/db";

const days = Math.max(1, Math.min(90, Number(process.argv[2] ?? "7")));

const pad = (v: string | number, n: number, right = false) => {
  const s = String(v);
  const width = [...s].length >= n ? 0 : n - [...s].length;
  return right ? " ".repeat(width) + s : s + " ".repeat(width);
};
const yuan = (v: unknown) => Number(v ?? 0).toFixed(2);

/** 按天 × 用途。`cost` 是调用当时写下的钱（providers/pricing.ts 同一份实现），用途记在回执上。 */
const byPurpose = await sql<{ day: string; purpose: string; n: number; cost: number }[]>`
  SELECT to_char(a.started_at AT TIME ZONE 'Asia/Shanghai', 'MM-DD') AS day,
         coalesce(r.purpose, '?') AS purpose,
         count(*)::int AS n,
         round(sum(a.cost), 4)::float8 AS cost
  FROM receipt_attempts a JOIN receipts r ON r.id = a.receipt_id
  WHERE a.started_at > now() - (${days} || ' days')::interval
  GROUP BY 1, 2
  ORDER BY 1 DESC, 4 DESC NULLS LAST`;

/** 按天拆：今天的新闻 vs 补历史。搜索服务没有 subject，单列。 */
const byKind = await sql<{ day: string; live: number; live_cost: number; hist: number; hist_cost: number; other: number; other_cost: number }[]>`
  SELECT day,
         coalesce(sum(n) FILTER (WHERE service = 'llm' AND NOT hist), 0)::int AS live,
         round(coalesce(sum(cost) FILTER (WHERE service = 'llm' AND NOT hist), 0), 3)::float8 AS live_cost,
         coalesce(sum(n) FILTER (WHERE service = 'llm' AND hist), 0)::int AS hist,
         round(coalesce(sum(cost) FILTER (WHERE service = 'llm' AND hist), 0), 3)::float8 AS hist_cost,
         coalesce(sum(n) FILTER (WHERE service <> 'llm'), 0)::int AS other,
         round(coalesce(sum(cost) FILTER (WHERE service <> 'llm'), 0), 3)::float8 AS other_cost
  FROM (
    SELECT to_char(a.started_at AT TIME ZONE 'Asia/Shanghai', 'MM-DD') AS day,
           a.service,
           coalesce(ar.backfill, false) AS hist,
           count(*)::int AS n,
           coalesce(sum(a.cost), 0) AS cost
    FROM receipt_attempts a
    LEFT JOIN receipts r ON r.id = a.receipt_id
    LEFT JOIN articles ar ON ar.id = split_part(split_part(r.subject, ':', 2), '@', 1)
    WHERE a.started_at > now() - (${days} || ' days')::interval
    GROUP BY 1, 2, 3
  ) t
  GROUP BY day
  ORDER BY day DESC`;

/** 单篇均价：按稿而不是按调用，才看得出"值不值"。 */
const [perArticle] = await sql<{ live: number; live_cost: number; hist: number; hist_cost: number }[]>`
  SELECT count(DISTINCT r.subject) FILTER (WHERE NOT coalesce(ar.backfill, false))::int AS live,
         round(coalesce(sum(r.cost) FILTER (WHERE NOT coalesce(ar.backfill, false)), 0), 3)::float8 AS live_cost,
         count(DISTINCT r.subject) FILTER (WHERE coalesce(ar.backfill, false))::int AS hist,
         round(coalesce(sum(r.cost) FILTER (WHERE coalesce(ar.backfill, false)), 0), 3)::float8 AS hist_cost
  FROM receipts r
  LEFT JOIN articles ar ON ar.id = split_part(split_part(r.subject, ':', 2), '@', 1)
  WHERE r.service = 'llm' AND r.created_at > now() - (${days} || ' days')::interval`;

const [total] = await sql<{ cost: number }[]>`
  SELECT round(coalesce(sum(cost), 0), 2)::float8 AS cost
  FROM receipt_attempts WHERE started_at > now() - (${days} || ' days')::interval`;

const budgets = await sql<{ service: string; per_hour: number; per_day: number }[]>`
  SELECT service, per_hour, per_day FROM budgets WHERE service IN ('llm', 'deepseek-tools') ORDER BY service`;

console.log(`近 ${days} 天合计 ¥${yuan(total?.cost)}（模型调用 + 网页搜索，含一次性回填）\n`);

console.log("按天：今天的新闻 / 补历史 / 搜索");
console.log(`${pad("日期", 8)}${pad("新稿调用", 10, true)}${pad("新稿花费", 12, true)}${pad("回填调用", 10, true)}${pad("回填花费", 12, true)}${pad("搜索", 8, true)}${pad("搜索花费", 10, true)}`);
for (const r of byKind) {
  console.log(`${pad(r.day, 8)}${pad(r.live, 10, true)}${pad(`¥${yuan(r.live_cost)}`, 12, true)}${pad(r.hist, 10, true)}${pad(`¥${yuan(r.hist_cost)}`, 12, true)}${pad(r.other, 8, true)}${pad(`¥${yuan(r.other_cost)}`, 10, true)}`);
}

console.log("\n按步骤（近 " + days + " 天）");
console.log(`${pad("阶段", 22)}${pad("调用", 8, true)}${pad("花费", 12, true)}${pad("占比", 8, true)}`);
const purposes = new Map<string, { n: number; cost: number }>();
for (const r of byPurpose) {
  const cur = purposes.get(r.purpose) ?? { n: 0, cost: 0 };
  purposes.set(r.purpose, { n: cur.n + r.n, cost: cur.cost + Number(r.cost ?? 0) });
}
const sumCost = [...purposes.values()].reduce((t, v) => t + v.cost, 0) || 1;
for (const [name, v] of [...purposes].sort((a, b) => b[1].cost - a[1].cost).slice(0, 10)) {
  console.log(`${pad(name, 22)}${pad(v.n, 8, true)}${pad(`¥${v.cost.toFixed(2)}`, 12, true)}${pad(`${((v.cost / sumCost) * 100).toFixed(0)}%`, 8, true)}`);
}

const liveUnit = perArticle && perArticle.live ? perArticle.live_cost / perArticle.live : 0;
const histUnit = perArticle && perArticle.hist ? perArticle.hist_cost / perArticle.hist : 0;
console.log(`\n单篇均价：今天的新闻 ¥${liveUnit.toFixed(4)}（${perArticle?.live ?? 0} 篇） · 补历史 ¥${histUnit.toFixed(4)}（${perArticle?.hist ?? 0} 篇）`);
console.log(`调用额度：${budgets.map((b) => `${b.service} ${b.per_hour}/小时 ${b.per_day}/24小时`).join(" · ")}`);
console.log("判据：新稿花费才代表日常成本；回填花费随每次加源一次性出现，可在半价时段（夜间/周末）跑。");

// 闸门体检：首采应只收最近 12 个月内、列表最靠前的若干条。日期解析不出来的条目会放行
//（它们按收录时间落位），归档型列表因此能混进几年前的稿——RSS 整份重读也走同一条路。
// 下面这行只是报警，不做任何修正：有数字就去查 `articles.backfill` 那一批。
const [leak] = await sql<{ total: number; selected: number; very_old: number; oldest: string | null; arts: number }[]>`
  WITH leak AS (
    SELECT a.id, a.published_at FROM articles a
    WHERE a.created_at > now() - interval '30 days'
      AND a.published_at < now() - interval '12 months'
  )
  SELECT (SELECT count(*) FROM leak)::int AS total,
         (SELECT count(*) FROM leak l JOIN publications p ON p.article_id = l.id WHERE p.selected)::int AS selected,
         (SELECT count(*) FROM leak WHERE published_at < now() - interval '24 months')::int AS very_old,
         (SELECT min(published_at)::date::text FROM leak) AS oldest,
         (SELECT count(*) FROM articles WHERE created_at > now() - interval '30 days')::int AS arts`;
if (leak && leak.total > 0) {
  const pct = leak.arts ? ((100 * leak.total) / leak.arts).toFixed(1) : "0";
  console.log(
    `\n闸门体检：近 30 天入库 ${leak.arts} 篇里，有 ${leak.total} 篇（${pct}%）原文日期早于 12 个月，` +
      `其中 ${leak.selected} 篇已入池、${leak.very_old} 篇早于 24 个月，最老 ${leak.oldest}。`,
  );
  console.log("  这不是时间窗设置错了，是无日期条目放行的副作用；见 docs/COST.md 第三节。");
} else {
  console.log("\n闸门体检：近 30 天没有超窗入库的老稿。");
}

await closeDb();
