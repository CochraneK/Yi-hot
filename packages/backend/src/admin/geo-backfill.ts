// Offline reuse of geography candidates already stored inside analyses.output.
// Manual execution only. Never calls a model, publishes material, or approves a location.
import { sql } from "../db.ts";
import { loadAnalyzeInput } from "../editorial/input.ts";
import { GeoCandidateSchema, groundGeoCandidates, type GeoCandidate } from "../editorial/geography.ts";

export interface GeoBackfillOptions {
  afterId?: number;
  limit?: number;
  apply?: boolean;
}

export interface GeoBackfillResult {
  mode: "preview" | "apply";
  scanned: number;
  grounded: number;
  inserted: number;
  rejected: number;
  skippedChanged: number;
  lastAnalysisId: number;
  morePossible: boolean;
}

export function validateGeoBackfillOptions(opts: GeoBackfillOptions) {
  const afterId = opts.afterId ?? 0;
  const limit = opts.limit ?? 100;
  if (!Number.isSafeInteger(afterId) || afterId < 0) throw Error("afterId must be a non-negative safe integer");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw Error("limit must be an integer from 1 to 200");
  return { afterId, limit, apply: opts.apply === true };
}

export async function backfillSavedGeoCandidates(opts: GeoBackfillOptions = {}): Promise<GeoBackfillResult> {
  const { afterId, limit, apply } = validateGeoBackfillOptions(opts);
  const analyses = await sql<{
    analysis_id: number; article_id: string; revision: number; candidates: unknown;
  }[]>`
    SELECT an.id AS analysis_id, an.article_id, an.input_revision AS revision,
           an.output #> '{geography,candidates}' AS candidates
    FROM analyses an
    JOIN articles a ON a.id = an.article_id AND a.revision = an.input_revision
    JOIN publications p ON p.article_id = an.article_id AND p.analysis_id = an.id
    WHERE an.id > ${afterId}
      AND p.visibility = 'public' AND p.eligible
      AND an.output->'geography'->>'status' = 'candidate'
      AND jsonb_typeof(an.output #> '{geography,candidates}') = 'array'
    ORDER BY an.id ASC LIMIT ${limit}`;
  const result: GeoBackfillResult = {
    mode: apply ? "apply" : "preview",
    scanned: analyses.length, grounded: 0, inserted: 0, rejected: 0,
    skippedChanged: 0, lastAnalysisId: afterId, morePossible: analyses.length === limit,
  };
  for (const a of analyses) {
    result.lastAnalysisId = a.analysis_id;
    const raw = Array.isArray(a.candidates) ? a.candidates : [];
    const parsed: GeoCandidate[] = [];
    for (const item of raw) {
      const one = GeoCandidateSchema.safeParse(item);
      if (one.success) parsed.push(one.data);
      else result.rejected += 1;
    }
    const input = await loadAnalyzeInput(a.article_id);
    if (!input || input.revision !== a.revision) {
      result.skippedChanged += 1;
      continue;
    }
    const grounded = groundGeoCandidates(input, parsed);
    result.grounded += grounded.length;
    result.rejected += parsed.length - grounded.length;
    if (!apply) continue;
    // Recheck the current publication and article *inside* each INSERT. Even if a review or
    // a new analysis races this job, stale AI output can never create a new current candidate.
    for (const hint of grounded) {
      const rows = await sql<{ id: number }[]>`
        INSERT INTO geo_candidates (article_id, analysis_id, place_text, role, evidence)
        SELECT an.article_id, an.id, ${hint.place}, ${hint.role}, ${hint.evidence}
        FROM analyses an
        JOIN articles ar ON ar.id = an.article_id AND ar.revision = an.input_revision
        JOIN publications p ON p.article_id = an.article_id AND p.analysis_id = an.id
        WHERE an.id = ${a.analysis_id} AND p.visibility = 'public' AND p.eligible
        ON CONFLICT (analysis_id, place_text, role, evidence) DO NOTHING RETURNING id`;
      result.inserted += rows.length;
    }
  }
  return result;
}
