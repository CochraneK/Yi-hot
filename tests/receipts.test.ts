// Paid requests: an answer already received is reused, every request actually sent counts against the
// budget (retries of one logical request included), a lost answer is bought again at most once, and the
// valve stops calls before they are sent.
import { stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { z } from "zod";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { chatJson, finalContent, ModelOutputError } from "@aihot/backend/providers/llm";
import { parseTranslateOutput } from "@aihot/backend/editorial/writing";
import { embeddingsAvailable } from "@aihot/backend/providers/embeddings";
import { BudgetExceededError, paidRequest, ProviderRejectedError, ReceiptUnknownError } from "@aihot/backend/providers/receipts";
import { autoReleaseUnknownReceipts } from "@aihot/backend/admin/runs";

const usage = { prompt_tokens: 80, completion_tokens: 20, total_tokens: 100 };
let answer: (hit: number) => string = () => '{"ok":true}';
const provider = await stub((hit) => ({ id: `stub-${hit}`, choices: [{ message: { content: answer(hit) } }], usage }));
process.env.DEEPSEEK_BASE_URL = `${provider.url}/v1`;
process.env.DEEPSEEK_API_KEY = "test-key";

const ask = (subject: string) =>
  chatJson({ model: "deepseek-flash", purpose: "invariant_test", subject, promptVersion: "t1", system: "s", user: `input ${subject}`, schema: z.object({ ok: z.boolean() }) });

let savedBudget: { per_minute: number; per_hour: number; per_day: number } | undefined;
before(async () => {
  [savedBudget] = await sql<{ per_minute: number; per_hour: number; per_day: number }[]>`SELECT per_minute, per_hour, per_day FROM budgets WHERE service = 'deepseek'`;
});
after(async () => {
  if (savedBudget) await sql`UPDATE budgets SET per_minute = ${savedBudget.per_minute}, per_hour = ${savedBudget.per_hour}, per_day = ${savedBudget.per_day} WHERE service = 'deepseek'`;
  await provider.close();
  await closeDb();
});

test("the migrations seed a budget for every paid service", async () => {
  const rows = await sql<{ service: string }[]>`SELECT service FROM budgets`;
  const services = new Set(rows.map((r) => r.service));
  for (const s of ["jina", "socialdata", "dajiala", "zhipu", "deepseek", "mimo", "dashscope"]) assert.ok(services.has(s), `no budget for ${s}`);
});

test("an answer already received is reused instead of bought again", async () => {
  answer = () => '{"ok":true}';
  const subject = `reuse-${tag()}`;
  const before = provider.hits();
  const first = await ask(subject);
  const second = await ask(subject);
  assert.equal(provider.hits() - before, 1);
  assert.equal(first.reused, false);
  assert.equal(second.reused, true);
  assert.equal(second.receiptId, first.receiptId);
});

test("生产回执140569形态：截断推理被复制到正文时拒绝解析并使用已有备用模型", async () => {
  const reasoning = 'We need to produce title_zh and summary_zh.\n\nFirst, understand the original title: "女童收到健康包".';
  const title = "女童收到健康包";
  const summary = "公益项目为女童提供健康用品与青春期健康知识，帮助她们了解身体变化，培养健康生活习惯。";
  const good = `title_zh: ${title}\nsummary_zh: ${summary}`;
  const saved = Object.fromEntries(["ANYDOOR_BASE_URL", "ANYDOOR_API_KEY", "LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL"].map((key) => [key, process.env[key]]));
  let badResponse: unknown;
  const broken = await stub(() => badResponse);
  const backup = await stub(() => ({ choices: [{ finish_reason: "stop", message: { content: good } }], usage }));
  Object.assign(process.env, { ANYDOOR_BASE_URL: broken.url, ANYDOOR_API_KEY: "test-key", LLM_BASE_URL: backup.url, LLM_API_KEY: "test-key", LLM_MODEL: "test-backup" });
  try {
    for (const [name, choice] of [
      ["token-exhausted", { finish_reason: "length", message: { content: reasoning, reasoning_content: reasoning } }],
      ["reasoning-duplicated", { finish_reason: "stop", message: { content: reasoning, reasoning_content: reasoning } }],
      ["reasoning-prefixed", { finish_reason: "stop", message: { content: `${reasoning}\n${good}`, reasoning_content: reasoning } }],
      ["valid-json-truncated", { finish_reason: "length", message: { content: '{"titleZh":"女童收到健康包","summaryZh":"健康教育"}' } }],
    ] as const) {
      badResponse = { model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", choices: [choice], usage: { completion_tokens: 2048, completion_tokens_details: { reasoning_tokens: 2048 } } };
      const subject = `copy-boundary-${name}-${tag()}`;
      const parsedInputs: string[] = [];
      const result = await chatJson({ model: "anydoor-auto", purpose: "summarize_article", subject, promptVersion: "copy-boundary-test", system: "", user: subject, maxTokens: 2048,
        schema: z.object({ titleZh: z.string(), summaryZh: z.string(), bodyZh: z.string() }),
        parse: (content) => { parsedInputs.push(content); return parseTranslateOutput(content); },
      });
      assert.equal(result.model, "default");
      assert.deepEqual(result.data, { titleZh: title, summaryZh: summary, bodyZh: "" });
      assert.deepEqual(parsedInputs, [good], "错误信封不能进入宽松首行解析");
      const rows = await sql<{ service: string; status: string; response: unknown }[]>`SELECT service, status, response FROM receipts WHERE subject = ${subject} ORDER BY id`;
      assert.deepEqual(rows.map((r) => [r.service, r.status]), [["anydoor", "failed"], ["llm", "received"]]);
      assert.deepEqual(rows[0]!.response, { ...(badResponse as object), _latencyMs: (rows[0]!.response as { _latencyMs: number })._latencyMs }, "保留原始故障响应供审计");
    }
    assert.equal(broken.hits(), 4);
    assert.equal(backup.hits(), 4, "每次故障只使用现有的一次备用调用");
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await broken.close();
    await backup.close();
  }
});

test("正常专业正文、分离推理与无完成原因的兼容响应保留", () => {
  const content = "title_zh: 公益机构发布健康用品生产质量研究\nsummary_zh: 研究分析生产流程及健康教育效果，说明数据和推理方法。";
  assert.equal(finalContent({ choices: [{ finish_reason: "stop", message: { content, reasoning_content: "检查材料，组织摘要。" } }] }), content);
  assert.equal(finalContent({ choices: [{ message: { content } }] }), content);
  for (const choice of [
    { finish_reason: "stop", message: { content: null, reasoning_content: "只有推理" } },
    { finish_reason: "stop", message: { content: [] } },
    { finish_reason: "content_filter", message: { content } },
    { finish_reason: "tool_calls", message: { content } },
  ]) assert.throws(() => finalContent({ choices: [choice] }), ModelOutputError);
});

test("retries of unusable answers stop at the budget, and every request sent is counted", async () => {
  answer = () => "sorry, not json";
  const subject = `budget-${tag()}`;
  // Leave room for exactly two more requests in every window.
  const [c] = await sql<{ minute: number; hour: number; day: number }[]>`
    SELECT count(*) FILTER (WHERE started_at > now() - interval '1 minute')::int AS minute,
           count(*) FILTER (WHERE started_at > now() - interval '1 hour')::int AS hour,
           count(*)::int AS day
    FROM receipt_attempts WHERE service = 'deepseek' AND origin = 'live' AND started_at > now() - interval '1 day'`;
  await sql`UPDATE budgets SET per_minute = ${c!.minute + 2}, per_hour = ${c!.hour + 2}, per_day = ${c!.day + 2} WHERE service = 'deepseek'`;

  const before = provider.hits();
  const outcomes: string[] = [];
  for (let i = 0; i < 5; i++) {
    // What a job retry does: the same logical request again.
    await ask(subject).then(
      () => outcomes.push("ok"),
      (error: unknown) => outcomes.push(error instanceof ModelOutputError ? "unusable" : error instanceof BudgetExceededError ? "budget" : String(error)),
    );
  }
  assert.equal(provider.hits() - before, 2, "requests sent");
  assert.deepEqual(outcomes, ["unusable", "unusable", "budget", "budget", "budget"]);
  const attempts = await sql<{ status: string; tokens: number }[]>`
    SELECT a.status, (a.usage->>'total_tokens')::int AS tokens
    FROM receipt_attempts a JOIN receipts r ON r.id = a.receipt_id WHERE r.subject = ${subject} ORDER BY a.attempt`;
  assert.deepEqual(attempts.map((a) => a.tokens), [100, 100], "each attempt keeps its own usage");
});

test("with the valve off nothing is sent", async () => {
  config.modelCallsEnabled = false;
  try {
    const before = provider.hits();
    await assert.rejects(ask(`valve-${tag()}`), /disabled/);
    assert.equal(provider.hits(), before);
    process.env.DASHSCOPE_API_KEY = "test-key";
    assert.equal(embeddingsAvailable(), false);
  } finally {
    config.modelCallsEnabled = true;
    delete process.env.DASHSCOPE_API_KEY;
  }
});

test("an unknown outcome is released automatically once, so a lost answer costs at most one repeat", async () => {
  // A service without a budget row: the budget tests above may have used up deepseek's.
  const req = { service: "invariant-unbudgeted", purpose: "invariant_test", subject: `lost-${tag()}`, identity: { lost: tag() } };
  let sent = 0;
  const lost = () => {
    sent += 1;
    return Promise.reject(new Error("socket hang up after sending"));
  };
  const status = async () => (await sql<{ status: string }[]>`SELECT status FROM receipts WHERE subject = ${req.subject}`)[0]!.status;
  const age = () => sql`UPDATE receipts SET updated_at = now() - interval '31 minutes' WHERE subject = ${req.subject}`;

  await assert.rejects(paidRequest(req, lost));
  assert.equal(await status(), "unknown");
  await autoReleaseUnknownReceipts();
  assert.equal(await status(), "unknown", "not within half an hour");

  await age();
  await autoReleaseUnknownReceipts();
  assert.equal(await status(), "failed");
  await assert.rejects(paidRequest(req, lost));
  assert.equal(sent, 2, "one repeat after the release");

  await age();
  await autoReleaseUnknownReceipts();
  assert.equal(await status(), "unknown", "a second loss waits for the admin");
  await assert.rejects(paidRequest(req, lost), ReceiptUnknownError);
  assert.equal(sent, 2);
});

test("a spending refusal stops that model for a cooldown instead of failing every article", async () => {
  // A service without a budget row, so only the stop can hold calls back.
  const service = "invariant-spend";
  const model = "invariant-model";
  const key = `provider.stop.${service}:${encodeURIComponent(model)}`;
  const req = () => ({ service, model, purpose: "invariant_test", subject: `spend-${tag()}`, identity: { at: tag() } });
  const calls: string[] = [];
  const refuse = () => {
    calls.push("refused");
    return Promise.reject(new ProviderRejectedError('HTTP 402: {"error":{"message":"Insufficient Balance"}}', 402, false));
  };
  const accept = () => {
    calls.push("accepted");
    return Promise.resolve({ response: { ok: true } });
  };

  await assert.rejects(paidRequest(req(), refuse), ProviderRejectedError);
  const [stop] = await sql<{ value: { until: string } }[]>`SELECT value FROM settings WHERE key = ${key}`;
  assert.ok(stop, "the refusal leaves a stop");
  assert.ok(Date.parse(stop!.value.until) > Date.now(), "the stop runs into the future");

  // Inside the cooldown the next article waits as a budget window, not as a terminal failure.
  await assert.rejects(paidRequest(req(), accept), (error: unknown) =>
    error instanceof BudgetExceededError && error.window === "provider" && error.retryAfterSeconds > 0);
  assert.deepEqual(calls, ["refused"], "nothing else was sent during the cooldown");

  // The cooldown runs out on its own: an expired stop holds nothing back.
  await sql`UPDATE settings SET value = ${JSON.stringify({ until: new Date(Date.now() - 1_000).toISOString() })}::jsonb WHERE key = ${key}`;
  await paidRequest(req(), accept);
  assert.deepEqual(calls, ["refused", "accepted"], "the expired stop let the call through");
  const remaining = await sql`SELECT key FROM settings WHERE key = ${key}`;
  assert.equal(remaining.length, 0, "a received answer clears the stop");
});

test("a plain rate limit is not a spending refusal, so it stops nothing", async () => {
  const service = "invariant-throttle";
  const model = "invariant-model";
  const key = `provider.stop.${service}:${encodeURIComponent(model)}`;
  const req = { service, model, purpose: "invariant_test", subject: `throttle-${tag()}`, identity: { at: tag() } };
  const throttled = () => Promise.reject(new ProviderRejectedError('HTTP 429: {"error":{"code":"rate_limit_exceeded"}}', 429, true));

  await assert.rejects(paidRequest(req, throttled), ProviderRejectedError);
  const rows = await sql`SELECT key FROM settings WHERE key = ${key}`;
  assert.equal(rows.length, 0, "a throttle holds no stop");
});
