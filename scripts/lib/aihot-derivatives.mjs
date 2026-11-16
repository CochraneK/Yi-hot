// Pure helpers for auditing AIHOT forks. Never run third-party code.
import { deflateRawSync, inflateRawSync } from "node:zlib";

export const UPSTREAM = "KKKKhazix/AIHOT";
export const ISSUE_MARKER = "<!-- yihot-aihot-derivative-audit-v1 -->";
const STATE_BEGIN = "<!-- yihot-aihot-derivative-state:";
const STATE_END = " -->";
const DEFAULT_NAMES = new Set(["myhot", "aihot"]);

export function siteIdentity(source) {
  if (typeof source !== "string") return null;
  const anchor = source.search(/export\s+const\s+SITE\s*=\s*\{/);
  if (anchor < 0) return null;
  // Read only the leading SITE object, not unrelated nested site names later in the file.
  const head = source.slice(anchor, anchor + 3600);
  const read = (key) => {
    const re = key === "name"
      ? /\bname:\s*"([^"\r\n]{1,100})"|\bname:\s*'([^'\r\n]{1,100})'/
      : key === "subject"
        ? /\bsubject:\s*"([^"\r\n]{1,100})"|\bsubject:\s*'([^'\r\n]{1,100})'/
        : /\bdefaultUrl:\s*"([^"\r\n]{1,500})"|\bdefaultUrl:\s*'([^'\r\n]{1,500})'/;
    const match = head.match(re);
    return (match?.[1] ?? match?.[2] ?? "").trim() || null;
  };
  const name = read("name");
  if (!name) return null;
  return { name, subject: read("subject"), defaultUrl: read("defaultUrl") };
}

export function isCustomized(identity) {
  if (!identity) return false;
  const name = identity.name.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
  const subject = (identity.subject ?? "AI").normalize("NFKC").replace(/\s+/g, "").toLowerCase();
  return (name.length > 1 && !DEFAULT_NAMES.has(name)) || subject !== "ai";
}

// Only format candidate URLs; the audit NEVER fetches these domains.
export function publicSiteUrl(input) {
  if (typeof input !== "string" || !input.trim() || input.length > 500) return null;
  try {
    const u = new URL(input.trim());
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) return null;
    const h = u.hostname.toLowerCase();
    if (!h.includes(".") || h === "localhost" || h.endsWith(".local") ||
      h === "aihot.news" || h.endsWith(".aihot.news") ||
      h === "github.com" || h === "www.github.com" ||
      h === "127.0.0.1" || h === "0.0.0.0" ||
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(h) || h.startsWith("[") ||
      h.endsWith(".example") || h.endsWith(".invalid")) return null;
    u.hash = "";
    return u.toString().slice(0, 500);
  } catch {
    return null;
  }
}

export function knownPeer(siteName, siteUrl, peers) {
  const norm = (s) => String(s ?? "").normalize("NFKC").replace(/\s+/g, "").toLowerCase();
  const name = norm(siteName);
  const target = publicSiteUrl(siteUrl);
  return peers.some(p => norm(p.name) === name ||
    (target && publicSiteUrl(p.url) && publicSiteUrl(p.url).replace(/\/+$/, "") === target.replace(/\/+$/, "")));
}

export function changedCandidate(before, now) {
  if (!before) return true;
  return ["siteName", "subject", "siteUrl", "repositoryUrl", "known"].some(k => before[k] !== now[k]);
}

export function blankState() {
  return { version: 1, seen: {}, candidates: {} };
}

export function encodeState(state) {
  return STATE_BEGIN + deflateRawSync(Buffer.from(JSON.stringify(state))).toString("base64") + STATE_END;
}

export function decodeState(issueBody) {
  if (!issueBody) return blankState();
  const start = issueBody.indexOf(STATE_BEGIN);
  if (start < 0) throw new Error("巡检 Issue 存在，但状态标记丢失；拒绝覆盖旧记录");
  const end = issueBody.indexOf(STATE_END, start);
  if (end < 0) throw new Error("巡检 Issue 状态标记未闭合");
  const b64 = issueBody.slice(start + STATE_BEGIN.length, end).trim();
  const state = JSON.parse(inflateRawSync(Buffer.from(b64, "base64")).toString("utf8"));
  if (state.version !== 1 || !state.seen || !state.candidates ||
      Array.isArray(state.seen) || Array.isArray(state.candidates)) {
    throw new Error("不受支持的巡检状态版本或格式");
  }
  return state;
}

function clean(s) {
  return String(s ?? "").replace(/[\r\n|<>()[\]{}]/g, " ").replace(/\s{2,}/g, " ").slice(0, 110);
}

export function renderReport({ state, stats, newItems, errors, timestamp }) {
  const candidates = Object.values(state.candidates).sort((a, b) =>
    (b.pushedAt ?? "").localeCompare(a.pushedAt ?? ""));
  const pending = candidates.filter(c => !c.known);
  const rows = pending.slice(0, 60).map(c =>
    "| " + clean(c.siteName) + " | [" + clean(c.repository) + "](" + c.repositoryUrl + ") | " +
    (c.siteUrl ? "[待验官网](" + c.siteUrl + ")" : "无独立官网线索") + " | " +
    clean(c.subject || "未提取") + " | " + clean((c.pushedAt ?? "").slice(0, 10)) + " |");
  const report = [
    "# AIHOT 改编站巡检 · 待审线索",
    "",
    "扫描时间：" + timestamp + "（UTC）；上游：" + UPSTREAM,
    "",
    "**候选不等于已上线或免费。** 仅比对 GitHub fork 内的站名/行业配置，不运行第三方代码、不访问候选站、不自动启用 RSS、不自动上架。",
    "",
    "- 已枚举 fork：" + stats.forks + "；近期活跃：" + stats.active +
      "；本轮检查配置：" + stats.inspected + "；模板或未改站名：" + stats.template + "。",
    "- 新增或有实质变化的候选：" + newItems.length + "；已收录匹配：" +
      candidates.filter(c => c.known).length + "；未收录待审：" + pending.length + "。",
    "- 因单次容量而留待下轮：" + stats.deferred + "；fork 分页截断：" +
      (stats.forksTruncated ? "是（本轮不完整）" : "否") + "。",
    "",
    "## 待审线索（最近更新优先，最多显示 60 项）",
    "",
    "| 站名 | GitHub fork（改编证据） | 公网线索 | 行业词 | 最后推送 |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    ...(rows.length ? [] : ["| 暂无 | — | — | — | — |"]),
    "",
    "## 新发现或变化（本轮）",
    "",
    ...(newItems.length ? newItems.slice(0, 30).map(c =>
      "- " + clean(c.siteName) + "：" + c.repositoryUrl +
      (c.siteUrl ? "；官网线索 " + c.siteUrl : "；未找到可信官网线索")) : ["本轮没有新增或实质变化。"]),
    "",
    "## 人工审核规则",
    "",
    "核实站点是否真正在线、能否免费阅读核心聚合内容、是否有跨源增量价值、是否已收录，检查 RSS/API 和来源许可；普通机构官网、收费核心功能、纯模板 fork 不加入邻域。发现重名时不要根据仓库名称推断同一运营主体。",
    ...(errors.length ? ["", "## 检查未完成", "", ...errors.map(s => "- " + clean(s))] : []),
    "",
    "报告由只读扫描器生成，清单不构成对第三方网站的认可或推荐。",
  ];
  return report.join("\n") + "\n";
}

export function issueBody(report, state) {
  const body = ISSUE_MARKER + "\n\n" + report + "\n" + encodeState(state);
  if (Buffer.byteLength(body, "utf8") > 60000) throw new Error("巡检 Issue 状态超出安全长度，拒绝截断历史");
  return body;
}
