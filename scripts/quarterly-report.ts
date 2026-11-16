// Builds a period report from what the database already holds. No model is called:
// every number here can be re-derived by running this file again.
//
// It writes two files — report.md, which is a draft a person still has to edit, and
// figures.json, which is the evidence behind it. Where a table covers less than the
// whole period (hot snapshots start later than the corpus, place approvals later
// still), the report says so in its own section instead of quietly showing a short
// column as if it were the full period.
//
// Usage: node scripts/quarterly-report.ts [--from=2026-10-01] [--to=2026-12-31] [--out=dir]
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { closeDb, sql } from "@aihot/backend/db";

const args = process.argv.slice(2);
const option = (key: string) => args.find(a => a.startsWith(key))?.slice(key.length);
const unknown = args.find(a => !/^--(from|to|out)=/.test(a));

const beijingToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
const from = option("--from=") ?? "2026-09-30";
const to = option("--to=") ?? beijingToday;
const outDir = option("--out=") ?? `reports/quarterly/${from}_${to}`;

const isDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

// A Beijing calendar day starts at 16:00 UTC the day before; comparing raw
// timestamps against a date string would slide every boundary by eight hours.
const windowStart = sql`${from}::date::timestamp AT TIME ZONE 'Asia/Shanghai'`;
const windowEnd = sql`((${to}::date + 1)::timestamp AT TIME ZONE 'Asia/Shanghai')`;
const inWindow = sql`coalesce(p.published_at, p.timeline_at) >= ${windowStart} AND coalesce(p.published_at, p.timeline_at) < ${windowEnd}`;

const round = (value: number | string | null, digits = 1) =>
  value === null ? 0 : Math.round(Number(value) * 10 ** digits) / 10 ** digits;
const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—");
const plusDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const table = (head: string[], rows: (string | number)[][]) =>
  [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map(r => `| ${r.join(" | ")} |`)].join("\n");

interface Totals {
  articles: number; publications: number; eligible: number; stories: number; sources: number;
  firstDay: string | null; lastDay: string | null;
}
interface Row { [key: string]: unknown }

try {
  if (unknown) throw Error(`Unknown argument: ${unknown}`);
  if (!isDay(from) || !isDay(to)) throw Error("--from and --to must be YYYY-MM-DD");
  if (from > to) throw Error("--from must not be later than --to");

  const [totals] = await sql<Totals[]>`
    SELECT
      (SELECT count(*)::int FROM articles WHERE discovered_at >= ${windowStart} AND discovered_at < ${windowEnd}) AS articles,
      count(*)::int AS publications,
      count(*) FILTER (WHERE p.eligible)::int AS eligible,
      count(DISTINCT p.story_id) FILTER (WHERE p.eligible)::int AS stories,
      count(DISTINCT p.source_id) FILTER (WHERE p.eligible)::int AS sources,
      min(coalesce(p.published_at, p.timeline_at))::date::text AS "firstDay",
      max(coalesce(p.published_at, p.timeline_at))::date::text AS "lastDay"
    FROM publications p WHERE ${inWindow}`;

  const categories = await sql<{ category: string; n: number }[]>`
    SELECT coalesce(an.category, '未分类') AS category, count(*)::int AS n
    FROM publications p JOIN analyses an ON an.id = p.analysis_id
    WHERE p.eligible AND ${inWindow}
    GROUP BY 1 ORDER BY 2 DESC`;

  const tiers = await sql<{ tier: string; n: number }[]>`
    SELECT coalesce(s.tier, '未分级') AS tier, count(*)::int AS n
    FROM publications p JOIN sources s ON s.id = p.source_id
    WHERE p.eligible AND ${inWindow}
    GROUP BY 1 ORDER BY 2 DESC`;

  const topSources = await sql<{ name: string; tier: string | null; n: number }[]>`
    SELECT s.name, s.tier, count(*)::int AS n
    FROM publications p JOIN sources s ON s.id = p.source_id
    WHERE p.eligible AND ${inWindow}
    GROUP BY 1, 2 ORDER BY 3 DESC, 1 LIMIT 15`;

  const weeks = await sql<{ week: string; n: number; stories: number }[]>`
    SELECT to_char(date_trunc('week', coalesce(p.published_at, p.timeline_at) AT TIME ZONE 'Asia/Shanghai'), 'MM-DD') AS week,
           count(*)::int AS n, count(DISTINCT p.story_id)::int AS stories
    FROM publications p WHERE p.eligible AND ${inWindow}
    GROUP BY 1 ORDER BY 1`;

  const [hotCoverage] = await sql<{ days: number; first: string | null; last: string | null; entries: number; stories: number }[]>`
    SELECT count(*)::int AS days, min(day)::text AS first, max(day)::text AS last,
           coalesce(sum(jsonb_array_length(entries)), 0)::int AS entries,
           (SELECT count(DISTINCT x->>'storyId')::int
              FROM hot_daily h2, jsonb_array_elements(h2.entries) x
             WHERE h2.day >= ${from}::date AND h2.day <= ${to}::date) AS stories
    FROM hot_daily WHERE day >= ${from}::date AND day <= ${to}::date`;

  // One row per (day, story): grouping afterwards answers both "how many days on
  // the board" and "how high did it ever get", which rank very different stories.
  const hotStories = await sql<{
    storyId: number; title: string; days: number; peak: number;
    firstDay: string; lastDay: string; maxReports: number; maxSources: number;
  }[]>`
    WITH board AS (
      SELECT h.day, (x->>'storyId')::bigint AS story_id, x->>'title' AS title,
             (x->>'heat')::float8 AS heat, (x->>'reportCount')::int AS reports,
             (x->>'sourceCount')::int AS sources
      FROM hot_daily h, jsonb_array_elements(h.entries) x
      WHERE h.day >= ${from}::date AND h.day <= ${to}::date
    )
    SELECT story_id AS "storyId",
           (array_agg(title ORDER BY day DESC))[1] AS title,
           count(*)::int AS days, max(heat) AS peak,
           min(day)::text AS "firstDay", max(day)::text AS "lastDay",
           max(reports)::int AS "maxReports", max(sources)::int AS "maxSources"
    FROM board GROUP BY story_id
    ORDER BY days DESC, peak DESC LIMIT 20`;

  const champions = await sql<{ day: string; title: string; heat: number }[]>`
    SELECT h.day::text AS day, x->>'title' AS title, (x->>'heat')::float8 AS heat
    FROM hot_daily h, jsonb_array_elements(h.entries) x
    WHERE h.day >= ${from}::date AND h.day <= ${to}::date AND (x->>'rank')::int = 1
    ORDER BY h.day`;

  const cities = await sql<{ city: string; articles: number; stories: number; units: number }[]>`
    SELECT coalesce(gp.parent_name, gp.name) AS city,
           count(DISTINCT p.article_id)::int AS articles,
           count(DISTINCT p.story_id)::int AS stories,
           count(DISTINCT gp.id)::int AS units
    FROM publications p
    JOIN geo_candidates gc ON gc.article_id = p.article_id AND gc.analysis_id = p.analysis_id
    JOIN analyses an ON an.id = gc.analysis_id
    JOIN articles ar ON ar.id = p.article_id
    JOIN geo_places gp ON gp.id = gc.place_id
    WHERE p.eligible AND an.input_revision = ar.revision
      AND gc.review_status = 'verified' AND gc.role = 'event' AND ${inWindow}
    GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 20`;

  const [cityTotal] = await sql<{ n: number }[]>`
    SELECT count(DISTINCT coalesce(gp.parent_id, gp.id))::int AS n
    FROM publications p
    JOIN geo_candidates gc ON gc.article_id = p.article_id AND gc.analysis_id = p.analysis_id
    JOIN analyses an ON an.id = gc.analysis_id
    JOIN articles ar ON ar.id = p.article_id
    JOIN geo_places gp ON gp.id = gc.place_id
    WHERE p.eligible AND an.input_revision = ar.revision
      AND gc.review_status = 'verified' AND gc.role = 'event' AND ${inWindow}`;

  const [geo] = await sql<{ verified: number; pending: number; first: string | null; placed: number; total: number; placedFrom: string | null }[]>`
    SELECT (SELECT count(*)::int FROM geo_candidates WHERE review_status = 'verified') AS verified,
           (SELECT count(*)::int FROM geo_candidates WHERE review_status = 'pending') AS pending,
           (SELECT min(created_at)::date::text FROM geo_candidates WHERE review_status = 'verified') AS first,
           (SELECT count(DISTINCT p.article_id)::int FROM publications p
              JOIN geo_candidates gc ON gc.article_id = p.article_id AND gc.analysis_id = p.analysis_id
              JOIN analyses an ON an.id = gc.analysis_id JOIN articles ar ON ar.id = p.article_id
             WHERE p.eligible AND an.input_revision = ar.revision
               AND gc.review_status = 'verified' AND gc.role = 'event' AND ${inWindow}) AS placed,
           (SELECT min(coalesce(p.published_at, p.timeline_at))::date::text FROM publications p
              JOIN geo_candidates gc ON gc.article_id = p.article_id AND gc.analysis_id = p.analysis_id
              JOIN analyses an ON an.id = gc.analysis_id JOIN articles ar ON ar.id = p.article_id
             WHERE p.eligible AND an.input_revision = ar.revision
               AND gc.review_status = 'verified' AND gc.role = 'event' AND ${inWindow}) AS "placedFrom",
           (SELECT count(*)::int FROM publications p WHERE p.eligible AND ${inWindow}) AS total`;

  // A table that starts after the period does is not a table of the period. The
  // report spells out each such gap rather than letting a short column imply
  // "nothing happened before".
  const gaps: string[] = [];
  if (hotCoverage.first && hotCoverage.first > from) {
    gaps.push(`热榜快照从 ${hotCoverage.first} 才开始，早于此日期的「上榜天数」没有记录；热榜统计窗口为 48 小时，不是全年累计。`);
  }
  if (!hotCoverage.first) gaps.push("这个区间内没有任何热榜快照，热榜与城市两节不成立。");
  // Whether the city table covers the period is a question about the articles it
  // was built from, not about the day someone pressed approve: a backfill in
  // November can legitimately carry places for September.
  if (!geo.placedFrom) {
    gaps.push("这个区间内没有带已核准事件地点的报道，城市榜为空。");
  } else if (geo.placedFrom > plusDays(from, 7)) {
    gaps.push(`带地点的报道最早只到 ${geo.placedFrom}，城市榜只覆盖其后的事件，不能当作整季的城市分布。`);
  }
  if (totals.eligible > 0 && geo.placed / totals.eligible < 0.5) {
    gaps.push(`地点覆盖率 ${pct(geo.placed, totals.eligible)}（${geo.placed}/${totals.eligible} 条入选报道有已核准事件地点），城市榜是下界，不是全量。`);
  }
  if (geo.pending > 0) gaps.push(`另有 ${geo.pending} 条地点候选待核准，未进入任何统计。`);

  const figures = {
    window: { from, to, timezone: "Asia/Shanghai" },
    generatedAt: new Date().toISOString(),
    totals, categories, tiers, topSources, weeks, hotCoverage, hotStories, champions, cities,
    cityCount: cityTotal!.n, geo, gaps,
  };

  const md: string[] = [];
  md.push(`# 行业观察 · ${from} 至 ${to}`, "");
  md.push(`本文件由 \`scripts/quarterly-report.ts\` 从数据库直接生成，未调用模型。数字可复核，` +
    `原始值见同目录 \`figures.json\`。`, "");

  md.push("## 一、这一段发生了什么", "");
  md.push(`入选报道 **${totals.eligible.toLocaleString()}** 条，归并为 **${totals.stories.toLocaleString()}** 个事件，` +
    `来自 **${totals.sources}** 个信源。抓取总量 ${totals.publications.toLocaleString()} 条，入选率 ${pct(totals.eligible, totals.publications)}。`, "");
  if (hotStories.length) {
    md.push(`同期热榜共 ${hotCoverage.days} 天、${hotCoverage.entries} 个条目，去重后 ${hotCoverage.stories} 个事件进过榜。`, "");
  }
  if (cities.length) {
    md.push(`已核准事件地点覆盖 **${cityTotal!.n}** 个城市，榜首 ${cities[0]!.city}（${cities[0]!.articles} 条报道）。`, "");
  }

  if (gaps.length) {
    md.push("## 二、口径与缺口（先读这一节）", "");
    for (const gap of gaps) md.push(`- ${gap}`);
    md.push("");
  }

  md.push("## 三、量", "");
  md.push(table(["项", "值"], [
    ["抓取文章", totals.articles.toLocaleString()],
    ["进入发布池", totals.publications.toLocaleString()],
    ["其中入选", totals.eligible.toLocaleString()],
    ["入选率", pct(totals.eligible, totals.publications)],
    ["归并事件", totals.stories.toLocaleString()],
    ["有产出的信源", String(totals.sources)],
    ["内容日期范围", `${totals.firstDay ?? "—"} 至 ${totals.lastDay ?? "—"}`],
  ]), "");

  md.push("## 四、主题", "");
  md.push(table(["分类", "条数", "占入选"], categories.map(c => [c.category, c.n, pct(c.n, totals.eligible)])), "");

  md.push("## 五、信源", "");
  md.push(table(["分级", "条数", "占入选"], tiers.map(t => [t.tier, t.n, pct(t.n, totals.eligible)])), "");
  md.push("", `产出最多的 ${topSources.length} 个信源（有产出的共 ${totals.sources} 个，按入选条数）：`, "");
  md.push(table(["信源", "分级", "条数"], topSources.map(s => [s.name, s.tier ?? "—", s.n])), "");

  md.push("## 六、热榜", "");
  if (!hotStories.length) {
    md.push("这个区间没有热榜快照。", "");
  } else {
    md.push("### 在榜天数最长的 20 个事件", "");
    md.push("「在榜天数」比「峰值热度」更偏向持续发酵的议题，而不是单日爆点。", "");
    md.push(table(["事件", "在榜天数", "峰值热度", "最多报道数", "最多信源数", "首次上榜"],
      hotStories.map(s => [s.title, s.days, round(s.peak), s.maxReports, s.maxSources, s.firstDay])), "");
    md.push("### 每日榜首", "");
    md.push(table(["日期", "事件", "热度"], champions.map(c => [c.day, c.title, round(c.heat)])), "");
  }

  md.push("## 七、城市", "");
  if (!cities.length) {
    md.push("这个区间没有已核准的事件地点。", "");
  } else {
    md.push("按父城市上卷：区、县、县级市的事件计入其所属地级市。", "");
    md.push(`下表按报道数排序，只列前 ${cities.length} 个；全区间共有 ${cityTotal!.n} 个城市有已核准地点。`, "");
    md.push(table(["城市", "报道数", "事件数", "覆盖的区县数"], cities.map(c => [c.city, c.articles, c.stories, c.units])), "");
  }
  md.push(`地点口径：已核准事件地点 ${geo.verified} 条，待核准 ${geo.pending} 条，选中报道中有地点的 ${geo.placed} 条。`, "");

  md.push("## 八、节奏", "");
  md.push("按周（周一起算）：", "");
  md.push(table(["周起始", "入选报道", "事件数"], weeks.map(w => [w.week, w.n, w.stories])), "");

  md.push("## 九、复现", "", "```", `node scripts/quarterly-report.ts --from=${from} --to=${to} --out=${outDir}`, "```", "");

  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "report.md"), `${md.join("\n")}\n`, "utf8");
  writeFileSync(path.join(outDir, "figures.json"), `${JSON.stringify(figures, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    out: outDir,
    window: { from, to },
    eligible: totals.eligible,
    stories: totals.stories,
    hotDays: hotCoverage.days,
    cities: cities.length,
    placeCoverage: pct(geo.placed, totals.eligible),
    gaps,
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
