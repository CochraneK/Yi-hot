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
//      head of an institution, outlet or policy range ("北京某基金会").
//   4. the quote is more than a bare place name.
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
  "派出所", "法院", "检察院", "街道办", "居委会", "办事处", "管理中心",
  "报社", "杂志社", "电视台", "广播电台", "日报", "晚报", "新闻网",
];

/** A quote that only names a place says nothing about an event happening there. */
const BARE_PLACE_MAX = 6;

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
    if (!INSTITUTION_WORDS.some(word => after.includes(word))) {
      return { approve: true, reason: "event place with clean quote", place: resolution.place };
    }
    index = quote.indexOf(name, index + 1);
  }
  if (!sawName) return { approve: false, reason: "place missing from evidence" };
  return { approve: false, reason: "every mention is an institution or outlet" };
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
      const inserted = await tx<{ id: string }[]>`
        INSERT INTO geo_places (id, name, country_code, region, city, lat, lon, coordinate_precision, source_url)
        VALUES (${place.id}, ${place.name}, ${place.countryCode}, ${place.region}, ${place.city},
          ${place.lat}, ${place.lon}, ${place.precision}, ${place.sourceUrl})
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
