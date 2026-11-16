// Operator-only geographical review. Never import from public site routes.
// All approvals are explicit, version-scoped and written to an append-only audit log.
import { sql } from "../db.ts";

export interface GeoPlaceInput {
  id: string; name: string; countryCode: string; region?: string | null; city?: string | null;
  lat: number; lon: number; precision: "country" | "region" | "city"; sourceUrl: string;
}

export function validateGeoPlace(p: GeoPlaceInput): GeoPlaceInput {
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(p.id)) throw Error("invalid place id");
  if (!p.name.trim() || p.name.length > 120) throw Error("invalid place name");
  if (!/^[A-Z]{2}$/.test(p.countryCode)) throw Error("invalid ISO 3166 country code");
  if (![p.lat, p.lon].every(Number.isFinite) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) throw Error("invalid coordinates");
  if (!["country", "region", "city"].includes(p.precision)) throw Error("invalid precision");
  const source = new URL(p.sourceUrl);
  if (source.protocol !== "https:" || !source.hostname.includes(".")) throw Error("place provenance requires HTTPS URL");
  return p;
}

export async function registerGeoPlace(input: GeoPlaceInput, review?: { actor: string; reason: string }): Promise<void> {
  const p = validateGeoPlace(input);
  await sql.begin(async tx => {
    await tx`INSERT INTO geo_places (id, name, country_code, region, city, lat, lon, coordinate_precision, source_url)
      VALUES (${p.id}, ${p.name.trim()}, ${p.countryCode}, ${p.region?.trim() || null}, ${p.city?.trim() || null},
        ${p.lat}, ${p.lon}, ${p.precision}, ${p.sourceUrl})`;
    if (review) await tx`INSERT INTO audit_log (actor, action, subject, reason, before, after)
      VALUES (${review.actor}, 'geo.place.create', ${'geo-place:'+p.id}, ${review.reason}, NULL, ${tx.json(p as never)})`;
  });
}

export async function pendingGeoCandidates(limit = 30) {
  return sql<{
    id: number; article_id: string; analysis_id: number; place_text: string; role: string; evidence: string;
    title: string; url: string; input_revision: number; current_revision: number;
  }[]>`SELECT g.id, g.article_id, g.analysis_id, g.place_text, g.role, g.evidence, ar.title, ar.url,
      an.input_revision, ar.revision AS current_revision
    FROM geo_candidates g
    JOIN analyses an ON an.id = g.analysis_id
    JOIN articles ar ON ar.id = g.article_id
    WHERE g.review_status = 'pending' AND an.input_revision = ar.revision
    ORDER BY g.id ASC LIMIT ${Math.max(1, Math.min(Math.floor(limit), 50))}`;
}

export type GeoReviewAction = "approve" | "reject" | "reopen";
export interface GeoReviewInput {
  id: number; action: GeoReviewAction; reviewer: string; reason: string; placeId?: string;
}

export function validateGeoReview(input: GeoReviewInput) {
  if (!Number.isSafeInteger(input.id) || input.id < 1) throw Error("invalid candidate id");
  if (!["approve", "reject", "reopen"].includes(input.action)) throw Error("invalid review action");
  if (!input.reviewer.trim() || input.reviewer.length > 100) throw Error("reviewer required");
  if (input.reason.trim().length < 4 || input.reason.length > 800) throw Error("review reason must be 4-800 chars");
  if ((input.action === "approve") !== Boolean(input.placeId)) throw Error("only approval requires a place id");
  return input;
}

export async function reviewGeoCandidate(input: GeoReviewInput): Promise<void> {
  const q = validateGeoReview(input);
  await sql.begin(async tx => {
    const [candidate] = await tx<{
      id: number; review_status: string; place_id: string | null; input_revision: number; current_revision: number; analysis_id: number; publication_analysis_id: number | null;
    }[]>`SELECT g.id, g.review_status, g.place_id, an.input_revision, ar.revision AS current_revision, g.analysis_id, p.analysis_id AS publication_analysis_id
      FROM geo_candidates g
      JOIN analyses an ON an.id = g.analysis_id
      JOIN articles ar ON ar.id = g.article_id
      LEFT JOIN publications p ON p.article_id = g.article_id
      WHERE g.id = ${q.id} FOR UPDATE OF g, ar`;
    if (!candidate) throw Error("candidate not found");
    if (q.action === "reopen") {
      if (candidate.review_status === "pending") throw Error("candidate is already pending");
      await tx`UPDATE geo_candidates SET review_status = 'pending', place_id = NULL, reviewed_by = NULL,
        review_reason = NULL, reviewed_at = NULL WHERE id = ${q.id}`;
    } else {
      if (candidate.review_status !== "pending") throw Error("candidate already reviewed; reopen with reason first");
      if (q.action === "approve" && candidate.input_revision !== candidate.current_revision) throw Error("article revision changed; cannot approve stale evidence");
      if (q.action === "approve" && candidate.publication_analysis_id !== candidate.analysis_id) throw Error("current publication no longer references candidate analysis");
      if (q.action === "approve") {
        const [place] = await tx<{ id: string }[]>`SELECT id FROM geo_places WHERE id = ${q.placeId!}`;
        if (!place) throw Error("unknown place id; register a sourced canonical place first");
        await tx`UPDATE geo_candidates SET review_status = 'verified', place_id = ${place.id},
          reviewed_by = ${q.reviewer.trim()}, review_reason = ${q.reason.trim()}, reviewed_at = now()
          WHERE id = ${q.id}`;
      } else {
        await tx`UPDATE geo_candidates SET review_status = 'rejected', place_id = NULL,
          reviewed_by = ${q.reviewer.trim()}, review_reason = ${q.reason.trim()}, reviewed_at = now()
          WHERE id = ${q.id}`;
      }
    }
    await tx`INSERT INTO geo_review_audit (candidate_id, action, place_id, reviewer, reason)
      VALUES (${q.id}, ${q.action}, ${q.action === "approve" ? q.placeId! : candidate.place_id}, ${q.reviewer.trim()}, ${q.reason.trim()})`;
  });
}
