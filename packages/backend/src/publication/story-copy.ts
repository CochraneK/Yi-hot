import { sql } from "../db.ts";

/** Older stored digests also need a read-time evidence check before a repaired worker rewrites them. */
export async function restrictedStoryCopy(storyId: number): Promise<boolean> {
  const [row] = await sql<{ restricted: boolean }[]>`
    WITH latest AS (SELECT article_ids FROM story_digests WHERE story_id = ${storyId} ORDER BY version DESC LIMIT 1),
    cited AS (
      SELECT unnest(article_ids) AS id FROM latest
      UNION ALL
      SELECT fa.article_id FROM fact_articles fa JOIN facts f ON f.id = fa.fact_id
      WHERE f.story_id = ${storyId} AND NOT EXISTS (SELECT 1 FROM latest)
    )
    SELECT EXISTS (SELECT 1 FROM cited JOIN publications p ON p.article_id = cited.id
      JOIN sources s ON s.id = p.source_id
      WHERE p.visibility <> 'public' OR NOT p.eligible OR s.participation_mode <> 'editorial') AS restricted`;
  return row?.restricted ?? false;
}
