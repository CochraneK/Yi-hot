// 队列是否收敛：入、出、堵在哪里、还要多久。
//
// 成本报告回答「花了多少」，这份回答「装不装得下」。两者必须一起看：只压成本不压积压，
// 表面省下的钱会在夜里以更高峰的价格补回来；只压积压不看成本，就是把钱花在没人看的旧稿上。
//
//   node --env-file-if-exists=/app/.env scripts/queue-report.ts [days]
//
// 核心公式：待处理变化 = 新增 - 完成 - 退出。退出 = 归档（archived）+ 拦截（blocked）+ 跳过（skipped）。
// 判据：在固定配额下连续跑，积压必须回到 0 附近，而不是逐日抬高。
import { closeDb, sql } from "@aihot/backend/db";

const days = Math.max(1, Math.min(90, Number(process.argv[2] ?? "7")));
const pad = (v: string | number, n: number, right = false) => {
  const s = String(v);
  const w = [...s].length >= n ? 0 : n - [...s].length;
  return right ? " ".repeat(w) + s : s + " ".repeat(w);
};
const num = (v: unknown) => Number(v ?? 0);

const quota = Number(process.env.DAILY_ANALYZE_QUOTA ?? 480);
const histMax = Number(process.env.HISTORY_DAILY_MAX ?? 120);
const backlogMax = Number(process.env.HISTORY_BACKLOG_MAX ?? 600);
const maxWaitH = Number(process.env.HISTORY_MAX_WAIT_HOURS ?? 96);

const [now] = await sql<{ live: number; hist: number; oldest_live: number; oldest_hist: number }[]>`
  SELECT
    count(*) FILTER (WHERE NOT coalesce(backfill,false))::int AS live,
    count(*) FILTER (WHERE coalesce(backfill,false))::int AS hist,
    coalesce(extract(epoch FROM now() - min(discovered_at) FILTER (WHERE NOT coalesce(backfill,false))) / 3600, 0)::float8 AS oldest_live,
    coalesce(extract(epoch FROM now() - min(discovered_at) FILTER (WHERE coalesce(backfill,false))) / 3600, 0)::float8 AS oldest_hist
  FROM articles WHERE processing_state = 'new'`;

const [inflow] = await sql<{ live: number; hist: number; archived: number; analyzed: number; blocked: number; skipped: number }[]>`
  SELECT
    (SELECT count(*)::int FROM articles WHERE discovered_at > now() - interval '24 hours' AND NOT coalesce(backfill,false)) AS live,
    (SELECT count(*)::int FROM articles WHERE discovered_at > now() - interval '24 hours' AND coalesce(backfill,false)) AS hist,
    (SELECT count(*)::int FROM articles WHERE archived_at > now() - interval '24 hours') AS archived,
    (SELECT count(*)::int FROM analyses WHERE created_at > now() - interval '24 hours') AS analyzed,
    (SELECT count(*)::int FROM articles WHERE processing_state = 'blocked' AND updated_at > now() - interval '24 hours') AS blocked,
    (SELECT count(*)::int FROM articles WHERE processing_state = 'skipped' AND updated_at > now() - interval '24 hours') AS skipped`;

const wait = await sql<{ hist: boolean; n: number; p50: number; p95: number; max: number }[]>`
  WITH t AS (
    SELECT coalesce(a.backfill,false) AS hist, extract(epoch FROM an.created_at - a.discovered_at) / 60 AS mins
    FROM analyses an JOIN articles a ON a.id = an.article_id
    WHERE an.created_at > now() - interval '3 days'
  )
  SELECT hist, count(*)::int AS n,
         round(percentile_cont(0.5) WITHIN GROUP (ORDER BY mins)::numeric, 1) AS p50,
         round(percentile_cont(0.95) WITHIN GROUP (ORDER BY mins)::numeric, 1) AS p95,
         round(max(mins)::numeric, 1) AS max
  FROM t GROUP BY 1 ORDER BY 1`;

const trend = await sql<{ day: string; inflow: number; done: number; exit: number; end_backlog: number }[]>`
  WITH d AS (
    SELECT generate_series(date_trunc('day', now() AT TIME ZONE 'Asia/Shanghai') - (${days - 1} || ' days')::interval,
                           date_trunc('day', now() AT TIME ZONE 'Asia/Shanghai'), interval '1 day') AS day
  )
  SELECT to_char(d.day, 'MM-DD') AS day,
    (SELECT count(*)::int FROM articles a WHERE a.discovered_at >= d.day AT TIME ZONE 'Asia/Shanghai'
       AND a.discovered_at < (d.day + interval '1 day') AT TIME ZONE 'Asia/Shanghai') AS inflow,
    (SELECT count(*)::int FROM analyses an WHERE an.created_at >= d.day AT TIME ZONE 'Asia/Shanghai'
       AND an.created_at < (d.day + interval '1 day') AT TIME ZONE 'Asia/Shanghai') AS done,
    (SELECT count(*)::int FROM articles a WHERE a.archived_at >= d.day AT TIME ZONE 'Asia/Shanghai'
       AND a.archived_at < (d.day + interval '1 day') AT TIME ZONE 'Asia/Shanghai') AS exit,
    (SELECT count(*)::int FROM articles a WHERE a.processing_state = 'new'
       AND a.discovered_at < (d.day + interval '1 day') AT TIME ZONE 'Asia/Shanghai') AS end_backlog
  FROM d ORDER BY d.day`;

const reasons = await sql<{ reason: string; n: number }[]>`
  SELECT coalesce(archive_reason, '(none)') AS reason, count(*)::int AS n FROM articles
  WHERE processing_state = 'archived' GROUP BY 1 ORDER BY 2 DESC`;

console.log(`容量：历史每天最多 ${histMax} 篇（全站参考线 ${quota} 篇）· 历史积压上限 ${backlogMax} 篇 · 最长等待 ${maxWaitH} 小时\n`);

console.log("当前队列");
console.log(`  待处理   当日 ${now!.live} 篇（最老 ${num(now!.oldest_live).toFixed(1)} h）· 历史 ${now!.hist} 篇（最老 ${num(now!.oldest_hist).toFixed(1)} h）`);
console.log(`  近 24h   进 ${inflow!.live + inflow!.hist}（当日 ${inflow!.live} / 历史 ${inflow!.hist}）`
  + ` · 完成 ${inflow!.analyzed} · 归档 ${inflow!.archived} · 拦截 ${inflow!.blocked} · 跳过 ${inflow!.skipped}`);
const net = inflow!.live + inflow!.hist - inflow!.analyzed - inflow!.archived;
console.log(`  净变化   ${net >= 0 ? "+" : ""}${net} 篇/24h（正数=队列在变长）`);

const capacity = Math.max(0, histMax);
const clearHours = now!.hist > 0 ? (now!.hist / Math.max(capacity, 1)) * 24 : 0;
console.log(`  历史清空 按当前配额约 ${clearHours.toFixed(1)} 小时${now!.hist > backlogMax ? "  ← 已超积压上限，新历史稿会被归档" : ""}`);

console.log("\n等待时长（近 3 天完成的稿）");
console.log(`  ${pad("类型", 8)}${pad("篇数", 8, true)}${pad("P50", 10, true)}${pad("P95", 10, true)}${pad("最长", 10, true)}`);
for (const r of wait) {
  console.log(`  ${pad(r.hist ? "历史" : "当日", 8)}${pad(r.n, 8, true)}${pad(`${r.p50} 分`, 10, true)}${pad(`${r.p95} 分`, 10, true)}${pad(`${r.max} 分`, 10, true)}`);
}

const late = await sql<{ n: number }[]>`
  SELECT count(*)::int AS n FROM articles
  WHERE processing_state = 'new' AND NOT coalesce(backfill,false) AND discovered_at < now() - interval '2 hours'`;
if (late[0]!.n > 0) console.log(`\n⚠️  当日新闻等待超过 2 小时：${late[0]!.n} 篇`);

console.log(`\n近 ${days} 天：每日进 / 完成 / 归档 / 日终积压`);
console.log(`  ${pad("日期", 8)}${pad("进", 8, true)}${pad("完成", 8, true)}${pad("归档", 8, true)}${pad("日终积压", 12, true)}`);
for (const r of trend) {
  console.log(`  ${pad(r.day, 8)}${pad(r.inflow, 8, true)}${pad(r.done, 8, true)}${pad(r.exit, 8, true)}${pad(r.end_backlog, 12, true)}`);
}

if (reasons.length) {
  console.log("\n归档原因（累计）");
  for (const r of reasons) console.log(`  ${pad(r.reason, 14)}${pad(r.n, 8, true)}`);
  console.log("  放回队列：node scripts/requeue-archived.ts [quota|backlog|stale-wait]");
}

const last3 = trend.slice(-3).map((r) => r.end_backlog);
// 三天里涨了 50 篇以上才算「在变长」：队列在 0 附近抖动（今天 3 篇）不是趋势。
const growing = last3.length === 3 && last3[2]! - last3[0]! > Math.max(50, backlogMax * 0.1);
console.log(`\n判据：${growing ? "⚠️ 连续三天日终积压上升，配额低于入稿速度" : "✅ 积压未持续增长"}`);
if (now!.hist === 0 && now!.live <= 5) console.log("  队列已清空；历史 P95 的等待来自首采回填（按设计就是几天前的稿）。");

await closeDb();
