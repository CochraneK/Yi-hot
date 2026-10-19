// Repair organization-topic membership without another model call. An organization is retained when
// it owns the source or is named in the original headline; body-only roundup/list mentions are removed.
// Dry-run by default. Pass --apply to update analyses and rebuild affected publications.
import { closeDb, sql } from "@aihot/backend/db";
import { tagsForVerifiedSubjects, verifiedEntitySubjects } from "@aihot/backend/editorial/analyze";
import { publishArticle } from "@aihot/backend/publication/publish";
import { ENTITY_TAGS } from "@aihot/industry/taxonomy";

interface Row {
  analysis_id: number;
  article_id: string;
  title: string;
  source_name: string;
  owner_entity_id: string | null;
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
  WHERE cardinality(coalesce(an.subjects, ARRAY[]::text[])) > 0
     OR coalesce(an.tags, ARRAY[]::text[]) && ${ENTITY_TAGS}::text[]
  ORDER BY an.id`;

const changed = rows.flatMap((row) => {
  const subjects = verifiedEntitySubjects(
    { title: row.title, source: { ownerEntityId: row.owner_entity_id } },
    row.subjects,
  );
  const tags = tagsForVerifiedSubjects(row.tags, subjects);
  if (JSON.stringify(subjects) === JSON.stringify(row.subjects) && JSON.stringify(tags) === JSON.stringify(row.tags)) return [];
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

const removedByEntity: Record<string, number> = {};
for (const row of changed) {
  for (const entity of row.subjects.filter((id) => !row.repaired_subjects.includes(id))) {
    removedByEntity[entity] = (removedByEntity[entity] ?? 0) + 1;
  }
}
console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  scanned: rows.length,
  changedAnalyses: changed.length,
  affectedArticles: new Set(changed.map((row) => row.article_id)).size,
  removedByEntity,
  examples: changed.slice(0, 20).map((row) => ({
    articleId: row.article_id,
    source: row.source_name,
    title: row.title,
    before: row.subjects,
    after: row.repaired_subjects,
  })),
}));
await closeDb();
