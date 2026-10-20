// EveryInfra 小红书（json_list 适配器 everyinfra_xhs）对着本地桩测：一次带回执的列表调用、
// 笔记按链接/作者/时间映射、公开互动数只收数字、详情预算耗尽时保住已付费的列表结果。
import { stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { collectSource } from "@aihot/backend/sources/collect";
import { assertSupportedConfig } from "@aihot/backend/sources/config-keys";
import { fetchJsonList } from "@aihot/backend/sources/json-list";

const T = tag();
const SOURCE = `test-xhs-${T}`;

// 列表返回两条：一条完整（含字符串形态的分享数，应被丢弃），一条没有链接（应被跳过）。
const provider = await stub((_hit, req) => {
  assert.equal(req.url, "/api/v1/social");
  return {
    id: `req-${T}`,
    billing: { charged: true, charged_usd: 0.005556 },
    results: [
      {
        id: `n1-${T}`, url: `https://www.xiaohongshu.com/explore/n1-${T}`, title: `乡村小学阅读角落成 ${T}`,
        text: `壹基金联合捐赠人建的阅读角启用 ${T}`, author_name: "公益号", posted_at: "2026-10-16T08:00:00+00:00",
        like_count: 120, collect_count: 40, comment_count: 10, share_count: "5",
      },
      { id: `n2-${T}`, url: "", title: "没有链接的笔记" },
    ],
  };
});
process.env.EVERYINFRA_BASE_URL = provider.url;
process.env.EVERYINFRA_API_KEY = "test-key";
config.allowPrivateNetworkFetch = true; // 桩监听 127.0.0.1

const CONFIG = {
  adapter: "everyinfra_xhs", everyinfraAction: "search",
  everyinfraParams: { keyword: `公益项目 ${T}`, date_range: "last_7_days", sort: "newest" },
  summaryIsBody: true,
};

let savedBudget: { per_day: number } | null = null;
before(async () => {
  savedBudget = (await sql<{ per_day: number }[]>`SELECT per_day FROM budgets WHERE service = 'everyinfra'`)[0] ?? null;
  await sql`INSERT INTO sources (id, name, kind, config, tier, participation_mode, cursor, next_fetch_at)
            VALUES (${SOURCE}, 'Test XHS', 'json_list', ${sql.json(CONFIG)}, 'T2', 'editorial',
                    ${sql.json({ lastCheckedAt: new Date().toISOString() })}, '2100-01-01')`;
});
after(async () => {
  if (savedBudget) await sql`UPDATE budgets SET per_day = ${savedBudget.per_day} WHERE service = 'everyinfra'`;
  else await sql`DELETE FROM budgets WHERE service = 'everyinfra'`;
  await provider.close();
  await stopBoss();
  await closeDb();
});

test("everyinfra_xhs 的配置被接受，缺 key 时给出明确错误", async () => {
  assertSupportedConfig("json_list", { ...CONFIG, ingestNoiseFilter: { requireMarkers: ["公益"], dropMarkers: ["带货"] } });
  const key = process.env.EVERYINFRA_API_KEY;
  delete process.env.EVERYINFRA_API_KEY;
  await assert.rejects(fetchJsonList({ id: SOURCE, config: CONFIG, cursor: null } as never), /EVERYINFRA_API_KEY 未配置/);
  process.env.EVERYINFRA_API_KEY = key;
});

test("一次关键词搜索变成候选：链接、作者、时间、正文与只收数字的互动数，一个回执", async () => {
  const found = await fetchJsonList({ id: SOURCE, config: CONFIG, cursor: null } as never);
  assert.equal(found.length, 1, "没有链接的笔记被跳过");
  const [note] = found;
  assert.equal(note!.url, `https://www.xiaohongshu.com/explore/n1-${T}`);
  assert.equal(note!.author, "公益号");
  assert.equal(note!.publishedAt?.toISOString(), "2026-10-16T08:00:00.000Z");
  assert.equal(note!.bodyText, `壹基金联合捐赠人建的阅读角启用 ${T}`);
  assert.deepEqual(note!.raw, { externalId: `n1-${T}`, like_count: 120, collect_count: 40, comment_count: 10 }, "不是数字的互动数不入库");
  const [receipt] = await sql<{ status: string; cost: string }[]>`
    SELECT status, cost FROM receipts WHERE service = 'everyinfra' AND subject = ${SOURCE} ORDER BY id DESC LIMIT 1`;
  assert.equal(receipt!.status, "received");
  assert.equal(Number(receipt!.cost), 0.005556, "按 provider 返回的真实金额记账");
});

test("详情预算耗尽时断开而不是整批回滚：已付费的列表结果照常入库", async () => {
  // 每天 1 次：列表用掉当天额度后，随后的详情调用被预算挡下，列表结果必须保留。
  await sql`DELETE FROM receipt_attempts WHERE service = 'everyinfra' AND started_at >= current_date`;
  await sql`UPDATE budgets SET per_day = 1 WHERE service = 'everyinfra'`;
  await sql`INSERT INTO sources (id, name, kind, config, tier, participation_mode, cursor, next_fetch_at)
            VALUES (${`${SOURCE}-detail`}, 'Test XHS detail', 'json_list', ${sql.json({ ...CONFIG, everyinfraDetail: true })}, 'T2', 'editorial',
                    ${sql.json({ lastCheckedAt: new Date().toISOString() })}, '2100-01-01')
            ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config`;
  const out = await collectSource(`${SOURCE}-detail`, { force: true });
  assert.equal(out.status, "ok", "预算挡下详情不应让整次采集失败");
  const stored = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM articles WHERE source_id = ${`${SOURCE}-detail`}`;
  assert.equal(stored[0]!.n, 1, "列表结果入库");
  const attempts = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM receipt_attempts WHERE service = 'everyinfra' AND started_at >= current_date`;
  assert.equal(attempts[0]!.n, 1, "只有列表那一次真正发出去了");
});
