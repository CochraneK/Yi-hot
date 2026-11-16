// Strict automatic approval for location candidates.
//
// The rule set is deliberately one-sided: it can approve, but it never rejects.
// A candidate that fails any check stays pending and simply does not reach the
// public map. Rejecting automatically would destroy the evidence a later manual
// pass needs, and the site would rather show fewer cities than a wrong one.
//
// Approve only when ALL of these hold:
//   1. role is "event" — the prompt already separates event from publisher,
//      affected and mentioned; anything else is not an event location.
//   2. the place name resolves to exactly one city in the offline gazetteer.
//   3. the quoted evidence contains the name at least once where it is not the
//      head of an institution, outlet, policy range ("北京某基金会") or a dateline.
//   4. the quote is more than a bare place name.
//   5. the text does not name a sub-city unit that only reuses the city name
//      ("太原村", "坪山乡", "园林街道").
import type { GeoRole } from "@aihot/contracts/geo-review";
import { sql } from "../db.ts";
import { resolvePlace, type ResolvedPlace } from "./geo-gazetteer.ts";

export const AUTO_REVIEWER = "system:auto";

/** Checked immediately after the place name in the quote. */
const INSTITUTION_WORDS = [
  "基金会", "协会", "学会", "商会", "联合会", "促进会", "理事会",
  "公司", "集团", "企业", "工厂", "银行", "酒店", "商场", "物业",
  "大学", "学院", "学校", "中学", "小学", "幼儿园", "研究院", "研究所", "实验室",
  "医院", "卫生院", "疾控中心", "委员会", "政府", "民政局", "教育局", "卫健委",
  "派出所", "法院", "检察院", "街道办", "居委会", "办事处", "代表处", "管理中心",
  "公安局", "公安厅", "民政厅", "教育厅", "分局", "分公司", "分部", "分会", "支部", "支行",
  "报社", "杂志社", "电视台", "广播电台", "日报", "晚报", "新闻网",
  // Single characters that only ever finish a government body's name here
  // (市场监管局, 医保局, 住建厅). "办" and "委" are left out on purpose:
  // 举办 and 委托 are ordinary words.
  "局", "厅", "署",
];

/** A quote that only names a place says nothing about an event happening there. */
const BARE_PLACE_MAX = 6;

/**
 * Units below the prefecture level. "太原村" and "太原市" share a pinyin key, so
 * the gazetteer alone cannot tell them apart: the suffix is the only signal that
 * the text names a village or a township, not the city of the same name.
 */
const SUB_CITY_SUFFIXES = ["街道办事处", "街道", "社区", "村", "乡", "镇", "屯", "里"];

/** Prefecture-level markers. Their presence means the head of the string is a city. */
const CITY_MARKERS = ["省", "市", "州", "盟", "地区", "自治区", "自治州"];

/** Datelines ("新华社北京10月30日电") record where a desk sits, not an event. */
const DATELINE_AFTER_NAME = /^\s*\d{1,2}月\d{1,2}日?\s*电/;

/** Ranges are not cities: they cannot support a nearby search or a map pin. */
const RANGE_WORDS = ["全国", "各地", "多地", "全省", "全市", "全区", "全县", "海内外", "境内外"];

export interface AutoReviewDecision {
  approve: boolean;
  reason: string;
  place?: ResolvedPlace;
}

/** Pure decision function so the rules can be tested without a database. */
export function decideAutoApproval(input: { placeText: string; role: GeoRole; evidence: string }): AutoReviewDecision {
  const { placeText, role, evidence } = input;
  if (role !== "event") return { approve: false, reason: `role=${role}` };

  const trimmed = placeText.trim();
  if (trimmed.length < 2) return { approve: false, reason: "place too short" };
  if (RANGE_WORDS.some(word => trimmed === word || trimmed.includes(word))) {
    return { approve: false, reason: "range, not a city" };
  }
  // "太原村" / "坪山乡" / "园林街道" reuse a city name for a village, township or
  // subdistrict pinyin-identical to it. Without a province or city prefix there
  // is nothing tying the unit to that city, and the pin would land provinces away.
  const suffix = SUB_CITY_SUFFIXES.find(item => trimmed.endsWith(item));
  if (suffix && !CITY_MARKERS.some(marker => trimmed.slice(0, -suffix.length).includes(marker))) {
    return { approve: false, reason: "sub-city unit, not the city" };
  }

  const quote = evidence.trim();
  if (quote.length <= BARE_PLACE_MAX) return { approve: false, reason: "evidence is only a place name" };

  const resolution = resolvePlace(trimmed);
  if (resolution.status === "ambiguous") return { approve: false, reason: "several places share this name" };
  if (resolution.status === "unknown") return { approve: false, reason: "place not in gazetteer" };

  const name = trimmed;
  let index = quote.indexOf(name);
  let sawName = false;
  while (index >= 0) {
    sawName = true;
    // Look a little past the name, not only at the next characters: "北京某基金会"
    // puts 某 between the city and the institution, so startsWith would miss it.
    const after = quote.slice(index + name.length, index + name.length + 10);
    if (!DATELINE_AFTER_NAME.test(after) && !INSTITUTION_WORDS.some(word => after.includes(word))) {
      return { approve: true, reason: "event place with clean quote", place: resolution.place };
    }
    index = quote.indexOf(name, index + 1);
  }
  if (!sawName) return { approve: false, reason: "place missing from evidence" };
  return { approve: false, reason: "every mention is an institution, outlet or dateline" };
}

export interface AutoReviewSummary {
  scanned: number;
  approved: number;
  skipped: number;
  placesCreated: number;
  reasons: Record<string, number>;
  samples: Array<{ candidateId: number; placeText: string; placeId: string | null; title: string }>;
}

interface PendingRow {
  id: number;
  article_id: string;
  analysis_id: number;
  place_text: string;
  role: GeoRole;
  evidence: string;
  title: string;
}

/**
 * Approves pending candidates one by one. A place is registered only when the
 * decision already resolved it, so the table never fills with unreviewed names.
 */
export async function autoApprovePending(options: { limit?: number; apply?: boolean; afterId?: number } = {}): Promise<AutoReviewSummary> {
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 2000);
  const apply = options.apply === true;
  const rows = await sql<PendingRow[]>`
    SELECT gc.id, gc.article_id, gc.analysis_id, gc.place_text, gc.role, gc.evidence, a.title
    FROM geo_candidates gc
    JOIN articles a ON a.id = gc.article_id
    JOIN analyses an ON an.id = gc.analysis_id AND an.input_revision = a.revision
    JOIN publications p ON p.article_id = gc.article_id AND p.analysis_id = gc.analysis_id
    WHERE gc.review_status = 'pending' AND gc.id > ${options.afterId ?? 0}
      AND p.visibility = 'public' AND p.eligible
    ORDER BY gc.id ASC
    LIMIT ${limit}`;

  const summary: AutoReviewSummary = { scanned: rows.length, approved: 0, skipped: 0, placesCreated: 0, reasons: {}, samples: [] };
  const note = (reason: string) => { summary.reasons[reason] = (summary.reasons[reason] ?? 0) + 1; };

  for (const row of rows) {
    const decision = decideAutoApproval({ placeText: row.place_text, role: row.role, evidence: row.evidence });
    if (!decision.approve || !decision.place) {
      summary.skipped += 1;
      note(decision.reason);
      continue;
    }
    const place = decision.place;
    summary.approved += 1;
    if (summary.samples.length < 12) {
      summary.samples.push({ candidateId: row.id, placeText: row.place_text, placeId: place.id, title: row.title });
    }
    if (!apply) continue;

    await sql.begin(async tx => {
      // A county-level row needs its prefecture to exist first: the parent is
      // what the map groups by, and the foreign key would refuse the insert
      // otherwise. The parent is written from the same gazetteer entry, so both
      // rows carry one source of coordinates.
      if (place.parent) {
        await tx`INSERT INTO geo_places (id, name, country_code, region, city, lat, lon, coordinate_precision, source_url)
          VALUES (${place.parent.id}, ${place.parent.name}, ${place.parent.countryCode}, ${place.parent.region},
            ${place.parent.city}, ${place.parent.lat}, ${place.parent.lon}, ${place.parent.precision},
            ${place.parent.sourceUrl})
          ON CONFLICT (id) DO NOTHING`;
      }
      const inserted = await tx<{ id: string }[]>`
        INSERT INTO geo_places (id, name, country_code, region, city, lat, lon, coordinate_precision, source_url, parent_id, parent_name)
        VALUES (${place.id}, ${place.name}, ${place.countryCode}, ${place.region}, ${place.city},
          ${place.lat}, ${place.lon}, ${place.precision}, ${place.sourceUrl},
          ${place.parent?.id ?? null}, ${place.parent?.name ?? null})
        ON CONFLICT (id) DO NOTHING RETURNING id`;
      if (inserted.length) summary.placesCreated += 1;

      // Re-check the same gates inside the transaction: a revision bump or a
      // republication between SELECT and UPDATE must not let stale evidence through.
      const [current] = await tx<{ id: number }[]>`
        SELECT gc.id FROM geo_candidates gc
        JOIN articles a ON a.id = gc.article_id
        JOIN analyses an ON an.id = gc.analysis_id AND an.input_revision = a.revision
        JOIN publications p ON p.article_id = gc.article_id AND p.analysis_id = gc.analysis_id
        WHERE gc.id = ${row.id} AND gc.review_status = 'pending'
          AND p.visibility = 'public' AND p.eligible
        FOR UPDATE OF gc`;
      if (!current) {
        summary.approved -= 1;
        summary.skipped += 1;
        note("changed before approval");
        return;
      }

      await tx`UPDATE geo_candidates
        SET review_status = 'verified', place_id = ${place.id},
            reviewed_by = ${AUTO_REVIEWER}, review_reason = ${decision.reason}, reviewed_at = now()
        WHERE id = ${row.id}`;
      await tx`INSERT INTO geo_review_audit (candidate_id, action, place_id, reviewer, reason)
        VALUES (${row.id}, 'approve', ${place.id}, ${AUTO_REVIEWER}, ${decision.reason})`;
    });
  }
  return summary;
}
