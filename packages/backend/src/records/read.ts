// 监管记录的公开读层：类型 / 组织类型 / 组织名检索 + 分页，附全库类型分布。
import type { RegulatoryOrgKind, RegulatoryRecord, RegulatoryRecordsPage, RegulatoryRecordStats, RegulatoryRecordType } from "@aihot/contracts/records";
import { ENTITIES } from "@aihot/industry/taxonomy";
import { sql } from "../db.ts";
import { RECORD_SOURCE_URLS } from "./sync.ts";

const RECORD_TYPES: RegulatoryRecordType[] = ["penalty", "abnormal_enrol", "abnormal_remove", "dishonesty_enrol", "dishonesty_remove", "delivery"];
const ORG_KINDS: RegulatoryOrgKind[] = ["social_group", "private_non_enterprise", "foundation"];
const MAX_PAGE_SIZE = 50;

export interface RecordsQuery {
  types?: string[] | null;
  kind?: string | null;
  q?: string | null;
  /** 归一化省份简称（如"黑龙江"），null 表示不限。 */
  province?: string | null;
  /** 归一化市/地区（如"佳木斯市"），null 表示不限；通常与 province 连用。 */
  city?: string | null;
  page?: number;
  pageSize?: number;
}

interface RecordDbRow {
  id: string;
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
}

function toDto(row: RecordDbRow): RegulatoryRecord {
  const entity = row.entity_id ? ENTITIES[row.entity_id] : undefined;
  return {
    id: `${row.source_key}:${row.external_id}`,
    type: row.record_type,
    orgName: row.org_name,
    unifiedCode: row.unified_code,
    orgKind: row.org_kind,
    entityId: row.entity_id,
    entityName: entity?.displayTag ?? entity?.name ?? null,
    region: row.region,
    regionProvince: row.region_province,
    regionCity: row.region_city,
    caseNo: row.case_no,
    punishName: row.punish_name,
    punishResult: row.punish_result,
    punishReason: row.punish_reason,
    punishBasis: row.punish_basis,
    punishOrgan: row.punish_organ,
    punishOn: row.punish_on,
    enrolReason: row.enrol_reason,
    enrolGist: row.enrol_gist,
    enrolOn: row.enrol_on,
    removeReason: row.remove_reason,
    removeGist: row.remove_gist,
    removeOn: row.remove_on,
    registerDept: row.register_dept,
    address: row.address,
    publishedOn: row.published_on,
    sourceUrl: row.source_key === "mca-penalty" ? RECORD_SOURCE_URLS.penalty : RECORD_SOURCE_URLS.notice,
  };
}

async function queryStats(province?: string | null): Promise<RegulatoryRecordStats> {
  const [byType, [totals], [last], provinces, cities] = await Promise.all([
    sql<{ record_type: RegulatoryRecordType; n: number }[]>`SELECT record_type, count(*)::int AS n FROM regulatory_records GROUP BY record_type`,
    sql<{ n: number }[]>`SELECT count(*)::int AS n FROM regulatory_records`,
    sql<{ last: Date | null }[]>`SELECT max(updated_at) AS last FROM regulatory_records`,
    sql<{ province: string; n: number }[]>`SELECT region_province AS province, count(*)::int AS n FROM regulatory_records WHERE region_province IS NOT NULL GROUP BY region_province ORDER BY n DESC, province`,
    province
      ? sql<{ city: string; n: number }[]>`SELECT region_city AS city, count(*)::int AS n FROM regulatory_records WHERE region_province = ${province} AND region_city IS NOT NULL GROUP BY region_city ORDER BY n DESC, city`
      : sql<{ city: string; n: number }[]>`SELECT NULL::text AS city, 0::int AS n WHERE false`,
  ]);
  const counts = Object.fromEntries(RECORD_TYPES.map((t) => [t, 0])) as Record<RegulatoryRecordType, number>;
  for (const row of byType) counts[row.record_type] = row.n;
  return {
    total: totals?.n ?? 0,
    byType: counts,
    provinces: provinces.map((r) => ({ province: r.province, n: r.n })),
    cities: cities.map((r) => ({ city: r.city, n: r.n })),
    lastSyncedAt: last?.last ? last.last.toISOString() : null,
  };
}

export async function loadRecords(query: RecordsQuery = {}): Promise<RegulatoryRecordsPage> {
  const types = (query.types ?? []).filter((t): t is RegulatoryRecordType => RECORD_TYPES.includes(t as RegulatoryRecordType));
  const kind = ORG_KINDS.includes(query.kind as RegulatoryOrgKind) ? (query.kind as RegulatoryOrgKind) : null;
  const q = query.q?.trim() ? query.q.trim().slice(0, 60) : null;
  const province = query.province?.trim() ? query.province.trim().slice(0, 16) : null;
  const city = query.city?.trim() ? query.city.trim().slice(0, 24) : null;
  const pageSize = Math.min(Math.max(query.pageSize ?? 20, 1), MAX_PAGE_SIZE);
  const page = Math.max(query.page ?? 1, 1);

  // 过滤片段逐个拼接；空数组时 sql`` 是空串，WHERE 1=1 保持恒真。
  const clauses = [sql`TRUE`];
  if (types.length > 0) clauses.push(sql`record_type IN ${sql(types)}`);
  if (kind) clauses.push(sql`org_kind = ${kind}`);
  if (q) clauses.push(sql`org_name ILIKE ${`%${q}%`}`);
  if (province) clauses.push(sql`region_province = ${province}`);
  if (city) clauses.push(sql`region_city = ${city}`);
  const where = clauses.reduce((acc, c) => sql`${acc} AND ${c}`);

  const [rows, [{ n: total }], stats] = await Promise.all([
    sql<RecordDbRow[]>`
      SELECT id::text, source_key, external_id, record_type, org_name, unified_code, org_kind, entity_id, region,
             region_province, region_city,
             case_no, punish_name, punish_result, punish_reason, punish_basis, punish_organ,
             punish_on::text AS punish_on, enrol_reason, enrol_gist, enrol_on::text AS enrol_on,
             remove_reason, remove_gist, remove_on::text AS remove_on, register_dept, address, published_on::text AS published_on
      FROM regulatory_records
      WHERE ${where}
      ORDER BY published_on DESC, id DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    sql<{ n: number }[]>`SELECT count(*)::int AS n FROM regulatory_records WHERE ${where}`,
    queryStats(province),
  ]);

  return {
    items: rows.map(toDto),
    total,
    page,
    pageSize,
    stats,
    generatedAt: new Date().toISOString(),
  };
}
