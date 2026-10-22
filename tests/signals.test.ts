// Live news before history, and discussion posts that come before the first report: a discussion post
// skips the analysis queue; history (a backfill that was already old when found) waits behind live
// work, founds no event and adds no heat, but may join a card another report founded; a post that
// found no story is grouped again when a report founds a fact close to it, or when the post it quotes
// arrives and joins a fact.
import { stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { groupArticle } from "@aihot/backend/events/group";
import { queueProcessing, settleNonEditorial } from "@aihot/backend/jobs/content";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { publishArticle } from "@aihot/backend/publication/publish";

const T = tag();
const EDITORIAL = `test-sig-ed-${T}`;
const SIGNAL = `test-sig-hs-${T}`;
const TOPIC = `WL${T}`;
/** Text of its own: close to nothing stored. */
const ALONE = `ZZ${T}`;

// Embeddings: texts about the topic point one way, everything else another. The judge calls the first
// candidate the same occurrence.
const provider = await stub((_hit, req) => {
  const body = JSON.parse(req.body) as { input?: string[]; messages?: Array<{ content: string }> };
  if (body.input) {
    // The topic's axis is this run's own, so stored vectors of earlier runs never match it.
    const axis = 2 + (parseInt(T.slice(-4), 36) % 1000);
    return { data: body.input.map((text, index) => ({ index, embedding: Array.from({ length: 1024 }, (_v, i) => (i === (text.includes(TOPIC) ? axis : text.includes(ALONE) ? axis + 1 : 1) ? 1 : 0)) })) };
  }
  const answer = { query: "发布", decisions: [{ id: "C1", relation: "SAME_OCCURRENCE", confidence: 0.95, note: "" }] };
  return { id: "stub", choices: [{ message: { content: JSON.stringify(answer) } }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } };
});
for (const name of ["DASHSCOPE_BASE_URL", "DEEPSEEK_BASE_URL"]) process.env[name] = `${provider.url}/v1`;
for (const name of ["DASHSCOPE_API_KEY", "DEEPSEEK_API_KEY"]) process.env[name] = "test-key";

async function job(articleId: string) {
  const [j] = await sql<{ name: string; priority: number; data: { signalOnly?: boolean } }[]>`
    SELECT name, priority, data FROM pgboss.job WHERE singleton_key = ${articleId} ORDER BY created_on DESC LIMIT 1`;
  return j ?? null;
}

async function report(suffix: string, opts: { title: string; backfill?: string; publishedAt?: Date }) {
  const { articleId } = await upsertMaterial({
    sourceId: EDITORIAL, url: `https://example.com/sig-${T}-${suffix}`, title: opts.title, bodyText: "Body.", bodyStatus: "ok", via: "fetch",
    publishedAt: opts.publishedAt ?? new Date(), backfill: opts.backfill ?? null,
  });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, score, selected, output)
            VALUES (${articleId}, 1, 'rule', 'pass', 'policy', ${opts.title}, '摘要', 80, false, ${sql.json({ fact: { title: opts.title } })})`;
  await publishArticle(articleId);
  return articleId;
}

before(async () => {
  await sql`UPDATE budgets SET per_minute = 1000, per_hour = 10000, per_day = 100000 WHERE service IN ('dashscope', 'deepseek')`;
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at) VALUES
            (${EDITORIAL}, 'Test editorial', 'rss', 'T1', 'editorial', '2100-01-01'),
            (${SIGNAL}, 'Test signal', 'rss', 'T2', 'hot_signal', '2100-01-01')`;
});
after(async () => {
  await provider.close();
  await stopBoss();
  await closeDb();
});

test("a discussion post that came before any report is grouped again when a report founds its fact", async () => {
  const { articleId: postId } = await upsertMaterial({ sourceId: SIGNAL, url: `https://example.com/sig-${T}-post`, title: `某基金会宣布启动 ${TOPIC} 项目`, via: "fetch", publishedAt: new Date() });
  await queueProcessing(postId);
  const queued = await job(postId);
  assert.deepEqual([queued?.name, queued?.priority, queued?.data.signalOnly], ["events.group", -1, true], "straight to grouping, behind reports");

  assert.deepEqual(await settleNonEditorial(postId), { group: true });
  assert.equal((await groupArticle(postId, { signalOnly: true })).verdict, "signal-unmatched");
  const [decided] = await sql<{ verdict: string }[]>`SELECT verdict FROM grouping_decisions WHERE article_id = ${postId}`;
  assert.equal(decided?.verdict, "signal-unmatched", "a post that found nothing is recorded as such");

  const reportId = await report("first", { title: `某基金会启动 ${TOPIC} 项目` });
  const founded = await groupArticle(reportId);
  assert.equal(founded.verdict, "new-story");
  assert.equal(founded.rematched, 1);
  assert.deepEqual([(await job(postId))?.name, (await job(postId))?.data.signalOnly], ["events.group", true]);

  // The worker takes the job; here the test decides it.
  const again = await groupArticle(postId, { signalOnly: true });
  assert.equal(again.verdict, "signal");
  assert.equal(again.storyId, founded.storyId);
});

test("history waits behind live work and founds no event; a new source's post from today is news", async () => {
  const old = await report("old", { title: `旧闻 ${T}`, backfill: "first-import", publishedAt: new Date(Date.now() - 30 * 86_400_000) });
  await queueProcessing(old, { step: "analyze" });
  assert.deepEqual([(await job(old))?.name, (await job(old))?.priority], ["content.analyze", -2]);
  // History may join a card (see the twin test below) but never founds one, and never becomes
  // evidence of attention: no story, no signal. The loose stub judge matches anything it is handed,
  // so the verdict itself is not asserted here — what history may not do is asserted instead.
  const storiesBefore = (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM stories`)[0]!.n;
  await groupArticle(old);
  assert.equal((await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM stories`)[0]!.n, storiesBefore, "history founds no story");
  assert.equal((await sql`SELECT 1 FROM story_signals WHERE article_id = ${old}`).length, 0, "history adds no heat");

  const fresh = await report("fresh", { title: `新闻 ${T}`, backfill: "first-import", publishedAt: new Date(Date.now() - 3_600_000) });
  await queueProcessing(fresh, { step: "analyze" });
  assert.equal((await job(fresh))?.priority, 0);
  assert.notEqual((await groupArticle(fresh)).verdict, "historical");
  assert.equal((await sql`SELECT 1 FROM fact_articles WHERE article_id = ${fresh}`).length, 1);
});

test("a backfilled copy of a case already on the site joins that card, and adds no heat", async () => {
  // The same case picked up again days later (a search result, a source's first import) used to be
  // published as its own card: one case stood three times in the feed.
  const title = `某基金会启动 ${TOPIC} 助学金`;
  const base = await report("twin-base", { title });
  const founded = await groupArticle(base);
  assert.ok(founded.storyId, "the live report has a story");
  const twin = await report("twin-old", { title, backfill: "first-import", publishedAt: new Date(Date.now() - 6 * 86_400_000) });
  const joined = await groupArticle(twin);
  assert.equal(joined.verdict, "historical-attached");
  assert.equal(joined.storyId, founded.storyId, "it joined the existing story");
  const [pub] = await sql<{ story_id: number | null }[]>`SELECT story_id FROM publications WHERE article_id = ${twin}`;
  assert.equal(Number(pub?.story_id), founded.storyId, "the two collapse into one card");
  assert.equal((await sql`SELECT 1 FROM story_signals WHERE article_id = ${twin}`).length, 0, "no heat from history");
});

test("a discussion post that quotes a post not yet collected joins its story when the original arrives", async () => {
  // A volunteer's post quoted a foundation's announcement a minute before it was collected; the
  // original then joined the fact a report had already founded (same-fact: no new fact, no rematch).
  const tweetId = `9${Date.now()}`;
  const { articleId: postId } = await upsertMaterial({
    sourceId: SIGNAL, url: `https://x.com/volunteer_kl/status/1${Date.now()}`, title: `项目上线了！${ALONE}`, via: "fetch", publishedAt: new Date(),
    xPost: { tweetId: `1${Date.now()}`, authorName: "志愿者", handle: "volunteer_kl", text: "项目上线了！", quoted: { authorName: "壹基金", handle: "onefoundation", text: "项目启动公告", url: `https://x.com/onefoundation/status/${tweetId}` } },
  });
  assert.deepEqual(await settleNonEditorial(postId), { group: true });
  assert.equal((await groupArticle(postId, { signalOnly: true })).verdict, "signal-unmatched");

  const first = await groupArticle(await report("quoted-first", { title: `壹基金启动 ${TOPIC} 项目` }));
  const { articleId: originalId } = await upsertMaterial({
    sourceId: EDITORIAL, url: `https://x.com/onefoundation/status/${tweetId}`, title: `壹基金启动 ${TOPIC} 儿童关爱项目`, bodyText: "公告。", bodyStatus: "ok",
    via: "fetch", publishedAt: new Date(), xPost: { tweetId, authorName: "壹基金", handle: "onefoundation", text: `壹基金启动 ${TOPIC} 儿童关爱项目` },
  });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, score, selected, output)
            VALUES (${originalId}, 1, 'rule', 'pass', 'policy', ${`壹基金启动 ${TOPIC} 项目`}, '摘要', 80, false, ${sql.json({ fact: { title: "儿童关爱项目" } })})`;
  const joined = await groupArticle(originalId);
  assert.equal(joined.verdict, "same-fact");
  assert.equal(joined.storyId, first.storyId);
  assert.equal(joined.reclaimed, 1);
  assert.equal((await job(postId))?.data.signalOnly, true);

  const again = await groupArticle(postId, { signalOnly: true });
  assert.deepEqual([again.verdict, again.storyId], ["signal-native", first.storyId]);
});
