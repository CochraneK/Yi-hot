#!/usr/bin/env node
// Validates the reader-facing release notes in industry/changelog.json.
//
// Why this exists: `latestVersion` drives the unread dot in the sidebar
// (Sidebar.useChangelogDot compares it against what the reader last opened), and the page groups
// entries in array order rather than sorting them. So the two easiest mistakes — adding an entry
// above but forgetting latestVersion, or appending a newer entry at the bottom — either leave the
// dot dark or list the newest change at the end of the page. Neither throws; both just look wrong
// quietly. This check turns them into a failing command.
//
// Usage: node scripts/changelog-check.mjs [--file <path>]
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KINDS = new Set(["更新", "优化", "公告", "下线"]);
// Shape, not just validity. A release note a reader can take in at a glance: a short headline and at
// most three sentences, each one fact. The long lines this check exists to stop were the ones that
// explained how the site works internally ("to avoid double billing", "the listing's day would
// overwrite it") — facts about the build, not about what the reader now gets. The numbers below are
// where the two reference sites sit (PsyHOT: 12-char titles, 43-char sentences, 69 at the longest).
const MAX_TITLE_CHARS = 32;
const MAX_BODY_LINES = 3;
const MAX_BODY_CHARS = 70;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
/** Bold markers are layout, not prose: they count for nothing. */
const visibleLength = (s) => s.replace(/\*\*/g, "").trim().length;

const argFile = process.argv.indexOf("--file");
const file = argFile > -1 ? process.argv[argFile + 1] : join(ROOT, "industry/changelog.json");

const problems = [];
const fail = (where, msg) => problems.push(`${where}: ${msg}`);

const raw = readFileSync(file, "utf8");
let doc;
try {
  doc = JSON.parse(raw);
} catch (error) {
  console.error(`无法解析 ${file}: ${error.message}`);
  process.exit(1);
}

const releases = doc.releases;
if (!Array.isArray(releases) || releases.length === 0) {
  console.error(`${file} 里没有 releases 数组或为空`);
  process.exit(1);
}
if (typeof doc.latestVersion !== "string") fail("latestVersion", "缺失或不是字符串");

// Beijing "today", so an entry dated tomorrow's local time is not flagged by a UTC clock.
const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

let prev = null;
releases.forEach((r, i) => {
  const where = `releases[${i}]`;
  const keys = Object.keys(r).sort().join(",");
  if (keys !== "body,date,kind,time,title") fail(where, `字段应为 date/time/kind/title/body，实际 ${keys}`);
  if (!DATE_RE.test(r.date ?? "")) fail(where, `date 格式应为 YYYY-MM-DD，实际 ${r.date}`);
  if (!TIME_RE.test(r.time ?? "")) fail(where, `time 格式应为 HH:MM，实际 ${r.time}`);
  if (!KINDS.has(r.kind)) fail(where, `kind 只能是 ${[...KINDS].join(" / ")}，实际 ${r.kind}`);
  if (!r.title?.trim()) fail(where, "title 为空");
  if (visibleLength(r.title ?? "") > MAX_TITLE_CHARS) fail(where, `title 有 ${visibleLength(r.title)} 字，超过 ${MAX_TITLE_CHARS}，写清变了什么就够`);
  if (!Array.isArray(r.body) || r.body.length === 0) fail(where, "body 应为非空数组");
  else {
    if (r.body.length > MAX_BODY_LINES) fail(where, `body 有 ${r.body.length} 行，最多 ${MAX_BODY_LINES} 行`);
    r.body.forEach((line, j) => {
      if (typeof line !== "string" || !line.trim()) fail(where, `body[${j}] 为空`);
      else if (visibleLength(line) > MAX_BODY_CHARS) fail(where, `body[${j}] 有 ${visibleLength(line)} 字，超过 ${MAX_BODY_CHARS}；一句一个事实，长了就拆行`);
    });
  }
  if (DATE_RE.test(r.date ?? "") && r.date > today) fail(where, `日期 ${r.date} 晚于今天 ${today}`);

  // Newest first. Equal timestamps are allowed (two entries in the same minute), older after newer
  // is not: the page never sorts, it renders the array as given.
  const key = `${r.date}T${r.time}`;
  if (prev !== null && key > prev.key) fail(where, `顺序反了：${key} 比上一条 ${prev.key} 更新，新条目应放最前面`);
  prev = { key };
});

const first = releases[0];
const expected = `${first.date}T${first.time}`;
if (doc.latestVersion !== expected) {
  fail("latestVersion", `是 ${doc.latestVersion}，但第一条是 ${expected} —— 不改这一项，侧栏的更新红点不会亮`);
}

if (problems.length > 0) {
  console.error(`更新日志有 ${problems.length} 处问题（${file}）：`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const byKind = releases.reduce((acc, r) => ({ ...acc, [r.kind]: (acc[r.kind] ?? 0) + 1 }), {});
console.log(
  `更新日志通过：${releases.length} 条，最新 ${expected}，` +
    Object.entries(byKind)
      .map(([k, n]) => `${k} ${n}`)
      .join(" · "),
);
