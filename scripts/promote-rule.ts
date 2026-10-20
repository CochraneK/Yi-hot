// 按源规则补录：把已经入库、但因为当时走信号通道（或早先的规则）而没进事件的文章，按现在的
// publication_rule 重新判一次；通过的重新归并（会走正常的建事件/匹配路径），不过的保持不动。
//
// 用法：
//   node scripts/promote-rule.ts --dry-run          # 只列出会放行哪几条，不动数据库
//   node scripts/promote-rule.ts                    # 真的重新归并
//   node scripts/promote-rule.ts --source=xhs-search-charity-project
import { closeDb, sql } from "@aihot/backend/db";
import { groupArticle } from "@aihot/backend/events/group";
import { passesPublicationRule, type PublicationRule } from "@aihot/backend/publication/rules";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    source: { type: "string" },
    limit: { type: "string" },
  },
});

const only = values.source ?? null;
const limit = values.limit ? Number(values.limit) : 500;

const sources = await sql<{ id: string; name: string; publication_rule: PublicationRule }[]>`
  SELECT id, name, publication_rule FROM sources
  WHERE publication_rule IS NOT NULL ${only ? sql`AND id = ${only}` : sql``}
  ORDER BY id`;
if (!sources.length) {
  console.log("没有配置 publication_rule 的信源");
  await closeDb();
  process.exit(0);
}

let promoted = 0;
let wouldPromote = 0;
let refused = 0;
for (const source of sources) {
  const rows = await sql<{ id: string; title: string; score: string | null; category: string | null; title_zh: string | null; summary_zh: string | null }[]>`
    SELECT a.id, a.title, an.score, an.category, an.title_zh, an.summary_zh
    FROM articles a
    LEFT JOIN LATERAL (
      SELECT score, category, title_zh, summary_zh FROM analyses
      WHERE article_id = a.id ORDER BY input_revision DESC, id DESC LIMIT 1
    ) an ON TRUE
    WHERE a.source_id = ${source.id}
      AND NOT EXISTS (SELECT 1 FROM fact_articles fa WHERE fa.article_id = a.id)
    ORDER BY coalesce(an.score, 0) DESC, a.discovered_at DESC
    LIMIT ${limit}`;

  const keep = rows.filter((r) =>
    passesPublicationRule(source.publication_rule, {
      score: r.score,
      category: r.category,
      title: r.title_zh ?? r.title,
      summary: r.summary_zh,
    }),
  );
  refused += rows.length - keep.length;
  console.log(`${source.id}: ${rows.length} 篇待判，${keep.length} 篇按规则放行`);
  for (const r of keep) {
    console.log(`  ${r.score ?? "-"} ${r.category ?? "-"}  ${r.title_zh ?? r.title}`);
    wouldPromote += 1;
    if (values["dry-run"]) continue;
    const result = await groupArticle(r.id, { force: true });
    console.log(`    → ${result.verdict}${result.storyId ? ` story=${result.storyId}` : ""}${result.factId ? ` fact=${result.factId}` : ""}`);
    promoted += 1;
  }
}

console.log(
  values["dry-run"]
    ? `dry-run：${wouldPromote} 篇会被重新归并，${refused} 篇仍被规则拦下（未执行）`
    : `重新归并 ${promoted} 篇，${refused} 篇仍被规则拦下`,
);
await closeDb();
