import { gate, stub, tag } from './setup.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { sql, closeDb } from '@aihot/backend/db';
import { stopBoss } from '@aihot/backend/jobs/queue';
import { upsertMaterial } from '@aihot/backend/content/materials';
import { publishArticle } from '@aihot/backend/publication/publish';
import { setVisibility } from '@aihot/backend/admin/content';
import { composeStoryDigest } from '@aihot/backend/events/digest';
import { restrictedStoryCopy } from '@aihot/backend/publication/story-copy';

const asked = gate();
const answer = gate();
const provider = await stub(async () => {
  asked.open(); await answer.promise;
  return { choices: [{ message: { content: JSON.stringify({ title: '旧标题', digest: 'WITHDRAWN_DIGEST_CLAIM', latest: '旧进展' }) } }],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } };
});
process.env.DEEPSEEK_BASE_URL = `${provider.url}/v1`;
process.env.DEEPSEEK_API_KEY = 'test-key';
after(async () => { answer.open(); await provider.close(); await stopBoss(); await closeDb(); });

test('a digest answering after evidence withdrawal cannot restore revoked copy; old stored copy is restricted', async () => {
  const source = `digest-withdrawal-${tag()}`;
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode) VALUES (${source},'Digest evidence','rss','T1','editorial')`;
  const [story] = await sql`INSERT INTO stories (public_id,title) VALUES (${randomUUID()},'公益项目进展') RETURNING id`;
  const [fact] = await sql`INSERT INTO facts (public_id,story_id,title) VALUES (${randomUUID()},${story!.id},'项目进展') RETURNING id`;
  const ids: string[] = [];
  for (let i = 0; i < 2; i++) {
    const { articleId } = await upsertMaterial({ sourceId: source, url: `https://example.org/${source}/${i}`,
      title: `公益项目进展${i}`, via: 'fetch', publishedAt: new Date() });
    ids.push(articleId);
    await sql`INSERT INTO analyses (article_id,input_revision,origin,relevance,title_zh,summary_zh,score,selected)
      VALUES (${articleId},1,'rule','pass',${`公益项目进展${i}`},'项目进展的真实摘要',80,true)`;
    await sql`INSERT INTO fact_articles (fact_id,article_id,role) VALUES (${fact!.id},${articleId},'report')`;
    await publishArticle(articleId, { releasedAt: new Date(Date.now() - 60_000) });
  }
  const pending = composeStoryDigest(story!.id);
  await Promise.race([asked.promise, pending.then(() => assert.fail('digest ended without asking the stub'))]);
  await setVisibility(ids[0]!, { visibility: 'withdrawn', reason: 'test withdrawal', version: 0 }, 'test');
  answer.open();
  assert.equal((await pending).updated, false);
  const [saved] = await sql`SELECT digest,summary,latest FROM stories WHERE id=${story!.id}`;
  assert.deepEqual({ ...saved }, { digest: null, summary: null, latest: null });
  assert.equal((await sql`SELECT 1 FROM story_digests WHERE story_id=${story!.id}`).length, 0);
  assert.equal((await sql`SELECT status FROM receipts WHERE purpose='story_digest' AND subject=${`story:${story!.id}@2`}`)[0]!.status, 'completed');
  // Simulate a digest written by a deployment predating revocation invalidation.
  await sql`INSERT INTO story_digests (story_id,version,digest,article_ids) VALUES (${story!.id},1,'OLD_CLAIM',${ids})`;
  assert.equal(await restrictedStoryCopy(story!.id), true);
  await sql`UPDATE story_digests SET article_ids=${[ids[1]!]} WHERE story_id=${story!.id}`;
  assert.equal(await restrictedStoryCopy(story!.id), false);
});
