// 队列可持续：入稿长期大于处理能力时，历史稿要在花钱之前退出，而不是无限排队。
//
// 判据不是「有没有排队」，而是「同样的入稿速度下，积压会不会一路涨」。所以这里验证的是
// 三条闸门的顺序与结果：日上限、积压上限、最长等待，以及例外通道（政策/司法/研究永不挡）。
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { getBoss, stopBoss } from "@aihot/backend/jobs/queue";
import { admitHistory, archiveArticle, worthHistory } from "@aihot/backend/jobs/capacity";
import { archiveExpiredHistory, requeueArchived } from "@aihot/backend/jobs/content";

const T = tag();
const SOURCE = `test-capacity-${T}`;

async function article(id: string, opts: { publishedDaysAgo?: number; title?: string; backfill?: boolean } = {}): Promise<void> {
  const days = opts.publishedDaysAgo ?? 30;
  const backfill = opts.backfill ?? days > 2;
  await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, published_at, timeline_at,
                                  revision, content_hash, body_text, body_status, processing_state, backfill, backfill_reason, created_at)
            VALUES (${id}, ${SOURCE}, ${id}, ${`https://example.com/${id}`}, ${opts.title ?? `title ${id}`},
                    now() - interval '1 hour', now() - make_interval(days => ${days}), now(),
                    1, NULL, 'body', 'ok', 'new',
                    ${backfill}, ${backfill ? "first-import" : null}, now() - interval '1 hour')`;
}

const state = async (id: string) =>
  (await sql<{ processing_state: string; archive_reason: string | null }[]>`
     SELECT processing_state, archive_reason FROM articles WHERE id = ${id}`)[0]!;

before(async () => {
  await getBoss();
  await sql`INSERT INTO sources (id, name, kind, next_fetch_at) VALUES (${SOURCE}, 'Test capacity', 'rss', '2100-01-01')`;
  process.env.HISTORY_DAILY_MAX = "2";
  process.env.HISTORY_BACKLOG_MAX = "100000";
  process.env.HISTORY_MAX_WAIT_HOURS = "100000";
  process.env.DAILY_ANALYZE_QUOTA = "100000";
});

after(async () => {
  for (const k of ["HISTORY_DAILY_MAX", "HISTORY_BACKLOG_MAX", "HISTORY_MAX_WAIT_HOURS", "DAILY_ANALYZE_QUOTA"]) delete process.env[k];
  await sql`DELETE FROM articles WHERE source_id = ${SOURCE}`;
  await sql`DELETE FROM sources WHERE id = ${SOURCE}`;
  await stopBoss();
  await closeDb();
});

test("policy and judicial titles always pass the capacity gate", () => {
  assert.equal(worthHistory("《未成年人保护法》修订草案提请审议"), true);
  assert.equal(worthHistory("最高人民法院发布涉未成年人司法保护典型案例"), true);
  assert.equal(worthHistory("中国儿童发展报告 2026 发布"), true);
  assert.equal(worthHistory("某县开展暑期夏令营活动"), false);
});

test("history beyond the daily allowance is archived before any paid call", async () => {
  // 当日完成数从库里读，放行数在内存里累加；这里把这一天的历史放行额度用完。
  await sql`DELETE FROM analyses WHERE article_id LIKE ${`cap-${T}-%`}`;
  const ids = [`cap-${T}-1`, `cap-${T}-2`, `cap-${T}-3`];
  let admitted = 0;
  const archived: string[] = [];
  for (const id of ids) {
    const verdict = await admitHistory(`某地公益组织开展志愿服务 ${id}`);
    if (verdict.admit) admitted += 1;
    else archived.push(verdict.reason);
  }
  assert.equal(admitted, 2, "HISTORY_DAILY_MAX=2 lets exactly two through");
  assert.deepEqual(archived, ["quota"], "the third is stopped by the quota, not by anything else");
});

test("the daily allowance survives a snapshot refresh", async () => {
  // 回归：放行数早先跟着一分钟一次的快照一起清零，等于把「每天 2 篇」放宽成「每分钟 2 篇」。
  // 这里换一天先把计数归零，然后在同一个自然日里跨过多次快照刷新，上限必须一直成立。
  const day0 = Date.now() + 24 * 3600_000;
  const admits: boolean[] = [];
  for (let i = 0; i < 4; i += 1) {
    // 每次前进 90 秒，越过快照 60 秒的有效期，强制重算。
    admits.push((await admitHistory(`某地公益组织开展志愿服务 refresh-${i}`, day0 + i * 90_000)).admit);
  }
  assert.deepEqual(admits, [true, true, false, false], "a refreshed snapshot must not hand out a new allowance");
});

test("archiving keeps the article and records why", async () => {
  const id = `cap-${T}-arc`;
  await article(id);
  await archiveArticle(id, "quota");
  const s = await state(id);
  assert.equal(s.processing_state, "archived");
  assert.equal(s.archive_reason, "quota");
  const [row] = await sql<{ body_text: string | null }[]>`SELECT body_text FROM articles WHERE id = ${id}`;
  assert.equal(row!.body_text, "body", "the original material is kept, only the paid analysis is skipped");
});

test("max wait archives stale backlog but never the exception titles", async () => {
  process.env.HISTORY_MAX_WAIT_HOURS = "1";
  const stale = `cap-${T}-stale`;
  const policy = `cap-${T}-policy`;
  await article(stale, { publishedDaysAgo: 30, title: "某县开展暑期夏令营活动" });
  await article(policy, { publishedDaysAgo: 30, title: "未成年人保护法执法检查报告" });
  await sql`UPDATE articles SET discovered_at = now() - interval '10 hours' WHERE id IN (${stale}, ${policy})`;

  const { archived } = await archiveExpiredHistory(Date.now(), 10);
  assert.ok(archived >= 1, "at least the plain one is archived");
  assert.equal((await state(stale)).processing_state, "archived");
  assert.equal((await state(stale)).archive_reason, "stale-wait");
  assert.equal((await state(policy)).processing_state, "new", "a policy report stays, however long it waits");
});

test("archived articles can be put back with one call", async () => {
  const id = `cap-${T}-back`;
  await article(id);
  await archiveArticle(id, "backlog");
  assert.equal((await state(id)).processing_state, "archived");
  await requeueArchived("backlog", 5);
  const s = await state(id);
  assert.notEqual(s.processing_state, "archived", "the article leaves the archive");
  assert.equal(s.archive_reason, null);
});
