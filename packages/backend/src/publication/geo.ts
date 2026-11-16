// All geographic listings share the public projection and current reviewed event gate.
import type { GeoEventPlace, GeoHeatPoint, GeoHeatResponse, GeoReviewedResponse } from "@aihot/contracts/site";
import { sql } from "../db.ts";
import { ITEM_COLUMNS, ITEM_FROM, listedCondition, toFeedItemSummary, type ItemRow } from "./items.ts";

const PAGE_SIZE = 40;
const MAX_PAGES = 50;
const MAX_PLACES = 1000;
export interface GeoFilters {
  place?: string;
  country?: string;
  region?: string;
  lat?: number;
  lon?: number;
  radius?: number;
}

/** Used by API and offline tests. No geocoding, IP service or database access. */
export function parseGeoFilters(q: Record<string, string | undefined>): GeoFilters {
  const place = q.place?.trim() || undefined;
  const country = q.country?.trim().toUpperCase() || undefined;
  const region = q.region?.trim() || undefined;
  if (place && !/^[a-z0-9][a-z0-9-]{1,79}$/.test(place)) throw new Error("invalid place id");
  if (country && !/^[A-Z]{2}$/.test(country)) throw new Error("invalid country");
  if (region && (region.length > 120 || !country)) throw new Error("region requires country and at most 120 characters");
  const hasNear = [q.lat, q.lon, q.radius].some(v => v !== undefined);
  if (!hasNear) return { place, country, region };
  if ([q.lat, q.lon, q.radius].some(v => v === undefined || !v.trim())) throw new Error("incomplete nearby coordinates");
  const lat = Number(q.lat), lon = Number(q.lon), radius = Number(q.radius);
  if (![lat, lon, radius].every(Number.isFinite) || lat < -90 || lat > 90 || lon < -180 || lon > 180 || radius < 1 || radius > 1000)
    throw new Error("invalid nearby coordinates or radius (1–1000 km)");
  return { place, country, region, lat, lon, radius };
}

export async function loadVerifiedGeoPool(input: string | GeoFilters = {}, wantedPage = 1, now = new Date()): Promise<GeoReviewedResponse> {
  const filters = typeof input === "string" ? { place: input } : input;
  const page = Math.min(Math.max(Math.floor(wantedPage) || 1, 1), MAX_PAGES);
  const cap = PAGE_SIZE * MAX_PAGES;
  const publicEvent = sql`${listedCondition(now)} AND p.eligible
    AND gc.article_id = p.article_id AND gc.analysis_id = p.analysis_id
    AND an.input_revision = ar.revision AND gc.review_status = 'verified' AND gc.role = 'event'`;
  const from = sql`FROM publications p JOIN articles ar ON ar.id = p.article_id
    JOIN geo_candidates gc ON gc.article_id = p.article_id JOIN analyses an ON an.id = gc.analysis_id
    JOIN geo_places gp ON gp.id = gc.place_id`;
  const nearby = filters.lat !== undefined && filters.lon !== undefined && filters.radius !== undefined
    // Use only city centres for nearby; country/region centroids cannot support that claim.
    ? sql`AND gp.coordinate_precision = 'city' AND 6371 * 2 * asin(sqrt(least(1.0, greatest(0.0,
      power(sin(radians(gp.lat - ${filters.lat}) / 2), 2)
      + cos(radians(${filters.lat})) * cos(radians(gp.lat)) * power(sin(radians(gp.lon - ${filters.lon}) / 2), 2)
    )))) <= ${filters.radius}` : sql``;
  const countryRegion = sql`${filters.country ? sql`AND gp.country_code = ${filters.country}` : sql``}
    ${filters.region ? sql`AND gp.region = ${filters.region}` : sql``}`;
  const matchedPlace = sql`${filters.place ? sql`AND gp.id = ${filters.place}` : sql``} ${countryRegion} ${nearby}`;
  const permitted = sql`${listedCondition(now)} AND p.eligible AND EXISTS (
    SELECT 1 FROM geo_candidates gc JOIN analyses an ON an.id = gc.analysis_id
    JOIN articles ar ON ar.id = gc.article_id JOIN geo_places gp ON gp.id = gc.place_id
    WHERE ${publicEvent} ${matchedPlace})`;
  const columns = sql`gp.id, gp.name, gp.country_code AS "countryCode", gp.region, gp.city,
    gp.lat, gp.lon, gp.coordinate_precision AS precision`;
  const [rows, totals, places, catalog, countries, regions] = await Promise.all([
    sql<ItemRow[]>`SELECT ${ITEM_COLUMNS} ${ITEM_FROM} WHERE ${permitted}
      ORDER BY coalesce(p.published_at, p.timeline_at) DESC, p.article_id DESC
      LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
    sql<{ n: number }[]>`SELECT count(*)::int AS n FROM (
      SELECT p.article_id FROM publications p WHERE ${permitted} LIMIT ${cap + 1}
    ) bounded`,
    sql<Array<GeoEventPlace & { count: number }>>`SELECT ${columns}, count(DISTINCT p.article_id)::int AS count
      ${from} WHERE ${publicEvent} ${matchedPlace} GROUP BY gp.id
      ORDER BY count DESC, gp.id LIMIT ${MAX_PLACES + 1}`,
    sql<GeoEventPlace[]>`SELECT DISTINCT ${columns} ${from} WHERE ${publicEvent} ${countryRegion}
      ORDER BY gp.name, gp.id LIMIT ${MAX_PLACES + 1}`,
    sql<{ code: string }[]>`SELECT DISTINCT gp.country_code AS code ${from} WHERE ${publicEvent} ORDER BY code`,
    filters.country ? sql<{ name: string }[]>`SELECT DISTINCT gp.region AS name ${from}
      WHERE ${publicEvent} AND gp.country_code = ${filters.country} AND gp.region IS NOT NULL
      ORDER BY name LIMIT ${MAX_PLACES + 1}` : Promise.resolve([]),
  ]);
  const n = totals[0]?.n ?? 0;
  const total = Math.min(n, cap);
  return {
    placeId: filters.place ?? "", items: rows.map(toFeedItemSummary),
    places: places.slice(0, MAX_PLACES), catalog: catalog.slice(0, MAX_PLACES),
    countries: countries.map(c => c.code), regions: regions.slice(0, MAX_PLACES).map(r => r.name),
    placesTruncated: places.length > MAX_PLACES, catalogTruncated: catalog.length > MAX_PLACES || regions.length > MAX_PLACES,
    totalCapped: n > cap, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)), total,
    generatedAt: new Date().toISOString(),
  };
}

const HEAT_MAX_POINTS = 400;

/**
 * How many reviewed events each city had in the last N hours.
 *
 * Same public gate as the listing: verified event places only, and the analysis
 * must still match the article revision and the current publication. Counts are
 * distinct articles, so one story filed from two places is not double-counted
 * inside a city.
 */
export async function loadGeoHeat(hours: number, now = new Date()): Promise<GeoHeatResponse> {
  const window = Math.min(Math.max(Math.floor(hours) || 48, 1), 168);
  const rows = await sql<Array<GeoHeatPoint & { articles: number }>>`
    SELECT gp.id, gp.name, gp.country_code AS "countryCode", gp.lat, gp.lon,
           count(DISTINCT p.article_id)::int AS count
    FROM publications p
    JOIN geo_candidates gc ON gc.article_id = p.article_id AND gc.analysis_id = p.analysis_id
    JOIN analyses an ON an.id = gc.analysis_id
    JOIN articles ar ON ar.id = p.article_id
    JOIN geo_places gp ON gp.id = gc.place_id
    WHERE ${listedCondition(now)} AND p.eligible
      AND an.input_revision = ar.revision
      AND gc.review_status = 'verified' AND gc.role = 'event'
      AND coalesce(p.published_at, p.timeline_at) >= ${now}::timestamptz - (${window} * interval '1 hour')
    GROUP BY gp.id
    ORDER BY count DESC, gp.id
    LIMIT ${HEAT_MAX_POINTS + 1}`;
  const points = rows.slice(0, HEAT_MAX_POINTS).map(({ id, name, countryCode, lat, lon, count }) =>
    ({ id, name, countryCode, lat, lon, count }));
  const [totals] = await sql<{ n: number }[]>`
    SELECT count(DISTINCT p.article_id)::int AS n
    FROM publications p
    JOIN geo_candidates gc ON gc.article_id = p.article_id AND gc.analysis_id = p.analysis_id
    JOIN analyses an ON an.id = gc.analysis_id
    JOIN articles ar ON ar.id = p.article_id
    WHERE ${listedCondition(now)} AND p.eligible
      AND an.input_revision = ar.revision
      AND gc.review_status = 'verified' AND gc.role = 'event'
      AND coalesce(p.published_at, p.timeline_at) >= ${now}::timestamptz - (${window} * interval '1 hour')`;
  return {
    hours: window,
    points,
    articles: totals?.n ?? 0,
    truncated: rows.length > HEAT_MAX_POINTS,
    generatedAt: new Date().toISOString(),
  };
}
