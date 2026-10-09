#!/usr/bin/env node
/**
 * Offline, read-only inventory reconciler for YiHot, NewsMail and charity-intelligence.
 * Never fetches external sites, edits sources, enables collectors, or accesses production DB.
 * Node >= 24; no added dependencies.
 *
 * node scripts/source-registry-audit.mjs [--write|--check]
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "data/source-registry";
const DATE = "2026-10-08";

export const loadJson = (file, root = ROOT) => JSON.parse(readFileSync(resolve(root, file), "utf8"));

/** The host is a matching *hint*, never proof that two organizations are the same. */
export function hostOf(value) {
  if (!value || !/^https?:\/\//i.test(value)) return null;
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return null; }
}

/** Only exact URLs with trivial syntax differences are marked as duplicates. */
export function urlKey(value) {
  if (!value || !/^https?:\/\//i.test(value)) return null;
  try {
    const u = new URL(value);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    // Retain queries: feed/config identifiers may be meaningful. Keep distinct paths.
    const pathname = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.protocol}//${u.host}${pathname}${u.search}`;
  } catch { return null; }
}
// Pin the collation locale: the bare `localeCompare` follows the host default locale, so a Windows
// zh-CN machine (pinyin order) and a Linux CI runner (ICU root order) produced different snapshots
// and the committed output could not be reproduced on every machine. An explicit locale keeps
// `--write` / `--check` byte-identical everywhere.
const all = (value) => [...new Set(value)].sort((a, b) => a.localeCompare(b, "en"));
const safe = (value) => String(value ?? "").replace(/[|\r\n]+/g, " ").trim();
const csv = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';

export function reconcile({ seed, news, charity }) {
  const seedRows = seed.sources.map((x) => {
    const endpoint = x.config?.feedUrl ?? x.config?.url ?? null;
    return { id: x.id, name: x.name, kind: x.kind, endpoint, host: hostOf(endpoint) };
  });
  const seedByHost = new Map();
  for (const s of seedRows) if (s.host) seedByHost.set(s.host, [...(seedByHost.get(s.host) ?? []), s.id]);

  const complianceByHost = new Map();
  for (const c of charity.rows) {
    const host = hostOf("https://" + String(c.domain ?? ""));
    if (!host) continue;
    complianceByHost.set(host, [...(complianceByHost.get(host) ?? []), c]);
  }
  const incoming = news.rows.map((item) => ({
    ...item, host: hostOf(item.url), normalized_url: urlKey(item.url),
    matching_seed_ids: all(seedByHost.get(hostOf(item.url)) ?? []),
    compliance_refs: (complianceByHost.get(hostOf(item.url)) ?? []).map((r) => ({
      legacy_id: r.legacy_id, collection_status: r.collection_status,
      collection_method: r.collection_method, tos_confirmed: r.tos_confirmed,
      robots_status: r.robots_status, last_probe_at: r.last_probe_at,
    })),
  }));
  const byUrl = new Map();
  for (const item of incoming) if (item.normalized_url) {
    byUrl.set(item.normalized_url, [...(byUrl.get(item.normalized_url) ?? []), item]);
  }
  const collisions = [...byUrl.entries()].filter(([, items]) => items.length > 1).map(([url, items]) => ({
    normalized_url: url,
    legacy_ids: items.map(x => x.legacy_id),
    names: all(items.map(x => x.name)),
    distinct_names: all(items.map(x => x.name)).length > 1,
    review_reason: all(items.map(x => x.name)).length > 1 ? "POTENTIAL_ENTITY_CONFLICT" : "DUPLICATE_LIST_ENTRY",
  })).sort((a, b) => a.normalized_url.localeCompare(b.normalized_url));

  const collisionKeys = new Map(collisions.map(x => [x.normalized_url, x.review_reason]));
  for (const item of incoming) {
    const risks = [];
    if (!item.url) {
      risks.push(/搜狗微信|微博热搜|聚合|关键词/.test(item.kind_label) ? "DISCOVERY_SIGNAL_ONLY" : "NO_URL");
    } else {
      if (item.matching_seed_ids.length) risks.push("EXISTING_SEED_HOST_REVIEW");
      if (item.kind_label === "RSS") risks.push("VERIFY_FEED_IS_XML");
      if (item.kind_label === "官网") risks.push("FIND_SPECIFIC_NEWS_ENDPOINT");
      if (collisionKeys.has(item.normalized_url)) risks.push(collisionKeys.get(item.normalized_url));
      if (item.compliance_refs.some(r => r.collection_status === "blocked" || r.collection_method === "manual_citation")) risks.push("COLLECTION_RESTRICTED");
      if (item.compliance_refs.some(r => r.collection_status === "conditional" || r.collection_status === "pending_retest" || r.tos_confirmed !== "true")) risks.push("PERMISSION_RECHECK");
      if (!item.compliance_refs.length) risks.push("NO_COMPLIANCE_MATCH");
    }
    item.review_reasons = all(risks);
    item.approved = false;
    item.enable_collection = false;
    item.evidence_status = "UNVERIFIED";
  }
  const stats = {
    seed_rows: seedRows.length,
    newsmail_rows: incoming.length,
    newsmail_url_rows: incoming.filter(x => x.url).length,
    newsmail_unique_hosts: new Set(incoming.map(x => x.host).filter(Boolean)).size,
    charity_registry_rows: charity.rows.length,
    charity_statuses: Object.fromEntries(all(charity.rows.map(x => x.collection_status || "unknown")).map(status =>
      [status, charity.rows.filter(x => (x.collection_status || "unknown") === status).length])),
    seed_host_overlap_rows: incoming.filter(x => x.matching_seed_ids.length > 0).length,
    newsmail_url_collision_groups: collisions.length,
    newsmail_distinct_name_conflicts: collisions.filter(x => x.distinct_names).length,
    discovery_only_rows: incoming.filter(x => !x.url).length,
    enabled_by_audit: 0,
  };
  return {
    schema_version: 1, audit_date: DATE,
    purpose: "Review candidates only; no automatic ingestion or permission grants.",
    sources: { yihot: "industry/sources.json", newsmail: `${SOURCE}/imports/newsmail-${DATE}.json`,
      charity: `${SOURCE}/imports/charity-${DATE}.json` },
    stats, existing_seed: seedRows, candidates: incoming,
    url_collisions: collisions,
    charity_registry: charity.rows,
  };
}

export function markdown(out) {
  const st = out.stats;
  const coll = out.url_collisions.filter(x => x.distinct_names);
  const rows = [
    "# YiHot · 三库信源审计（自动生成）",
    "",
    "> 此报告由 `node scripts/source-registry-audit.mjs --write` 生成，使用 2026-10-08 的**静态 Git 仓库快照**；不是线上信源健康报告，未发送网络请求，**所有新候选默认禁用**。",
    "",
    "## 清点结果",
    "",
    "| 项目 | 数量 | 解释 |",
    "|---|---:|---|",
    `| YiHot 现有 seed | ${st.seed_rows} | 同一个域名下可以有多个栏目 |`,
    `| NewsMail 候选条目 | ${st.newsmail_rows} | 包含网址与非网址搜索信号 |`,
    `| NewsMail 有网址条目 | ${st.newsmail_url_rows} | 不等于有效 RSS |`,
    `| NewsMail 不同主机名 | ${st.newsmail_unique_hosts} | 仅用于线索匹配，非机构数 |`,
    `| 与 YiHot seed 同主机名的 NewsMail 行 | ${st.seed_host_overlap_rows} | 不能推断为重复新闻栏目 |`,
    `| charity 合规登记 | ${st.charity_registry_rows} | 历史登记，不是许可授权 |`,
    `| 精确 URL 重复组 | ${st.newsmail_url_collision_groups} | 有些只是同名重复 |`,
    `| 同 URL 不同名称组 | ${st.newsmail_distinct_name_conflicts} | **需要人工核查身份** |`,
    `| 本次启用来源 | ${st.enabled_by_audit} | 审计不修改运行状态 |`,
    "",
    "## charity-intelligence 的历史合规状态",
    "",
    ...Object.entries(st.charity_statuses).map(([k, v]) => `- \`${k}\`: ${v} 条`),
    "",
    "不能将 `conditional` 自动变成 `allowed`。官方权威、抓取成功、转载许可、事实独立性彼此正交。",
    "",
    "## 重点身份冲突（同一原始 URL 多个名称）",
    "",
    ...(coll.length ? coll.slice(0, 20).map(x => `- **${safe(x.names.join(" / "))}**：${safe(x.normalized_url)}（${x.legacy_ids.join(", ")}）`) : ["本次未发现；仍需要核对跨域别名和机构历史更名。"]),
    "",
    "## 第一批复核清单",
    "",
    "| 来源 | 目标检查 |",
    "|---|---|",
    "| 民政部四个栏目 | 列表、发布日期与原文，避免一个发布主体重复计独立来源 |",
    "| 中国慈善联合会 | 官网新闻、权限与稳定解析 |",
    "| 南都公益基金会 | 核验 RSS 与网页两个入口；只启用一条首选路由 |",
    "| 基金会中心网 | JSON/API schema、授权与原始发布者 |",
    "| 中国发展简报 | NewsMail 标为 RSS 的链接是否返回有效 feed |",
    "| 公益时报 | NewsMail 旧 RSS 是否仍在更新 |",
    "| UNICEF China | 可用栏目、发布日期与主办机构 |",
    "| 两个有来源许可的公益公众号 | 公众号 ID、原始 URL、RSS/API 回退与预算 |",
    "",
    "## 执行与安全门槛",
    "",
    "1. 导出的 `data/source-registry/generated/candidates.json` 和 `review.csv` 用于**人工复核**，不直接驱动 `scripts/seed.ts`。",
    "2. `source_file` 与 `source_line` 是原始来源定位；保留冲突，禁止同名或同域自动合并机构。",
    "3. 必须确认版权、服务条款、站点 robots、真实发布日期后，才可以手工增加新的正式 YiHot source。",
    "4. 旧来源不应在首采时把历史文章塞入“今天”；费用接口先配置预算与 receipt。",
    "5. 下一阶段才开展真实网络试抓，并在后台对接测试结果；本脚本无联网行为。",
    "",
  ];
  return rows.join("\n");
}

export function exportCsv(out) {
  const cols = ["legacy_id", "name", "kind_label", "section", "url", "host", "matching_seed_ids", "compliance_refs",
    "review_reasons", "source_file", "source_line", "enable_collection"];
  return cols.join(",") + "\n" + out.candidates.map(x => cols.map(k =>
    csv(Array.isArray(x[k]) ? x[k].map(v => typeof v === "string" ? v : v.legacy_id + ":" + v.collection_status).join(";") : x[k])
  ).join(",")).join("\n") + "\n";
}

export function produce(root = ROOT) {
  return reconcile({
    seed: loadJson("industry/sources.json", root),
    news: loadJson(`${SOURCE}/imports/newsmail-${DATE}.json`, root),
    charity: loadJson(`${SOURCE}/imports/charity-${DATE}.json`, root),
  });
}

function run() {
  const out = produce();
  const files = [
    [`${SOURCE}/generated/candidates.json`, JSON.stringify(out, null, 2) + "\n"],
    [`${SOURCE}/generated/review.csv`, exportCsv(out)],
    [`docs/SOURCE_REGISTRY_AUDIT_${DATE}.md`, markdown(out)],
  ];
  if (process.argv.includes("--write")) {
    for (const [rel, data] of files) {
      const file = resolve(ROOT, rel); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, data, "utf8");
    }
    console.log("Wrote " + files.map(x => x[0]).join(", "));
  } else if (process.argv.includes("--check")) {
    const errors = files.filter(([rel, value]) => {
      try { return readFileSync(resolve(ROOT, rel), "utf8") !== value; }
      catch { return true; }
    }).map(([rel]) => rel);
    if (errors.length) { console.error("Regenerate stale/missing files: " + errors.join(", ")); process.exitCode = 1; }
    else console.log("Source-registry audit outputs match snapshots.");
  } else console.log(markdown(out));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
