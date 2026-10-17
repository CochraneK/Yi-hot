// Add the exclusive “其他领域” fallback to existing relevant analyses and public dynamics
// that do not have any of the 12 specific mission-topic tags. This is deterministic and
// does not call a model. Re-running it is safe.
import { closeDb, sql } from "@aihot/backend/db";
import { OTHER_MISSION_TOPIC, SPECIFIC_MISSION_TOPIC_NAMES } from "@aihot/industry/save-the-children";

const result = await sql.begin(async (tx) => {
  const analyses = await tx`
    UPDATE analyses
    SET tags = array_append(coalesce(tags, ARRAY[]::text[]), ${OTHER_MISSION_TOPIC})
    WHERE relevance = 'pass'
      AND NOT coalesce(tags, ARRAY[]::text[]) && ${SPECIFIC_MISSION_TOPIC_NAMES}::text[]
      AND NOT (${OTHER_MISSION_TOPIC} = ANY(coalesce(tags, ARRAY[]::text[])))
    RETURNING id`;
  const publications = await tx`
    UPDATE publications
    SET tags = array_append(coalesce(tags, ARRAY[]::text[]), ${OTHER_MISSION_TOPIC})
    WHERE visibility = 'public' AND eligible
      AND NOT coalesce(tags, ARRAY[]::text[]) && ${SPECIFIC_MISSION_TOPIC_NAMES}::text[]
      AND NOT (${OTHER_MISSION_TOPIC} = ANY(coalesce(tags, ARRAY[]::text[])))
    RETURNING article_id`;
  return { analyses: analyses.length, publications: publications.length };
});

console.log(JSON.stringify(result));
await closeDb();
