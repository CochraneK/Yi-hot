#!/usr/bin/env node
// 把漂移审计结果汇总成一个固定的 Issue（每天更新同一条，不刷屏）。
//
// 用法：node scripts/post-upstream-drift-issue.mjs --in=artifacts/upstream-drift/summary.json
// 环境变量：GITHUB_TOKEN（workflow 里用 secrets.GITHUB_TOKEN）

import fs from "node:fs";

const TITLE = "AIHOT 上游漂移审计（自动更新）";

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const summaryPath = arg("in", "artifacts/upstream-drift/summary.json");
const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
if (!token || !repo) {
  console.log("缺少 GITHUB_TOKEN / GITHUB_REPOSITORY，跳过 Issue 更新（本地运行属正常）");
  process.exit(0);
}

const label = {
  "new-module": "疑似整块新功能（优先核查）",
  review: "需要人看",
  hinted: "疑似已有线索（需确认）",
  same: "等价补丁已在",
};
const order = ["new-module", "review", "hinted", "same"];

const body = [
  "> 本 Issue 由 `aihot-upstream-drift-audit` 每天自动改写，只报告不自动改代码。",
  "",
  `**生成时间**：${summary.generatedAt}`,
  `**回看**：本仓库 main 落后上游的 ${summary.lookback} 个提交` +
    (summary.vendorLag == null ? "" : `（vendor 镜像另落后 ${summary.vendorLag} 个）`),
  "",
  "> 判定纪律：只有 patch-id 命中才算「等价补丁已在」；新增文件和关键词只是线索，一律需要人工确认。",
  "",
  "| 判定 | 数量 |",
  "|---|---|",
  ...order.filter((k) => summary.counts[k]).map((k) => `| ${label[k]} | ${summary.counts[k]} |`),
  "",
  "## 疑似整块新功能（优先核查）",
  "",
  ...(summary.results.filter((r) => r.verdict === "new-module").length
    ? summary.results
        .filter((r) => r.verdict === "new-module")
        .map((r) => `- [\`${r.short}\`](https://github.com/KKKKhazix/AIHOT/commit/${r.sha}) ${r.subject}\n  - ${r.reason}`)
    : ["- 暂无"]),
  "",
  "## 需要人看",
  "",
  ...(summary.results.filter((r) => r.verdict === "review").length
    ? summary.results
        .filter((r) => r.verdict === "review")
        .map((r) => `- [\`${r.short}\`](https://github.com/KKKKhazix/AIHOT/commit/${r.sha}) ${r.subject}\n  - ${r.reason}`)
    : ["- 暂无"]),
  "",
  "## 疑似已有线索（需确认）",
  "",
  ...(summary.results.filter((r) => r.verdict === "hinted").length
    ? summary.results.filter((r) => r.verdict === "hinted").map((r) => `- \`${r.short}\` ${r.subject} — ${r.reason}`)
    : ["- 暂无"]),
  "",
  "<details><summary>完整结果</summary>",
  "",
  ...summary.results.map((r) => `- [${r.verdict}] \`${r.short}\` ${r.date} ${r.subject}`),
  "",
  "</details>",
].join("\n");

async function gh(pathname, init = {}) {
  const res = await fetch(`https://api.github.com${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${pathname} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

// 找到已有 Issue 就改，没有就建
const open = await gh(`/repos/${repo}/issues?state=open&per_page=100`);
const existing = open.find((i) => i.title === TITLE && !i.pull_request);

if (existing) {
  await gh(`/repos/${repo}/issues/${existing.number}`, {
    method: "PATCH",
    body: JSON.stringify({ body }),
  });
  console.log(`已更新 Issue #${existing.number}`);
} else {
  const created = await gh(`/repos/${repo}/issues`, {
    method: "POST",
    body: JSON.stringify({ title: TITLE, body }),
  });
  console.log(`已创建 Issue #${created.number}`);
}
