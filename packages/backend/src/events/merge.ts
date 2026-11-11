// Atomic story merging. Lock fact rows, then affected articles, then stories in a
// deterministic order; the updated public projection and queued digest must commit
// with the membership changes, or not at all.
import { sql } from "../db.ts";
import { ensureQueue, enqueue, QUEUES } from "../jobs/queue.ts";
import { publishArticleTx } from "../publication/publish.ts";

/** Merge fromId into intoId. Null if a story is missing or already redirected. */
export async function mergeStoryInto(fromId: number, intoId: number, reason: string, actor: string): Promise<{ moved: number } | null> {
  if (fromId === intoId) throw new Error("cannot merge a story into itself");

  // Queue creation uses its own connection; ensure the queues *before* opening a
  // transaction in which a publication may need to enqueue jobs atomically.
  await Promise.all([QUEUES.digest, QUEUES.notifySelected, QUEUES.prepareMedia].map(name => ensureQueue(name)));
  return sql.begin(async (tx) => {
    // These are the same lock phases as consolidation: facts -> article projections -> stories.
    // NO KEY UPDATE allows FK KEY SHARE for an incoming membership, avoiding a
    // common deadlock with grouping while still preventing competing fact updates.
    await tx`SELECT id FROM facts WHERE story_id IN (${fromId}, ${intoId}) ORDER BY id FOR NO KEY UPDATE`;
    const ids = (await tx<{ article_id: string }[]>`
      SELECT DISTINCT fa.article_id FROM fact_articles fa JOIN facts f ON f.id=fa.fact_id
      WHERE f.story_id IN (${fromId}, ${intoId}) ORDER BY fa.article_id
    `).map(row => row.article_id);
    if (ids.length) await tx`SELECT id FROM articles WHERE id = ANY(${ids}::text[]) ORDER BY id FOR UPDATE`;

    // A and B merging concurrently in opposite directions must acquire the
    // same row lock order, then observe one redirect and leave it unchanged.
    const stories = await tx<{ id: number; public_id: string; merged_into: number | null }[]>`
      SELECT id, public_id, merged_into FROM stories WHERE id IN (${fromId}, ${intoId})
      ORDER BY id FOR UPDATE
    `;
    const from = stories.find(story => Number(story.id) === fromId);
    const into = stories.find(story => Number(story.id) === intoId);
    if (!from || !into || from.merged_into !== null || into.merged_into !== null) return null;

    await tx`UPDATE facts SET story_id=${intoId}, updated_at=now() WHERE story_id=${fromId}`;
    await tx`INSERT INTO story_signals (story_id, article_id, participant_key, source_id, kind, observed_at)
      SELECT ${intoId}, article_id, participant_key, source_id, kind, observed_at
      FROM story_signals WHERE story_id=${fromId}
      ON CONFLICT (story_id, article_id) DO NOTHING`;
    await tx`DELETE FROM story_signals WHERE story_id=${fromId}`;
    await tx`UPDATE stories SET merged_into=${intoId}, version=version+1, updated_at=now()
      WHERE id=${fromId}`;
    await tx`UPDATE stories SET version=version+1, updated_at=now(),
      latest_at=greatest(latest_at,(SELECT latest_at FROM stories WHERE id=${fromId})),
      first_report_at=least(first_report_at,(SELECT first_report_at FROM stories WHERE id=${fromId}))
      WHERE id=${intoId}`;
    await tx`INSERT INTO story_aliases(public_id,story_id) VALUES (${from.public_id},${intoId}) ON CONFLICT DO NOTHING`;

    // Unlike the former post-commit loop, a failed article projection cannot
    // leave story membership changed with an old public story_id.
    for (const articleId of ids) await publishArticleTx(tx, articleId);
    await enqueue(QUEUES.digest, { storyId: intoId }, { singletonKey: `story:${intoId}` }, tx);
    await tx`INSERT INTO audit_log(actor,action,subject,reason,before,after)
      VALUES (${actor},'story.merge',${`story:${fromId}`},${reason},NULL,${tx.json({ into: intoId })})`;
    return { moved: ids.length };
  });
}
