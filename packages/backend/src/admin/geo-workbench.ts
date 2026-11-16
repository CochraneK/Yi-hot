import { z } from "zod";
import type { GeoReviewPage, GeoReviewRow, GeoReviewPlace } from "@aihot/contracts/geo-review";
import { sql } from "../db.ts";
import { registerGeoPlace, reviewGeoCandidate } from "./geo.ts";

const querySchema = z.object({
  status: z.enum(["pending", "verified", "rejected"]).default("pending"),
  role: z.enum(["event", "affected", "publisher", "mentioned"]).optional(),
  q: z.string().max(120).default(""), placeQ: z.string().max(120).default(""),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  stale: z.enum(["0", "1"]).default("0"),
}).strict();
const reviewSchema = z.object({
  action: z.enum(["approve", "reject", "reopen"]), reason: z.string().trim().min(4).max(800),
  placeId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/).optional(),
}).strict();
const placeSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/), name: z.string().trim().min(1).max(120),
  countryCode: z.string().regex(/^[A-Z]{2}$/), region: z.string().trim().max(120).optional(), city: z.string().trim().max(120).optional(),
  lat: z.number().finite().min(-90).max(90), lon: z.number().finite().min(-180).max(180),
  precision: z.enum(["country", "region", "city"]), sourceUrl: z.string().url().max(2000),
  reason: z.string().trim().min(4).max(800),
}).strict();
export function parseGeoReviewQuery(input: unknown) { return parse(querySchema, input); }
export function parseGeoReviewCommand(input: unknown) {
  const q = parse(reviewSchema, input);
  if ((q.action === "approve") !== Boolean(q.placeId)) throw invalid("only approval requires a place id");
  return q;
}
export function parseGeoPlaceCommand(input: unknown) {
  const q = parse(placeSchema, input);
  const u = new URL(q.sourceUrl);
  if (u.protocol !== "https:" || !u.hostname.includes(".") || u.username || u.password) throw invalid("place source requires a public HTTPS reference");
  return q;
}
function invalid(message: string) { return Object.assign(new Error(message), { statusCode: 400 }); }
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw invalid("Invalid geographic review fields");
  return result.data;
}
export async function geoReviewPage(input: unknown): Promise<GeoReviewPage> {
  const f = parseGeoReviewQuery(input);
  const current = sql`an.input_revision = ar.revision AND p.analysis_id = g.analysis_id`;
  const filter = sql`g.review_status = ${f.status}
    ${f.role ? sql`AND g.role = ${f.role}` : sql``}
    ${f.stale === "0" ? sql`AND ${current}` : sql``}
    ${f.q.trim() ? sql`AND (g.place_text ILIKE ${"%" + f.q.trim() + "%"} OR ar.title ILIKE ${"%" + f.q.trim() + "%"})` : sql``}`;
  const from = sql`FROM geo_candidates g JOIN analyses an ON an.id = g.analysis_id
    JOIN articles ar ON ar.id = g.article_id LEFT JOIN publications p ON p.article_id = g.article_id`;
  const [rows, totals, places] = await Promise.all([
    sql<GeoReviewRow[]>`SELECT g.id AS id, g.article_id AS "articleId", g.analysis_id AS "analysisId",
      g.place_text AS "placeText", g.role, g.evidence, g.review_status AS status, g.place_id AS "placeId",
      ar.title, ar.url, an.input_revision AS "inputRevision", ar.revision AS "currentRevision",
      coalesce(p.analysis_id = g.analysis_id, false) AS "currentAnalysis", p.visibility, coalesce(p.eligible, false) AS eligible,
      g.reviewed_by AS "reviewedBy", g.review_reason AS "reviewReason"
      ${from} WHERE ${filter} ORDER BY g.id DESC LIMIT 25 OFFSET ${(f.page - 1) * 25}`,
    sql<{ n: number }[]>`SELECT count(*)::int AS n ${from} WHERE ${filter}`,
    sql<GeoReviewPlace[]>`SELECT id, name, country_code AS "countryCode", region, city, lat, lon,
      coordinate_precision AS precision, source_url AS "sourceUrl" FROM geo_places
      ${f.placeQ.trim() ? sql`WHERE name ILIKE ${"%"+f.placeQ.trim()+"%"} OR id ILIKE ${"%"+f.placeQ.trim()+"%"}` : sql``}
      ORDER BY name, id LIMIT 501`,
  ]);
  const total = totals[0]?.n ?? 0;
  return { rows, places: places.slice(0, 500), placesTruncated: places.length > 500, total, page: f.page,
    pageCount: Math.min(1000, Math.max(1, Math.ceil(total / 25))), filters: { status: f.status, role: f.role ?? null, q: f.q, placeQ: f.placeQ, includeStale: f.stale === "1" } };
}
export async function reviewGeoFromWeb(idText: string, input: unknown, actor: string): Promise<void> {
  if (!/^[1-9][0-9]*$/.test(idText) || !Number.isSafeInteger(Number(idText))) throw invalid("invalid candidate id");
  const q = parseGeoReviewCommand(input);
  try { await reviewGeoCandidate({ id: Number(idText), ...q, reviewer: actor }); }
  catch (error) {
    const e = error as Error & { code?: string };
    if (/already|revision changed|current publication/.test(e.message)) throw Object.assign(e, { code: "conflict" });
    if (/not found|unknown place|invalid|requires|required/.test(e.message)) throw invalid(e.message);
    throw error;
  }
}
export async function createGeoPlaceFromWeb(input: unknown, actor: string): Promise<void> {
  const { reason, ...place } = parseGeoPlaceCommand(input);
  try { await registerGeoPlace(place, { actor, reason }); }
  catch (error) {
    if ((error as { code?: string }).code === "23505") throw Object.assign(new Error("Place id already exists; use the registered place"), { code: "conflict" });
    throw error;
  }
}
