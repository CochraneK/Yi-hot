// Backfill the owner's organization topic onto articles of dedicated first-party columns.
// repair-entity-subjects only re-filters what the model already proposed; this adds what the
// operator's source ownership asserts (owner_entity_id is set only on columns whose every item is
// that organization's own news). Dry-run by default. Pass --apply to write and republish.
import { closeDb, sql } from "@aihot/backend/db";
import { tagsForVerifiedSubjects } from "@aihot/backend/editorial/analyze";
import { publishArticle } from "@aihot/backend/publication/publish";
import { ENTITIES } from "@aihot/industry/taxonomy";

interface Row {
  analysis_id: number;
  article_id: string;
  title: string;
  source_name: string;
  owner_entity_id: string;
  subjects: string[];
  tags: string[];
}

const apply = process.argv.includes("--apply");
const rows = await sql<Row[]>`
  SELECT an.id AS analysis_id, an.article_id, a.title, s.name AS source_name, s.owner_entity_id,
         coalesce(an.subjects, ARRAY[]::text[]) AS subjects,
         coalesce(an.tags, ARRAY[]::text[]) AS tags
  FROM analyses an
  JOIN articles a ON a.id = an.article_id
  JOIN sources s ON s.id = a.source_id
  WHERE s.owner_entity_id IS NOT NULL
  ORDER BY an.id`;

const changed = rows.flatMap((row) => {
  const owner = row.owner_entity_id.trim().toLowerCase();
  if (!ENTITIES[owner] || row.subjects.includes(owner)) return [];
  const subjects = [owner, ...row.subjects];
  const tags = tagsForVerifiedSubjects(row.tags, subjects);
  return [{ ...row, repaired_subjects: subjects, repaired_tags: tags }];
});

if (apply && changed.length) {
  await sql.begin(async (tx) => {
    for (const row of changed) {
      await tx`UPDATE analyses SET subjects = ${row.repaired_subjects}, tags = ${row.repaired_tags} WHERE id = ${row.analysis_id}`;
    }
  });
  for (const articleId of [...new Set(changed.map((row) => row.article_id))]) await publishArticle(articleId);
}

const bySource: Record<string, number> = {};
for (const row of changed) bySource[row.source_name] = (bySource[row.source_name] ?? 0) + 1;
console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  scanned: rows.length,
  changedAnalyses: changed.length,
  affectedArticles: new Set(changed.map((row) => row.article_id)).size,
  bySource,
}, null, 1));
await closeDb();
