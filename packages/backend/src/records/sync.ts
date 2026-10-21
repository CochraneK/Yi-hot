// 监管记录同步：民政部行政处罚 + 社会组织活动异常名录 / 严重违法失信名单公告。
// 上游是中国社会组织政务服务平台（chinanpo.mca.gov.cn）的两个公开 JSON 接口，
// 政府信息公开范围内的公开发布内容，按 (source_key, external_id) 幂等 upsert。
//
// 两个接口都是一次性返回全量（处罚 10 条、公告约两千条、30 天滚动窗口），
// 我们本地只增不删，窗口里消失的旧记录留在表里，慢慢长成档案。
import type { RegulatoryRecordType, RegulatoryOrgKind } from "@aihot/contracts/records";
import { ENTITIES } from "@aihot/industry/taxonomy";
import { guardedFetch } from "../lib/http-fetch.ts";
import { sql } from "../db.ts";
import { normalizeRegion } from "./region.ts";

const PENALTY_URL = "https://chinanpo.mca.gov.cn/selectXzcfgg?pageNum=1&pageSize=200";
const NOTICE_URL = "https://chinanpo.mca.gov.cn/selectApOutsideNotice?pageNum=1&pageSize=2500";
const PENALTY_PAGE = "https://chinanpo.mca.gov.cn/xzcfgg";
const NOTICE_PAGE = "https://chinanpo.mca.gov.cn/hdycmlYzwfsxgg";

const PENALTY_SOURCE = "mca-penalty";
const NOTICE_SOURCE = "mca-credit-notice";

/** 上游类型码：名录 600406 活动异常 / 600407 严重违法失信；公告 600824 送达 / 600825 列入 / 600826 移出。 */
const ABNORMAL = "600406";
const DISHONESTY = "600407";

export function noticeTypeOf(type: unknown, noticeType: unknown): RegulatoryRecordType | null {
  const t = text(type);
  const n = text(noticeType);
  // 名录类型缺失或不在码表里时不猜：默认按活动异常名录处理会把严重失信记成异常。
  if (t !== ABNORMAL && t !== DISHONESTY) return null;
  if (n === "600825") return t === DISHONESTY ? "dishonesty_enrol" : "abnormal_enrol";
  if (n === "600826") return t === DISHONESTY ? "dishonesty_remove" : "abnormal_remove";
  if (n === "600824") return "delivery";
  return null;
}

interface RecordRow {
  source_key: string;
  external_id: string;
  record_type: RegulatoryRecordType;
  org_name: string;
  unified_code: string | null;
  org_kind: RegulatoryOrgKind | null;
  entity_id: string | null;
  region: string | null;
  region_province: string | null;
  region_city: string | null;
  case_no: string | null;
  punish_name: string | null;
  punish_result: string | null;
  punish_reason: string | null;
  punish_basis: string | null;
  punish_organ: string | null;
  punish_on: string | null;
  enrol_reason: string | null;
  enrol_gist: string | null;
  enrol_on: string | null;
  remove_reason: string | null;
  remove_gist: string | null;
  remove_on: string | null;
  register_dept: string | null;
  address: string | null;
  published_on: string;
  raw: Record<string, unknown>;
}

/** 实体词典反查：正式名与别名 → 实体 id。监管记录里的组织名是登记名，先精确命中。 */
const ENTITY_BY_NAME = new Map<string, string>();
for (const [id, e] of Object.entries(ENTITIES)) {
  ENTITY_BY_NAME.set(e.name, id);
  for (const alias of e.aliases) if (!ENTITY_BY_NAME.has(alias)) ENTITY_BY_NAME.set(alias, id);
}

function entityOf(orgName: string): string | null {
  const name = orgName.trim();
  const exact = ENTITY_BY_NAME.get(name);
  if (exact) return exact;
  // 登记名常带地域或层级前缀（“中国”“全国”），别名为其子串时按最长别名命中。
  let best: { id: string; len: number } | null = null;
  for (const [alias, id] of ENTITY_BY_NAME) {
    if (alias.length >= 5 && name.includes(alias) && (!best || alias.length > best.len)) best = { id, len: alias.length };
  }
  return best?.id ?? null;
}

/** 统一社会信用代码前两位：51 社会团体、52 民办非企业单位、53 基金会。 */
export function orgKindOf(code: string | null): RegulatoryOrgKind | null {
  const head = (code ?? "").trim().slice(0, 2);
  return head === "53" ? "foundation" : head === "51" ? "social_group" : head === "52" ? "private_non_enterprise" : null;
}

/** "随州市曾都区民政局" → "随州市曾都区"；没有管理机关字段时返回 null。 */
function regionOf(dept: string | null): string | null {
  const text = (dept ?? "").trim();
  if (!text) return null;
  return text.replace(/(民政局|民政部门|民政厅|民政部)$/, "") || null;
}

function text(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s || null;
}

/** 上游日期形态："2026-08-28 00:00:00" / "2026-07-20" / null。只保留日历日。 */
function day(v: unknown): string | null {
  const s = text(v);
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1]! : null;
}

async function fetchJson(url: string, body: unknown): Promise<Record<string, unknown>[]> {
  const res = await guardedFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json;charset=UTF-8", accept: "application/json", referer: "https://chinanpo.mca.gov.cn/" },
    body: JSON.stringify(body),
    timeoutMs: 60_000,
    maxBytes: 16 * 1024 * 1024,
  });
  if (res.status !== 200) throw new Error(`HTTP ${res.status} from ${url}`);
  const data = JSON.parse(res.text()) as { success?: boolean; resultCode?: string; rows?: unknown[] };
  if (!data.success && data.resultCode !== "0") throw new Error(`upstream rejected ${url}: ${JSON.stringify(data).slice(0, 200)}`);
  return Array.isArray(data.rows) ? (data.rows as Record<string, unknown>[]) : [];
}

function penaltyRows(rows: Record<string, unknown>[]): RecordRow[] {
  const out: RecordRow[] = [];
  for (const r of rows) {
    const orgName = text(r.orgName);
    const externalId = text(r.id);
    const published = day(r.punishTime) ?? day(r.createDate);
    if (!orgName || !externalId || !published) continue;
    const code = text(r.usci);
    out.push({
      source_key: PENALTY_SOURCE,
      external_id: externalId,
      record_type: "penalty",
      org_name: orgName,
      unified_code: code,
      org_kind: orgKindOf(code),
      entity_id: entityOf(orgName),
      region: null,
      region_province: null,
      region_city: null,
      case_no: text(r.caseNo),
      punish_name: text(r.punishName),
      punish_result: text(r.punishResult),
      punish_reason: text(r.punishReason),
      punish_basis: text(r.punishBasis),
      punish_organ: text(r.punishOrgan),
      punish_on: published,
      enrol_reason: null, enrol_gist: null, enrol_on: null,
      remove_reason: null, remove_gist: null, remove_on: null,
      register_dept: null,
      address: null,
      published_on: published,
      raw: r,
    });
  }
  return out;
}

function noticeRows(rows: Record<string, unknown>[]): RecordRow[] {
  const out: RecordRow[] = [];
  for (const r of rows) {
    const orgName = text(r.orgName);
    const externalId = text(r.id);
    const published = day(r.publishTime);
    const recordType = noticeTypeOf(r.type, r.noticeType);
    if (!orgName || !externalId || !published || !recordType) continue;
    const code = text(r.unifiedCode);
    const region = normalizeRegion(regionOf(text(r.registerManageDept)));
    out.push({
      source_key: NOTICE_SOURCE,
      external_id: externalId,
      record_type: recordType,
      org_name: orgName,
      unified_code: code,
      org_kind: orgKindOf(code),
      entity_id: entityOf(orgName),
      region: regionOf(text(r.registerManageDept)),
      region_province: region.province,
      region_city: region.city,
      case_no: text(r.caseCode),
      punish_name: null, punish_result: null, punish_reason: null, punish_basis: null, punish_organ: null, punish_on: null,
      enrol_reason: text(r.enrolReason),
      enrol_gist: text(r.enrolGist),
      enrol_on: day(r.enrolTime),
      remove_reason: text(r.removeReason),
      remove_gist: text(r.removeGist),
      remove_on: day(r.removeTime),
      register_dept: text(r.registerManageDept),
      address: text(r.thisDeptAddress),
      published_on: published,
      raw: r,
    });
  }
  return out;
}

async function upsert(rows: RecordRow[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;
  for (const r of rows) {
    const [res] = await sql<{ inserted: boolean }[]>`
      INSERT INTO regulatory_records (
        source_key, external_id, record_type, org_name, unified_code, org_kind, entity_id, region,
        region_province, region_city,
        case_no, punish_name, punish_result, punish_reason, punish_basis, punish_organ, punish_on,
        enrol_reason, enrol_gist, enrol_on, remove_reason, remove_gist, remove_on,
        register_dept, address, published_on, raw)
      VALUES (
        ${r.source_key}, ${r.external_id}, ${r.record_type}, ${r.org_name}, ${r.unified_code}, ${r.org_kind}, ${r.entity_id}, ${r.region},
        ${r.region_province}, ${r.region_city},
        ${r.case_no}, ${r.punish_name}, ${r.punish_result}, ${r.punish_reason}, ${r.punish_basis}, ${r.punish_organ}, ${r.punish_on},
        ${r.enrol_reason}, ${r.enrol_gist}, ${r.enrol_on}, ${r.remove_reason}, ${r.remove_gist}, ${r.remove_on},
        ${r.register_dept}, ${r.address}, ${r.published_on}, ${sql.json(r.raw as never)})
      ON CONFLICT (source_key, external_id) DO UPDATE SET
        record_type = EXCLUDED.record_type, org_name = EXCLUDED.org_name, unified_code = EXCLUDED.unified_code,
        org_kind = EXCLUDED.org_kind, entity_id = EXCLUDED.entity_id, region = EXCLUDED.region,
        region_province = EXCLUDED.region_province, region_city = EXCLUDED.region_city,
        case_no = EXCLUDED.case_no, punish_name = EXCLUDED.punish_name, punish_result = EXCLUDED.punish_result,
        punish_reason = EXCLUDED.punish_reason, punish_basis = EXCLUDED.punish_basis, punish_organ = EXCLUDED.punish_organ,
        punish_on = EXCLUDED.punish_on, enrol_reason = EXCLUDED.enrol_reason, enrol_gist = EXCLUDED.enrol_gist,
        enrol_on = EXCLUDED.enrol_on, remove_reason = EXCLUDED.remove_reason, remove_gist = EXCLUDED.remove_gist,
        remove_on = EXCLUDED.remove_on, register_dept = EXCLUDED.register_dept, address = EXCLUDED.address,
        published_on = EXCLUDED.published_on, raw = EXCLUDED.raw, updated_at = now()
      RETURNING (xmax = 0) AS inserted`;
    if (res?.inserted) inserted += 1;
    else updated += 1;
  }
  return { inserted, updated };
}

export interface McaSyncResult {
  penalties: number;
  notices: number;
  inserted: number;
  updated: number;
}

/** 全量同步两个接口。日常由 worker 的 cron 每天跑一次；首次用 --backfill 也没有区别（upsert 幂等）。 */
export async function syncMcaRecords(): Promise<McaSyncResult> {
  const [penaltyRowsRaw, noticeRowsRaw] = await Promise.all([
    fetchJson(PENALTY_URL, { orgName: "", usci: "" }),
    fetchJson(NOTICE_URL, {}),
  ]);
  const rows = [...penaltyRows(penaltyRowsRaw), ...noticeRows(noticeRowsRaw)];
  if (rows.length === 0) throw new Error("no regulatory records mapped from upstream");
  const { inserted, updated } = await upsert(rows);
  return { penalties: penaltyRowsRaw.length, notices: noticeRowsRaw.length, inserted, updated };
}

export const RECORD_SOURCE_URLS = { penalty: PENALTY_PAGE, notice: NOTICE_PAGE } as const;
