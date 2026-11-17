#!/usr/bin/env node
// 上游漂移审计：对每个上游提交判断「这条修复我们是不是已经有了」。
//
// 只读仓库，不改任何文件。输出 summary.json 与 explain.md。
//
// 判定顺序（前面的优先）：
//   same   patch-id 命中 —— 等价补丁已在（git cherry 的 `-`）
//   landed 关键词命中   —— 这条修复的函数/正则/文案已在本仓库出现
//   skip   上游改的模块本仓库没有
//   review 其余 —— 需要人看
//
// 用法：node scripts/audit-upstream-drift.mjs --lookback=60 --out=artifacts/upstream-drift

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** 关键词表：提交主题里的关键词 → 在本仓库里找这些落地痕迹。
 *  一条修复命中任意一个痕迹，就算 landed。 */
const LANDED_MARKERS = [
  { match: /sign[-_ ]?in|login page|登录页|注册页/i, files: ["packages/backend/src/content/extract.ts"], needles: ["AUTH_PATH", "isSignInUrl", "isSignInRedirect"] },
  { match: /relative|age|时间|日期|小时前|分钟前|昨天|今天/i, files: ["packages/backend/src/sources/web-list.ts", "packages/backend/src/sources/dates.ts"], needles: ["小时前", "分钟前", "昨天", "今天"] },
  { match: /egress|proxy|CONNECT/i, files: ["packages/backend/src/lib/egress-proxy.ts", "packages/backend/src/lib/http-fetch.ts"], needles: ["egress", "CONNECT", "doH", "DoH"] },
  { match: /TLS|P-256|curve|handshake/i, files: ["packages/backend/src/lib/http-fetch.ts"], needles: ["P-256", "pinnedCurve"] },
  { match: /Secure cookie|X-Forwarded-Proto|auth/i, files: ["apps/api/src/routes/admin-auth.ts"], needles: ["req.protocol", "X-Forwarded-Proto"] },
  { match: /DingTalk|钉钉/i, files: ["packages/backend/src/notify"], needles: ["dingtalk", "DingTalk"] },
  { match: /OG|poster|font/i, files: ["apps/api/src/og"], needles: ["fallbackFonts", "fontFamily"] },
  { match: /Jina|jina/i, files: ["packages/backend/src/providers/jina.ts"], needles: ["jinaRead", "listing"] },
  { match: /x shard|分片|backlog|积压/i, files: ["packages/backend/src/sources/x.ts", "packages/backend/src/sources/collect.ts"], needles: ["shard", "backlog", "watermark"] },
];

function git(args, opts = {}) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts }).trim();
}

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const lookback = Number(arg("lookback", "60"));
const outDir = arg("out", "artifacts/upstream-drift");
const UPSTREAM = "refs/remotes/aihot-public/main";
const VENDOR = "refs/remotes/origin/vendor/aihot-main";

// 上游提交（vendor 镜像之后的新提交，最多 lookback 条）
let commits;
try {
  const range = `${VENDOR}..${UPSTREAM}`;
  commits = git(["log", "--no-merges", "--format=%H%x09%ad%x09%s", "--date=short", range, "-n", String(lookback)])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, date, subject] = line.split("\t");
      return { sha, date, subject };
    });
} catch {
  // vendor 镜像不在时退化为「对比本仓库 main」
  commits = git(["log", "--no-merges", "--format=%H%x09%ad%x09%s", "--date=short", "HEAD.." + UPSTREAM, "-n", String(lookback)])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, date, subject] = line.split("\t");
      return { sha, date, subject };
    });
}

// patch-id 对账：`-` 表示等价补丁已在 HEAD 里
const cherryMinus = new Set();
try {
  git(["cherry", "HEAD", UPSTREAM])
    .split("\n")
    .filter(Boolean)
    .forEach((line) => {
      if (line.startsWith("- ")) cherryMinus.add(line.slice(2).trim());
    });
} catch {
  /* cherry 失败就不走这条路 */
}

function changedFiles(sha) {
  return git(["show", "--name-only", "--format=", sha]).split("\n").filter(Boolean);
}

function fileExists(rel) {
  return fs.existsSync(path.join(process.cwd(), rel));
}

/** 按改动路径把提交归到一个人能判断的领域，压缩「同步引擎」这类无信息主题。 */
const AREA_RULES = [
  { re: /packages\/backend\/src\/sources\//, area: "信源抓取" },
  { re: /packages\/backend\/src\/content\//, area: "正文抽取" },
  { re: /packages\/backend\/src\/events\//, area: "事件归组" },
  { re: /packages\/backend\/src\/editorial\//, area: "翻译与选稿" },
  { re: /packages\/backend\/src\/publication\//, area: "发布线" },
  { re: /packages\/backend\/src\/admin\/|apps\/api\/src\/routes\/admin/, area: "后台" },
  { re: /packages\/backend\/src\/notify\//, area: "通知推送" },
  { re: /packages\/backend\/src\/providers\//, area: "付费供应商" },
  { re: /packages\/backend\/src\/lib\/http-fetch|egress/, area: "网络出口" },
  { re: /packages\/contracts\//, area: "接口契约" },
  { re: /apps\/web\//, area: "网页" },
  { re: /apps\/api\//, area: "API" },
  { re: /database\/migrations\//, area: "数据库迁移" },
  { re: /package-lock\.json|package\.json/, area: "依赖" },
  { re: /^(docs|README|AGENTS|CLAUDE)/, area: "文档" },
  { re: /^tests\/|\.test\./, area: "测试" },
];

function classifyByFiles(files) {
  const seen = [];
  for (const f of files) {
    for (const rule of AREA_RULES) {
      if (rule.re.test(f) && !seen.includes(rule.area)) seen.push(rule.area);
    }
  }
  return seen.slice(0, 3).join(" / ");
}

function hasNeedle(files, needles) {  for (const rel of files) {
    if (!fileExists(rel) && !fs.existsSync(path.join(process.cwd(), rel))) continue;
    if (fs.statSync(path.join(process.cwd(), rel)).isDirectory()) {
      const stack = [rel];
      while (stack.length) {
        const dir = stack.pop();
        for (const entry of fs.readdirSync(path.join(process.cwd(), dir), { withFileTypes: true })) {
          const p = path.join(dir, entry.name);
          if (entry.isDirectory()) stack.push(p);
          else {
            const text = fs.readFileSync(path.join(process.cwd(), p), "utf8");
            if (needles.some((n) => text.includes(n))) return { file: p, needle: needles.find((n) => text.includes(n)) };
          }
        }
      }
      continue;
    }
    const text = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
    const hit = needles.find((n) => text.includes(n));
    if (hit) return { file: rel, needle: hit };
  }
  return null;
}

const results = [];
for (const c of commits) {
  const files = changedFiles(c.sha);
  const missingModules = files.filter((f) => !fileExists(f));
  let verdict = "review";
  let reason = "";

  if (cherryMinus.has(c.sha)) {
    verdict = "same";
    reason = "patch-id 命中：等价补丁已在本仓库";
  } else if (missingModules.length === files.length && files.length > 0) {
    verdict = "skip";
    reason = `上游改的 ${files.length} 个文件本仓库都没有`;
  } else {
    // 关键词落地检测
    for (const rule of LANDED_MARKERS) {
      if (!rule.match.test(c.subject)) continue;
      const hit = hasNeedle(rule.files, rule.needles);
      if (hit) {
        verdict = "landed";
        reason = `本仓库 ${hit.file} 已有 "${hit.needle}"`;
        break;
      }
    }
    if (verdict === "review") {
      // 主题没信息（比如一堆「同步引擎」）时，用改动文件路径归类，让人一眼看出该不该看
      const area = classifyByFiles(files);
      reason = missingModules.length
        ? `${files.length} 个文件里 ${missingModules.length} 个本仓库没有${area ? `；涉及 ${area}` : ""}`
        : `未命中落地痕迹，需要人工看${area ? `；涉及 ${area}` : ""}`;
    }
  }

  results.push({
    sha: c.sha,
    short: c.sha.slice(0, 7),
    date: c.date,
    subject: c.subject,
    verdict,
    reason,
    files,
    url: `https://github.com/KKKKhazix/AIHOT/commit/${c.sha}`,
  });
}

const counts = results.reduce((acc, r) => ((acc[r.verdict] = (acc[r.verdict] ?? 0) + 1), acc), {});
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "summary.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), lookback, counts, results }, null, 2),
  "utf8"
);

// 人读版
const order = ["review", "landed", "same", "skip"];
const label = { review: "需要人看", landed: "本仓库已有等价实现", same: "等价补丁已在", skip: "模块不存在" };
const lines = [
  `# 上游漂移审计 · ${new Date().toISOString().slice(0, 10)}`,
  "",
  `回看 ${results.length} 个上游提交：` +
    order
      .filter((k) => counts[k])
      .map((k) => `${label[k]} ${counts[k]}`)
      .join(" · "),
  "",
];
for (const verdict of order) {
  const group = results.filter((r) => r.verdict === verdict);
  if (!group.length) continue;
  lines.push(`## ${label[verdict]}（${group.length}）`, "");
  for (const r of group) {
    lines.push(`- [\`${r.short}\`](${r.url}) ${r.subject} — ${r.reason}`);
  }
  lines.push("");
}
fs.writeFileSync(path.join(outDir, "explain.md"), lines.join("\n"), "utf8");

console.log(`审计完成：${JSON.stringify(counts)}`);
console.log(`输出：${outDir}/summary.json, ${outDir}/explain.md`);
