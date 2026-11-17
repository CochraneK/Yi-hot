// The judging and writing steps (editorial/analyze.ts): the prefilter decides relevance, two scores
// against the tier threshold decide 精选; items that reach it are written by the content understanding
// and the rest by the title/summary prompts (selection.ts's understandFloor currently sits above the
// tier threshold, so it never adds anyone), a structure step gives the category, subjects
// and fact. Material with only a feed summary has its page fetched first. The steps run on the models
// AIHOT assigns them (set through the environment here); every prompt in the pack renders.
import { Reply, stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { analyzeArticle, SCORE_SYSTEM, tagsForVerifiedSubjects, tierThreshold, verifiedEntitySubjects } from "@aihot/backend/editorial/analyze";
import { queueProcessing } from "@aihot/backend/jobs/content";
import { QUEUES, stopBoss } from "@aihot/backend/jobs/queue";
import {
  clampEnds, compactAnswerFirstSummary, enforceIdentity, parseTranslateOutput, PREFILTER_HEAD_CHARS, PREFILTER_SYSTEM, PREFILTER_TAIL_CHARS, prefilterUser,
} from "@aihot/backend/editorial/writing";
import { promptText } from "@aihot/backend/editorial/prompts";
import { SITE } from "@aihot/industry/site";

const T = tag();
const SOURCE = `test-analyze-${T}`;
const X_SOURCE = `test-analyze-x-${T}`;
const SKIP_SOURCE = `test-analyze-skip-${T}`;

type Step = "prefilter" | "score" | "understand" | "summarize" | "structure";
interface Req { step: Step; marker: string; system: string; user: string; body: Record<string, any> }
const requests: Req[] = [];
const LEAK = 'We need to produce title_zh and summary_zh. First, understand the original title: 女童收到健康包。';
const MARKERS = ["NOTEJSON", "NOTEBODY", "CLEAR", "GEO", "RESCUE", "LOW", "FAINT", "OFFTOPIC", "BARE", "VAGUE", "THIN", "SENSITIVE", "SKIP", "DIRECT", "推文"];
// Fixture scores are picked to land on the intended side of 2 × the T1 threshold (2 × 35 = 70).
const scoreAnswers: Record<string, number[]> = { NOTEJSON: [78, 72], NOTEBODY: [30, 30], CLEAR: [78, 72], GEO: [79, 73], RESCUE: [56, 50], LOW: [30, 30], FAINT: [12], THIN: [70, 70], SENSITIVE: [80, 80], SKIP: [78, 72], DIRECT: [78, 72], 推文: [30, 30], BARE: [30, 34], VAGUE: [60, 62] };

const stepOf = (system: string, user: string): Step =>
  system.includes("宽召回的公益相关性预筛") ? "prefilter" : system.includes("事件注意力评分器") ? "score"
  : system.includes("内容理解编辑") ? "understand" : system.includes("资料结构化助手") ? "structure"
  : user.includes("title_zh") ? "summarize" : (() => { throw new Error("unknown request"); })();

// One stub stands in for DashScope (prefilter, structure), Zhipu (score, understand) and DeepSeek (summarize).
const provider = await stub((_hit, req) => {
  const body = JSON.parse(req.body) as { messages: Array<{ role: string; content: unknown }> } & Record<string, any>;
  const system = body.messages[0]!.role === "system" ? String(body.messages[0]!.content) : "";
  const last = body.messages[body.messages.length - 1]!.content;
  const user = typeof last === "string" ? last : JSON.stringify(last);
  const step = stepOf(system, user);
  const marker = MARKERS.find((m) => user.includes(m)) ?? "";
  requests.push({ step, marker, system, user, body });
  const answer = (content: unknown) => ({ id: `stub-${requests.length}`, model: "stub", choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
  if (step === "prefilter") return answer({ label: marker === "OFFTOPIC" || marker === "BARE" ? "BLOCK" : marker === "VAGUE" ? "UNKNOWN" : "PASS", reason: "测试" });
  if (step === "score") return answer({ attentionScore: scoreAnswers[marker]!.shift() });
  if (step === "summarize" && marker === "NOTEBODY") return answer(`title_zh: 女童收到健康包\nbody_zh: ${LEAK}`);
  if (step === "understand") {
    if (marker === "NOTEJSON") return answer({ itemType: "project_update", authorRole: "principal", tags: ["志愿者"], editorialJudgment: "介绍健康项目", titleZh: LEAK, summaryZh: LEAK });
    if (marker === "SENSITIVE") return new Reply(400, { contentFilter: [{ level: 1, role: "user" }], error: { code: "1301", message: "系统检测到输入或生成内容可能包含不安全或敏感内容" } });
    return answer({ itemType: "policy_release", authorRole: "principal", tags: ["政策/监管", "政策", "志愿者", "不存在的标签"], editorialJudgment: `理由 ${marker}`, titleZh: `理解标题 ${marker}`, summaryZh: `理解摘要 ${marker}。第二句补充一个关键数字。` });
  }
  if (step === "structure" && marker === "GEO") return answer({
    category: "policy", tags: ["政策/监管"], subjects: [],
    fact: { title: "举办活动", subject: null, action: "开展", object: "儿童教育项目", occurredAt: null },
    geography: [
      { place: "四川凉山", role: "event", evidence: "在四川凉山开展儿童教育项目" },
      { place: "北京", role: "publisher", evidence: "北京某公益组织" },
      { place: "火星", role: "event", evidence: "在火星开展教育项目" },
    ],
  });
  if (step === "structure") return answer({ category: "policy", tags: ["政策/监管", "养老服务"], subjects: ["ministry-of-civil-affairs", "unknown-co"], fact: { title: `事实 ${marker}`, subject: "某机构", action: "发布", object: "文件", occurredAt: null } });
  return answer(`title_zh: 翻译标题 ${marker}\nsummary_zh: 翻译摘要 ${marker}。第二句补充影响。`);
});
for (const env of ["DASHSCOPE_BASE_URL", "ZHIPU_BASE_URL", "DEEPSEEK_BASE_URL"]) process.env[env] = `${provider.url}/v1`;
for (const env of ["DASHSCOPE_API_KEY", "ZHIPU_API_KEY", "DEEPSEEK_API_KEY"]) process.env[env] = "test-key";
// AIHOT's own assignment of models to steps (the open-source default is one model for all of them).
Object.assign(process.env, { PREFILTER_MODEL: "qwen3.7-flash", SCORE_MODEL: "glm-5.3-flash-selection", UNDERSTAND_MODEL: "glm-5.3-flash", SUMMARIZE_MODEL: "deepseek-flash", STRUCTURE_MODEL: "qwen3.8-flash" });

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at, owner_entity_id, config) VALUES
    (${SOURCE}, 'Test analyze source', 'rss', 'T1', 'editorial', '2100-01-01', 'ministry-of-civil-affairs', '{}'::jsonb),
    (${X_SOURCE}, 'Test X account', 'x_search', 'T1', 'editorial', '2100-01-01', NULL, '{}'::jsonb),
    (${SKIP_SOURCE}, 'Test skip-prefilter source', 'search', 'T1', 'editorial', '2100-01-01', NULL, ${sql.json({ skipPrefilter: true } as never)})`;
});
after(async () => {
  await provider.close();
  await stopBoss();
  await closeDb();
});

// The tag keeps each material unique: identical input would reuse an earlier run's paid answers.
const LONG = "a foundation announced a new project with a budget table and beneficiary details. ".repeat(8);
const article = async (marker: string, extra: Record<string, unknown> = {}) =>
  (await upsertMaterial({
    sourceId: SOURCE, url: `https://example.com/${marker}-${T}`, title: `${marker} project update ${T}`, bodyText: `${marker}: ${LONG} (${T})`,
    bodyStatus: "ok", via: "fetch", publishedAt: new Date("2026-09-28T01:02:03Z"), ...extra,
  } as never)).articleId;
const skipArticle = async (marker: string) =>
  (await upsertMaterial({
    sourceId: SKIP_SOURCE, url: `https://example.com/${marker}-skip-${T}`, title: `${marker} project update ${T}`, bodyText: `${marker}: ${LONG} (${T})`,
    bodyStatus: "ok", via: "fetch", publishedAt: new Date("2026-09-28T01:02:03Z"),
  } as never)).articleId;
const calls = (marker: string) => requests.filter((r) => r.marker === marker).map((r) => r.step);
const row = async (id: string) =>
  (await sql<{ selected: boolean; relevance: string; score: string | null; title_zh: string; reason_zh: string | null; category: string | null; tags: string[]; subjects: string[]; receipt_ids: string[]; output: Record<string, any> }[]>`
    SELECT selected, relevance, score, title_zh, reason_zh, category, tags, subjects, receipt_ids, output FROM analyses WHERE article_id = ${id} ORDER BY id DESC LIMIT 1`)[0]!;

test("every prompt in the pack renders, and the site's name replaces AIHOT's", () => {
  const dir = new URL("../industry/prompts/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  // Every value any prompt asks for, so each renders on its own.
  const names = new Set(files.flatMap((f) => [...readFileSync(new URL(f, dir), "utf8").matchAll(/\{\{\s*([A-Za-z][\w.-]*)\s*\}\}/g)].map((m) => m[1]!)));
  const values = Object.fromEntries([...names].map((n) => [n, "x"]));
  for (const file of files) {
    const text = promptText(file.slice(0, -3), values);
    assert.ok(text.length > 20 && !/\{\{/.test(text), file);
  }
  assert.ok(PREFILTER_SYSTEM.startsWith(`为${SITE.name}做宽召回的公益相关性预筛`));
});

test("a selected item: prefilter, two scores, the content understanding and the structure", async () => {
  assert.equal(tierThreshold("T1"), 35);
  const id = await article("CLEAR");
  const res = await analyzeArticle(id);
  assert.deepEqual([res!.output!.selected, res!.output!.score], [true, 75], "78 + 72 = 150 ≥ 2 × 35");
  assert.deepEqual(calls("CLEAR").sort(), ["prefilter", "score", "score", "structure", "understand"]);
  const r = await row(id);
  assert.deepEqual([r.title_zh, r.reason_zh, r.category, r.receipt_ids.length], ["理解标题 CLEAR", "理由 CLEAR", "policy", 5]);
  assert.deepEqual(r.tags, ["政策", "志愿者", "其他领域", "民政部"], "vocabulary tags, fallback mission topic, and the subject's tag");
  assert.deepEqual(r.subjects, ["ministry-of-civil-affairs"]);
  assert.deepEqual([r.output.writer, r.output.itemType, r.output.prefilter.label, r.output.fact.title], ["understand", "policy_release", "PASS", "事实 CLEAR"]);
  const score = requests.find((q) => q.marker === "CLEAR" && q.step === "score")!;
  assert.match(score.user, /【标题】\nCLEAR project update/, "the score reads the original title, before any writing");
  assert.deepEqual([score.body.temperature, score.body.reasoning_effort, score.body.max_tokens], [1, "high", 65536]);
  const understand = requests.find((q) => q.marker === "CLEAR" && q.step === "understand")!;
  assert.ok(understand.user.startsWith("请按系统规则理解以下单篇材料，一次返回全部六个字段。"));
  assert.ok(understand.system.includes("【摘要答案前置规则") && understand.system.includes("【标题自洽规则"));
  const prefilter = requests.find((q) => q.marker === "CLEAR" && q.step === "prefilter")!;
  assert.ok(JSON.parse(prefilter.user).includes("【材料质量】"), "the material context, sent as a JSON string");
});

test("the existing structure call stores grounded geography candidates without an extra paid call", async () => {
  const id = await article("GEO", {
    title: "GEO 北京某公益组织在四川凉山开展儿童教育项目",
    bodyText: "北京某公益组织在四川凉山开展儿童教育项目，项目面向当地儿童。",
  });
  const res = await analyzeArticle(id);
  assert.equal(res!.output!.selected, true);
  assert.deepEqual(calls("GEO").sort(), ["prefilter", "score", "score", "structure", "understand"]);
  const r = await row(id);
  assert.equal(r.receipt_ids.length, 5, "no sixth geography model receipt");
  assert.deepEqual(r.output.geography.status, "candidate");
  assert.equal(r.output.geography.origin, "structure");
  assert.ok(Number.isInteger(r.output.geography.receiptId));
  assert.deepEqual(r.output.geography.candidates.map((v: { place: string; role: string }) => [v.place, v.role]),
    [["四川凉山", "event"], ["北京", "publisher"]], "unquoted 火星 location was rejected");
  const stored = await sql<{ place_text: string; role: string; review_status: string; analysis_id: number }[]>`
    SELECT place_text, role, review_status, analysis_id FROM geo_candidates WHERE article_id = ${id} ORDER BY id`;
  assert.deepEqual(stored.map((v) => [v.place_text, v.role, v.review_status]),
    [["四川凉山", "event", "pending"], ["北京", "publisher", "pending"]], "same structure call persisted unverified candidates");
  assert.ok(stored.every((v) => Number.isSafeInteger(v.analysis_id)));
});

test("an item that reaches the threshold is written like a selected one; below it is translated", async () => {
  const at = await analyzeArticle(await article("RESCUE"));
  assert.deepEqual([at!.output!.selected, at!.output!.reasonZh], [true, "理由 RESCUE"], "56 + 50 = 106 ≥ 2 × 35");
  const lowId = await article("LOW");
  const low = await analyzeArticle(lowId);
  assert.deepEqual([low!.output!.selected, low!.output!.titleZh, low!.output!.reasonZh], [false, "翻译标题 LOW", null], "30 + 30 = 60 < 2 × 35");
  assert.deepEqual(calls("LOW").sort(), ["prefilter", "score", "score", "structure", "summarize"]);
  const summarize = requests.find((q) => q.marker === "LOW" && q.step === "summarize")!;
  assert.equal(summarize.body.messages.length, 1, "the title/summary prompt is one user message");
  assert.equal(summarize.body.response_format, undefined, "answered in its own text format");
  assert.deepEqual((await row(lowId)).tags, ["政策", "养老服务", "其他领域", "民政部"], "structure tags include the fallback mission topic");
});

test("a first score far under the threshold: no second reading, no structure step", async () => {
  const id = await article("FAINT");
  const res = await analyzeArticle(id);
  // 12 sits 23 under the T1 threshold: the second opinion cannot lift it, and nothing that far down
  // is selected or listed, so only the cheap title/summary copy is still written.
  assert.deepEqual([res!.output!.selected, res!.output!.score, res!.output!.titleZh], [false, 12, "翻译标题 FAINT"]);
  assert.deepEqual(calls("FAINT").sort(), ["prefilter", "score", "summarize"]);
  const r = await row(id);
  assert.deepEqual([r.category, r.output.fact, r.receipt_ids.length], [null, null, 3], "no structure receipt, no fact frame");
});

test("a source whose queries already filter skips the prefilter and pays for no receipt", async () => {
  const id = await skipArticle("SKIP");
  const res = await analyzeArticle(id);
  // The step is not called at all, not called and ignored: the prefilter would have answered PASS.
  assert.deepEqual(calls("SKIP").sort(), ["score", "score", "structure", "understand"]);
  const r = await row(id);
  assert.deepEqual([res!.output!.selected, res!.output!.score], [true, 75], "78 + 72 = 150 ≥ 2 × 35");
  assert.deepEqual([r.output.prefilter.label, r.receipt_ids.length], ["PASS", 4], "one receipt fewer, and the record still says it passed");
  assert.match(r.output.prefilter.reason, /跳过预筛/, "the reason says why there is no receipt");
  // A source without the key still asks.
  const asked = await article("DIRECT", { url: `https://example.com/DIRECT-${T}`, title: `DIRECT project update ${T}` });
  await analyzeArticle(asked);
  assert.deepEqual(calls("DIRECT").sort(), ["prefilter", "score", "score", "structure", "understand"]);
});

test("the prefilter reads the opening and the closing of a long body, not a long opening", () => {
  const whole = "甲".repeat(3000);
  assert.equal(clampEnds(whole, 400, 400).length, 400 + 3 + 400, "the cut is marked, so the model sees it is not the whole body");
  assert.equal(clampEnds("乙".repeat(700), 400, 400), "乙".repeat(700), "a body that fits is sent whole");
  const a = {
    id: "x", revision: 1, title: "标题", url: "https://example.com/x", author: null, publishedAt: null, discoveredAt: new Date(),
    bodyText: whole, excerpt: null, bodyStatus: "ok", xPost: null, media: [],
    source: { name: "s", kind: "rss", tier: "T1", firstParty: false },
  } as never;
  const user = prefilterUser(a);
  assert.equal(user.split("甲".repeat(PREFILTER_HEAD_CHARS)).length - 1, 2, `the opening and the closing each appear (${PREFILTER_HEAD_CHARS}+${PREFILTER_TAIL_CHARS})`);
  assert.ok(!user.includes("甲".repeat(900)), "the middle, where the philanthropic wording sits, is not sent twice over");
});

test("the prefilter's BLOCK stops everything; UNKNOWN goes on like PASS", async () => {
  const off = await analyzeArticle(await article("OFFTOPIC"));
  assert.deepEqual([off!.output!.relevance, off!.output!.selected], ["block", false]);
  assert.deepEqual(calls("OFFTOPIC"), ["prefilter"]);
  // An UNKNOWN with material is judged and written like a PASS, up to 精选 (60 + 62 ≥ 2 × 35).
  const vagueId = await article("VAGUE");
  const vague = await analyzeArticle(vagueId);
  assert.deepEqual([vague!.output!.relevance, vague!.output!.selected, vague!.output!.titleZh], ["pass", true, "理解标题 VAGUE"]);
  assert.equal((await row(vagueId)).output.prefilter.label, "UNKNOWN", "the prefilter's own answer stays on record");
  // Nothing but a title and no page to fetch: the BLOCK counts as UNKNOWN and is scored, but the
  // translation writes nothing from a bare title, so it waits for material instead of being published.
  const bare = await analyzeArticle(await article("BARE", { bodyText: null, excerpt: null, bodyStatus: "none" }));
  assert.deepEqual([bare!.output!.relevance, bare!.output!.selected, bare!.output!.score], ["unknown", false, 32]);
  assert.deepEqual(calls("BARE").sort(), ["prefilter", "score", "score", "structure"]);
});

test("a feed summary alone: the article page is fetched first, then the whole article is judged", async () => {
  const id = await article("THIN", { bodyText: null, bodyStatus: "pending", excerpt: `THIN: a short feed summary (${T}).` });
  // The queue sends it to extraction although its source does not ask for full text (the safety net
  // does the same after a failed fetch, so extraction failures add up to "unconfirmed" and end).
  await queueProcessing(id);
  const [job] = await sql<{ name: string }[]>`SELECT name FROM pgboss.job WHERE data->>'articleId' = ${id}`;
  assert.equal(job?.name, QUEUES.extractBody);
  const first = await analyzeArticle(id);
  assert.deepEqual([first!.needsBody, first!.output], [true, null]);
  assert.deepEqual(calls("THIN"), [], "no model call before the page");
  assert.equal((await sql`SELECT 1 FROM analyses WHERE article_id = ${id}`).length, 0, "nothing committed");
  // What extraction does: the body lands as a new revision.
  await sql`UPDATE articles SET body_text = ${`THIN: ${LONG} (${T})`}, body_status = 'ok', revision = revision + 1 WHERE id = ${id}`;
  const second = await analyzeArticle(id);
  assert.deepEqual([second!.needsBody ?? false, second!.output!.selected], [false, true]);
});

test("a short post in Chinese is its own copy; a content-filter refusal is translated instead", async () => {
  // The tag rides as a hashtag, which the language check strips.
  // It scores 30 + 30 = 60 < 2 × 35, so it is not selected and takes the title/summary prompt path —
  // the one that hands a short Chinese post back verbatim instead of calling a model.
  const text = `推文：今天把社区志愿者排班表做成了在线表单，效果不错。#t${T}`;
  const { articleId } = await upsertMaterial({
    sourceId: X_SOURCE, url: `https://x.com/test/status/1${Date.now()}`, title: text, via: "fetch", publishedAt: new Date(),
    xPost: { tweetId: `1${Date.now()}`, authorName: "测试", handle: "test", text },
  });
  const post = await analyzeArticle(articleId);
  assert.deepEqual([post!.output!.titleZh, post!.output!.summaryZh], [text, text]);
  assert.ok(!calls("推文").includes("summarize"), "no translation call");
  const sensitive = await analyzeArticle(await article("SENSITIVE"));
  assert.deepEqual([sensitive!.output!.selected, sensitive!.output!.titleZh], [true, "翻译标题 SENSITIVE"]);
  assert.deepEqual(calls("SENSITIVE").filter((s) => s === "understand" || s === "summarize"), ["understand", "summarize"]);
});

test("understand JSON 与短推文 body_zh 的推理文本不会进入分析文案", async () => {
  const id = await article("NOTEJSON", { title: `NOTEJSON 女童收到健康包 ${T}` });
  const result = await analyzeArticle(id);
  assert.equal(result!.output!.titleZh, `NOTEJSON 女童收到健康包 ${T}`);
  assert.equal(result!.output!.summaryZh, "");
  assert.equal(result!.output!.relevance, "unknown");
  assert.equal((await row(id)).output.summaryZh, "");
  assert.equal(calls("NOTEJSON").filter((s) => s === "understand").length, 1);

  const text = `NOTEBODY Girls receive health kits ${T}`;
  const { articleId } = await upsertMaterial({
    sourceId: X_SOURCE, url: `https://x.com/test/status/NOTEBODY-${T}`, title: text, via: "fetch", publishedAt: new Date(),
    xPost: { tweetId: `NOTEBODY-${T}`, authorName: "测试", handle: "test", text },
  });
  const post = await analyzeArticle(articleId);
  assert.equal(post!.output!.summaryZh, "");
  assert.equal(post!.output!.relevance, "unknown");
  assert.ok(calls("NOTEBODY").includes("summarize"));
});

test("guards: an entity the input does not name is not written in; long summaries are cut at sentences", () => {
  const input = { title: "某基金会发布新项目", text: "某基金会发布了一个新项目，资金规模和受益人数都有说明。", sourceKind: "rss" };
  const guarded = enforceIdentity(input, { titleZh: "腾讯公益发布新项目", summaryZh: "某基金会发布新项目。" });
  assert.deepEqual([guarded.titleZh, guarded.summaryZh, guarded.identityGuard.outcome], ["某基金会发布新项目", "某基金会发布新项目。", "fallback"]);
  // The identity lexicon: a different spelling of an entity the input names is no invention.
  const alipay = { title: "蚂蚁集团公益上线新项目", text: "蚂蚁集团公益上线了一个新项目并公布资金流向。", sourceKind: "rss" };
  assert.equal(enforceIdentity(alipay, { titleZh: "支付宝公益上线新项目", summaryZh: "支付宝公益上线新项目并公布资金流向。" }).identityGuard.outcome, "pass");
  const long = "第一句交代了谁做了什么以及关键结果，这一句本身已经足够说明核心事件的来龙去脉。".repeat(3) + "第二句补充数字。".repeat(20);
  assert.ok(compactAnswerFirstSummary(long).length <= 190);
  assert.deepEqual(parseTranslateOutput("title_zh: 标题\nsummary_zh: 第一句。\n第二句。"), { titleZh: "标题", summaryZh: "第一句。\n第二句。", bodyZh: "" });
  assert.equal(parseTranslateOutput("title_zh: 标题\nbody_zh: 我们懂你。\n\n来源：X：壹基金 (@OneFoundation)").bodyZh, "我们懂你。", "a repeated prompt line is dropped");
  // A model that answers with English markdown labels instead of title_zh/summary_zh used to
  // fall through to the unlabelled path, which wrote "**Title:**" and "**Summary:**" into the
  // feed (7 publications, 2026-11-15/16).
  assert.deepEqual(
    parseTranslateOutput("**Title:** 中国青少年公益\n**Summary:** 2026-11-17 00:19 一场大赛在呼和浩特举行。"),
    { titleZh: "中国青少年公益", summaryZh: "2026-11-17 00:19 一场大赛在呼和浩特举行。", bodyZh: "" },
  );
  assert.deepEqual(
    parseTranslateOutput("标题：某基金会发布年报\n摘要：年报显示支出 1.2 亿元。"),
    { titleZh: "某基金会发布年报", summaryZh: "年报显示支出 1.2 亿元。", bodyZh: "" },
  );
});

test("organization subjects require source ownership or a headline mention", () => {
  const roundup = {
    title: "9月纪事：多场公益活动举行，行业报告发布",
    source: { ownerEntityId: null },
  };
  assert.deepEqual(
    verifiedEntitySubjects(roundup, ["save-the-children", "one-foundation", "unknown"]),
    [],
    "body-only mentions in a roundup do not populate organization topics",
  );
  assert.deepEqual(
    verifiedEntitySubjects({ ...roundup, source: { ownerEntityId: "save-the-children" } }, ["save-the-children"]),
    ["save-the-children"],
    "a first-party source keeps its own organization even when the headline omits the name",
  );
  assert.deepEqual(
    verifiedEntitySubjects({ title: "壹基金发布儿童平安计划年度进展", source: { ownerEntityId: null } }, []),
    ["one-foundation"],
    "a headline mention is deterministic even when the model omits the subject",
  );
  assert.deepEqual(
    tagsForVerifiedSubjects(["机构动态", "救助儿童会", "壹基金"], ["one-foundation"]),
    ["机构动态", "壹基金"],
    "entity display tags follow the same verified subject set",
  );
});

test("analysing the same revision again reuses every paid answer", async () => {
  scoreAnswers.CLEAR = [80, 70];
  const id = await article("CLEAR", { url: `https://example.com/CLEAR-again-${T}`, title: `CLEAR project update again ${T}` });
  const first = await analyzeArticle(id);
  assert.equal(first!.reused, false);
  const hits = provider.hits();
  const again = await analyzeArticle(id);
  assert.equal(provider.hits(), hits, "no new requests");
  assert.deepEqual([again!.reused, again!.receiptIds], [true, first!.receiptIds]);
});
