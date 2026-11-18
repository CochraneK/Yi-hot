#!/usr/bin/env node
// 上游漂移审计：对每个上游提交判断「这条修复我们是不是已经有了」。
//
// 只读仓库，不改任何文件。输出 summary.json 与 explain.md。
//
// 审计范围：HEAD..UPSTREAM —— 上游有、本仓库(main)还没有的提交。
// 早期版本错误地用 vendor..upstream：vendor 是上游镜像，一旦同步就恒为空，
// 结果 YiHot 落后上游几十个提交时报告仍然是「无需处理」，账号系统就是这么漏掉的。
//
// 判定顺序（前面的优先）：
//   same        patch-id 命中 —— 等价补丁已在（git cherry 的 `-`）
//   new-module  上游改的文件本仓库一个都没有 —— 优先核查，可能是整块新功能
//   hinted      关键词命中 —— 只是线索，需人工确认是否等价（不等于可以跳过）
//   review      其余 —— 需要人看
//
// 用法：
//   node scripts/audit-upstream-drift.mjs --lookback=60 --out=artifacts/upstream-drift
//   node scripts/audit-upstream-drift.mjs --self-test   # 内置判定规则回归

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** 关键词表：只用来「提示可能已有」，绝不作为跳过的依据。 */
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

export function classifyByFiles(files, rules = AREA_RULES) {
  const seen = [];
  for (const f of files) {
    for (const rule of rules) {
      if (rule.re.test(f) && !seen.includes(rule.area)) seen.push(rule.area);
    }
  }
  return seen.slice(0, 3).join(" / ");
}

/**
 * 纯判定函数（依赖注入，便于回归测试）。
 * 关键纪律：只有 patch-id 命中才敢说「等价补丁已在」；关键词和缺失文件
 * 都只是待核查线索，不能得出「不用管」的结论。
 */
export function classify({ sha, subject, date, files, cherryMinus, fileExists, needleLookup, areaRules }) {
  const missing = files.filter((f) => !fileExists(f));
  let verdict = "review";
  let reason = "";

  if (cherryMinus.has(sha)) {
    verdict = "same";
    reason = "patch-id 命中：等价补丁已在本仓库";
  } else if (files.length > 0 && missing.length === files.length) {
    // 曾经判成 skip「模块不存在」——账号系统这类整块新功能正是这样漏掉的。
    verdict = "new-module";
    reason = `上游改的 ${files.length} 个文件本仓库都没有——可能是整块新功能，优先核查`;
  } else {
    const hit = needleLookup(subject);
    if (hit) {
      verdict = "hinted";
      reason = `仅关键词命中（${hit.file} 含 "${hit.needle}"），未验证等价——需人工确认`;
    } else {
      const area = classifyByFiles(files, areaRules);
      reason = missing.length
        ? `${files.length} 个文件里 ${missing.length} 个本仓库没有${area ? `；涉及 ${area}` : ""}`
        : `未命中落地痕迹，需要人工看${area ? `；涉及 ${area}` : ""}`;
    }
  }
  const area = verdict === "review" ? classifyByFiles(files, areaRules) : "";
  return {
    sha,
    short: sha.slice(0, 7),
    date,
    subject,
    verdict,
    reason: area && !reason.includes(area) ? `${reason}；涉及 ${area}` : reason,
    files,
    url: `https://github.com/KKKKhazix/AIHOT/commit/${sha}`,
  };
}

function git(args, opts = {}) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts }).trim();
}

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function selfTest() {
  const assert = (cond, msg) => {
    if (!cond) throw new Error("self-test 失败: " + msg);
    console.log("  ok - " + msg);
  };
  const S = (sha, subject, files, extra = {}) => classify({ sha, subject, date: "2026-11-18", files, cherryMinus: new Set(), fileExists: (f) => !f.startsWith("NEW"), needleLookup: () => null, areaRules: AREA_RULES, ...extra });

  // 缺陷①：上游新增一整块功能（文件全不存在）不能再被跳过
  const added = S("a".repeat(40), "同步引擎: account module", ["NEW.ts", "NEW2.ts"]);
  assert(added.verdict === "new-module", "上游新增模块判为 new-module 而非 skip");
  assert(/优先核查/.test(added.reason), "新增模块理由明确要求优先核查");

  // 缺陷②：关键词命中只是线索，不能下「不用摘」的结论
  const hinted = S("b".repeat(40), "login page fix", ["packages/backend/src/content/extract.ts"], {
    needleLookup: () => ({ file: "extract.ts", needle: "AUTH_PATH" }),
  });
  assert(hinted.verdict === "hinted", "关键词命中判为 hinted 而非 landed");
  assert(/需人工确认/.test(hinted.reason), "hinted 理由要求人工确认");

  // patch-id 命中仍然是最强证据
  const same = S("c".repeat(40), "anything", ["whatever.ts"], { cherryMinus: new Set(["c".repeat(40)]) });
  assert(same.verdict === "same", "patch-id 命中判为 same");

  // 普通提交仍是 review，并带领域归类
  const review = S("d".repeat(40), "同步引擎", ["packages/backend/src/events/group.ts"]);
  assert(review.verdict === "review" && /事件归组/.test(review.reason), "普通提交 review 且标注事件归组领域");

  // 混合情况：部分文件存在，不能误判为新增模块
  const mixed = S("e".repeat(40), "x", ["packages/backend/src/events/group.ts", "NEW.ts"]);
  assert(mixed.verdict === "review" && /1 个本仓库没有/.test(mixed.reason), "部分缺失不误判为新增模块");
  console.log("self-test 全部通过");
}

if (process.argv.includes("--self-test")) {
  selfTest();
  process.exit(0);
}

const lookback = Number(arg("lookback", "60"));
const outDir = arg("out", "artifacts/upstream-drift");
const UPSTREAM = "refs/remotes/aihot-public/main";
const VENDOR = "refs/remotes/origin/vendor/aihot-main";

// 审计范围：上游有、本仓库 HEAD(main) 还没有的提交。
const commits = git([
  "log", "--no-merges", "--format=%H%x09%ad%x09%s", "--date=short",
  `HEAD..${UPSTREAM}`, "-n", String(lookback),
])
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [sha, date, subject] = line.split("\t");
    return { sha, date, subject };
  });

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

function needleLookup(subject) {
  for (const rule of LANDED_MARKERS) {
    if (!rule.match.test(subject)) continue;
    for (const rel of rule.files) {
      const full = path.join(process.cwd(), rel);
      if (!fs.existsSync(full)) continue;
      if (fs.statSync(full).isDirectory()) {
        const stack = [rel];
        while (stack.length) {
          const dir = stack.pop();
          for (const entry of fs.readdirSync(path.join(process.cwd(), dir), { withFileTypes: true })) {
            const p = path.join(dir, entry.name);
            if (entry.isDirectory()) stack.push(p);
            else {
              const text = fs.readFileSync(path.join(process.cwd(), p), "utf8");
              const needle = rule.needles.find((n) => text.includes(n));
              if (needle) return { file: p, needle };
            }
          }
        }
      } else {
        const text = fs.readFileSync(full, "utf8");
        const needle = rule.needles.find((n) => text.includes(n));
        if (needle) return { file: rel, needle };
      }
    }
  }
  return null;
}

// vendor 镜像只作为信息提示，不再作为审计范围
let vendorLag = null;
try {
  vendorLag = Number(git(["rev-list", "--count", `${VENDOR}..${UPSTREAM}`]));
} catch {
  /* 没有 vendor ref就算了 */
}

const results = commits.map((c) =>
  classify({
    ...c,
    files: changedFiles(c.sha),
    cherryMinus,
    fileExists,
    needleLookup,
    areaRules: AREA_RULES,
  })
);

const counts = results.reduce((acc, r) => ((acc[r.verdict] = (acc[r.verdict] ?? 0) + 1), acc), {});
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "summary.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), lookback, vendorLag, counts, results }, null, 2),
  "utf8"
);

const order = ["new-module", "review", "hinted", "same"];
const label = {
  "new-module": "疑似整块新功能（优先核查）",
  review: "需要人看",
  hinted: "疑似已有线索（需确认）",
  same: "等价补丁已在",
};
const lines = [
  `# 上游漂移审计 · ${new Date().toISOString().slice(0, 10)}`,
  "",
  `对比范围：本仓库 main 落后上游的 ${results.length} 个提交` +
    (vendorLag === null ? "" : `（vendor 镜像另落后上游 ${vendorLag} 个）`) + "。",
  "",
  "> 判定纪律：只有 patch-id 命中才算「等价补丁已在」；新增文件和关键词只是线索，一律需要人工确认。",
  "",
  order
    .filter((k) => counts[k])
    .map((k) => `- ${label[k]} ${counts[k]}`)
    .join("\n"),
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
