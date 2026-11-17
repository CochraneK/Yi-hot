import assert from "node:assert/strict";
import { test } from "node:test";
import { usableCopy } from "../packages/backend/src/lib/text.ts";
import { finalizeCopy, parseTranslateOutput } from "../packages/backend/src/editorial/writing.ts";

const title = '涞水县1542名女童收到“春蕾健康包”';
const summary = '涞水县1542名女童收到“春蕾健康包”，项目提供健康用品与相关知识，帮助女童了解青春期健康。';
const leak = `We need to produce title_zh and summary_zh. First, understand the original title: "${title}". That's the original title. It indicates。`;
const input = { title, text: summary, sourceKind: "rss" };
const notes = [
  leak,
  'First, understand the original title: 女童收到健康包。',
  '我们需要生成 title_zh 和 summary_zh，原文介绍公益项目。',
  '女童收到健康包。 <think>需要先分析材料。</think>',
  'I need to write title_zh，原文讲述女童健康项目。',
  'Let’s understand the original title: 女童收到健康包。',
  '首先，我们需要生成中文标题和中文摘要，原文讲述女童健康项目。',
  '首先，分析原始标题：女童收到健康包。',
  '<think>需要先分析材料。</think>女童收到健康包。',
  '</think>女童收到健康包。',
];

for (const note of notes) {
  test(`任务自述不能作为任何文案字段：${note.slice(0, 35)}`, () => {
    for (const kind of ["title", "summary", "body"] as const) assert.equal(usableCopy(note, kind), "");
    const parsed = parseTranslateOutput(`title_zh: ${note}\nsummary_zh: ${note}\nbody_zh: ${note}`);
    assert.deepEqual(parsed, { titleZh: "", summaryZh: "", bodyZh: "" });
    const result = finalizeCopy(input, { titleZh: note, summaryZh: note });
    assert.equal(result.titleZh, title);
    assert.equal(result.summaryZh, "");
  });
}

test("understand JSON 的文案经共用出口检测；英文原题不伪造中文兜底", () => {
  const draft = JSON.parse(JSON.stringify({ titleZh: leak, summaryZh: leak }));
  const result = finalizeCopy({ ...input, title: "Girls receive health kits" }, draft);
  assert.equal(result.titleZh, "");
  assert.equal(result.summaryZh, "");
});

test("多行摘要和正文的尾部 think 标记不能绕过，合法首行标题保留", () => {
  const note = '女童收到健康包。\n<think>需要先分析材料。';
  assert.equal(usableCopy(note, "summary"), "");
  const parsed = parseTranslateOutput(`title_zh: ${title}\nsummary_zh: ${note}\nbody_zh: ${note}`);
  assert.deepEqual(parsed, { titleZh: title, summaryZh: "", bodyZh: "" });
});

test("压缩前检查完整摘要，包括可能被裁掉的尾部推理", () => {
  const result = finalizeCopy(input, { titleZh: title, summaryZh: summary.repeat(6) + '\n' + leak });
  assert.equal(result.titleZh, title);
  assert.equal(result.summaryZh, "");
});

test("body_zh 不能绕过到短推文摘要，正常正文保留段落", () => {
  const parsed = parseTranslateOutput(`title_zh: ${title}\nbody_zh: ${leak}`);
  assert.equal(parsed.bodyZh || parsed.summaryZh, "");
  assert.equal(parseTranslateOutput(`body_zh: ${summary}\n\n第二段介绍健康知识。`).bodyZh, `${summary}\n\n第二段介绍健康知识。`);
});

for (const normal of [
  title,
  summary,
  'First 项目为女童提供健康教育，下一阶段将开展家长课堂。',
  'First, volunteers distributed health kits. 女童同时参加健康课堂。',
  '志愿者表示：“我们需要生成中文标题和中文摘要，方便读者查阅。”',
  '报道引用讲师的话：“We need to produce title_zh and summary_zh.”并介绍课程安排。',
  '培训介绍 title_zh 和 summary_zh 字段，并演示如何填写。',
  'We will produce health kits. 女童同时参加健康课堂。',
  'Let’s understand the health needs. 项目开展需求调研。',
  '讲师解释“<think>”标签的含义，提醒学员核验生成内容。',
]) {
  test(`正常报道与引语保留：${normal.slice(0, 35)}`, () => {
    for (const kind of ["title", "summary", "body"] as const) assert.equal(usableCopy(normal, kind), normal);
  });
}

test("正常文案仍经过长度与身份规则", () => {
  const result = finalizeCopy(input, { titleZh: title, summaryZh: summary });
  assert.equal(result.titleZh, title);
  assert.equal(result.summaryZh, summary);
  assert.equal(result.identityGuard.outcome, "pass");
});
