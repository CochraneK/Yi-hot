// GitHub-only, read-only discovery. It never checks out or executes fork code,
// probes unknown domains, modifies YiHot sources, or starts model/collection jobs.
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { PEER_SITES } from "../industry/peers.ts";
import {
  UPSTREAM, ISSUE_MARKER, blankState, decodeState, siteIdentity,
  isCustomized, publicSiteUrl, knownPeer, changedCandidate,
  renderReport, issueBody,
} from "./lib/aihot-derivatives.mjs";

const ISSUE_TITLE = "AIHOT 衍生站自动巡检 · 待审线索";
const token = process.env.GITHUB_TOKEN || "";
const destination = process.env.GITHUB_REPOSITORY || "CochraneK/Yi-hot";
const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");
const numOption = (name, fallback, max) => {
  const arg = process.argv.find(v => v.startsWith("--" + name + "="));
  const number = Number(arg ? arg.slice(name.length + 3) : fallback);
  if (!Number.isSafeInteger(number) || number < 1 || number > max) {
    throw new Error("非法参数 --" + name + " (应为 1.." + max + ")");
  }
  return number;
};
const maxForks = numOption("max-forks", 3000, 10000);
const lookbackDays = numOption("lookback-days", 60, 3650);
const maxConfigs = numOption("max-configs", 600, 900);
const outDir = resolve("artifacts/aihot-derivatives");
const errors = [];

if (!token) throw new Error("需要 GITHUB_TOKEN；仅允许手动或定时 GitHub Actions 使用，不能匿名高频扫描");
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(destination)) throw new Error("GITHUB_REPOSITORY 格式不正确");

function wait(ms) { return new Promise(done => setTimeout(done, ms)); }
async function github(path, options = {}) {
  const url = "https://api.github.com" + path;
  const request = {
    method: options.method || "GET",
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "YiHotDerivativeAudit/1.0",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response;
    try {
      response = await fetch(url, { ...request, signal: AbortSignal.timeout(20000) });
    } catch (e) {
      if (attempt < 2) { await wait(500 * (attempt + 1)); continue; }
      throw new Error("GitHub API 网络失败: " + path + " " + String(e));
    }
    if (response.status === 404 && options.allow404) return null;
    if (response.ok) {
      const json = await response.json();
      return json;
    }
    if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
      await wait(1250 * (attempt + 1));
      continue;
    }
    // 401/403 (including permission & rate-limit errors) fail loudly.
    throw new Error("GitHub API HTTP " + response.status + ": " + path +
      " " + (await response.text()).slice(0, 250));
  }
  throw new Error("GitHub API 多次重试失败: " + path);
}
function validRepo(name) {
  return /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(name || "");
}
async function existingIssue() {
  for (let page = 1; page <= 6; page += 1) {
    const issues = await github("/repos/" + destination + "/issues?state=all&sort=updated&per_page=100&page=" + page);
    const issue = issues.find(i => !i.pull_request && i.title === ISSUE_TITLE && i.body?.includes(ISSUE_MARKER));
    if (issue) return issue;
    if (issues.length < 100) break;
  }
  return null;
}
async function enumerateForks() {
  const forks = [];
  let truncated = false;
  for (let page = 1; forks.length < maxForks; page += 1) {
    const batch = await github("/repos/" + UPSTREAM + "/forks?sort=newest&per_page=100&page=" + page);
    if (!Array.isArray(batch)) throw new Error("forks API 返回值不是数组");
    const space = maxForks - forks.length;
    forks.push(...batch.slice(0, space));
    if (batch.length > space) truncated = true;
    if (batch.length < 100) break;
    if (forks.length >= maxForks) { truncated = true; break; }
  }
  return { forks, truncated };
}
async function getSiteSource(repoName) {
  for (const file of ["site/site.ts", "industry/site.ts"]) {
    const path = "/repos/" + repoName + "/contents/" + file;
    const payload = await github(path, { allow404: true });
    if (!payload) continue;
    if (payload.encoding === "base64" && typeof payload.content === "string") {
      return Buffer.from(payload.content.replace(/\s/g, ""), "base64").toString("utf8");
    }
    throw new Error("站点身份配置未返回可读内容: " + repoName + "/" + file);
  }
  return null;
}
async function mapLimited(entries, parallel, mapper) {
  for (let i = 0; i < entries.length; i += parallel) {
    await Promise.all(entries.slice(i, i + parallel).map(mapper));
  }
}
function persistReport(report, state, stats, newItems) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "report.md"), report, "utf8");
  writeFileSync(resolve(outDir, "result.json"), JSON.stringify({
    generatedAt: new Date().toISOString(), upstream: UPSTREAM, stats,
    newItems, candidates: Object.values(state.candidates), errors,
  }, null, 2) + "\n");
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, report, "utf8");
  }
}
async function publishIssue(issue, report, state) {
  if (dryRun) return;
  const body = issueBody(report, state);
  if (issue) {
    await github("/repos/" + destination + "/issues/" + issue.number, {
      method: "PATCH", body: { body, state: "open" },
    });
    console.log("Updated discovery dashboard: " + issue.html_url);
  } else {
    const created = await github("/repos/" + destination + "/issues", {
      method: "POST", body: { title: ISSUE_TITLE, body },
    });
    console.log("Created discovery dashboard: " + created.html_url);
  }
}

async function main() {
  const now = new Date().toISOString();
  const issue = await existingIssue();
  const state = issue ? decodeState(issue.body) : blankState();
  const oldCandidates = { ...state.candidates };
  const { forks, truncated } = await enumerateForks();
  const cutoff = Date.now() - lookbackDays * 86400000;
  const active = forks.filter(f => validRepo(f.full_name) && !f.archived && !f.disabled &&
    Math.max(Date.parse(f.pushed_at || 0), Date.parse(f.created_at || 0)) >= cutoff);
  const eligible = active.filter(f => force || state.seen[f.full_name] !== f.pushed_at)
    .sort((a, b) => (b.pushed_at || "").localeCompare(a.pushed_at || ""));
  const targets = eligible.slice(0, maxConfigs);
  const stats = { forks: forks.length, forksTruncated: truncated, active: active.length,
    inspected: 0, template: 0, customized: 0, deferred: eligible.length - targets.length };
  const newItems = [];
  console.log("Forks:", forks.length, "active:", active.length, "need inspection:", eligible.length,
    "this run:", targets.length, "deferred:", stats.deferred);

  await mapLimited(targets, 5, async fork => {
    const key = fork.full_name;
    try {
      const source = await getSiteSource(key);
      const identity = siteIdentity(source);
      stats.inspected += 1;
      state.seen[key] = fork.pushed_at;
      if (!isCustomized(identity)) {
        stats.template += 1;
        // If a previously customized repo reverted to template, mark it as no longer a candidate.
        delete state.candidates[key];
        return;
      }
      stats.customized += 1;
      const previous = oldCandidates[key];
      const siteUrl = publicSiteUrl(identity.defaultUrl) || publicSiteUrl(fork.homepage);
      const candidate = {
        repository: key,
        repositoryUrl: "https://github.com/" + key,
        siteName: identity.name,
        subject: identity.subject,
        siteUrl,
        known: knownPeer(identity.name, siteUrl, PEER_SITES),
        pushedAt: fork.pushed_at,
        firstSeen: previous?.firstSeen || now,
        lastSeen: now,
        status: "需人工核验在线/免费/聚合价值/许可",
      };
      state.candidates[key] = candidate;
      if (changedCandidate(previous, candidate)) newItems.push(candidate);
    } catch (e) {
      errors.push(key + ": " + String(e));
    }
  });
  // Registry changes alone can make an old candidate known, without a fork commit.
  for (const candidate of Object.values(state.candidates)) {
    candidate.known = knownPeer(candidate.siteName, candidate.siteUrl, PEER_SITES);
  }
  // Recompute labels against current registry (no automatic approval).
  const report = renderReport({ state, stats, newItems, errors, timestamp: now });
  persistReport(report, state, stats, newItems);
  await publishIssue(issue, report, state);
  console.log("Report: artifacts/aihot-derivatives/report.md; new:", newItems.length);
  if (truncated || errors.length) {
    throw new Error("巡检未覆盖完整范围：fork 分页截断或 API 读取失败，见报告；下轮重试");
  }
}

main().catch(err => {
  console.error(err.stack || String(err));
  process.exitCode = 1;
});
