// All geographic listings share the public projection and current reviewed event gate.
import type { GeoEventPlace, GeoHeatPoint, GeoHeatResponse, GeoLevel, GeoPlaceOption, GeoPlacesResponse, GeoReviewedResponse } from "@aihot/contracts/site";
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
  // Picking a city returns its counties' stories too, and picking a county
  // returns only that county. One predicate covers both: 江宁区 has no children
  // of its own, 南京 does, so `gp.id = X OR gp.parent_id = X` widens exactly at
  // the level the reader chose and nowhere else.
  const matchedPlace = sql`${filters.place ? sql`AND (gp.id = ${filters.place} OR gp.parent_id = ${filters.place})` : sql``} ${countryRegion} ${nearby}`;
  // Whether the picked place is a county decides what the list beside the feed
  // is grouped by: a city sums its counties into one row, a county stands alone
  // under its own name instead of being relabelled as the city above it.
  const target = filters.place
    ? (await sql<{ parent_id: string | null }[]>`SELECT parent_id FROM geo_places WHERE id = ${filters.place}`)[0]
    : undefined;
  const byCounty = !!target?.parent_id;
  const permitted = sql`${listedCondition(now)} AND p.eligible AND EXISTS (
    SELECT 1 FROM geo_candidates gc JOIN analyses an ON an.id = gc.analysis_id
    JOIN articles ar ON ar.id = gc.article_id JOIN geo_places gp ON gp.id = gc.place_id
    WHERE ${publicEvent} ${matchedPlace})`;
  // Without a filter the list groups by city: 江宁区 and 南京 are one place to a
  // reader choosing their city, and a district row would split that city's news
  // in two. The finer row still exists for the feed, which keeps the name the
  // story used — and once a county is picked, that row is the one shown.
  const fromWithCity = sql`${from} JOIN geo_places city ON city.id = coalesce(gp.parent_id, gp.id)`;
  const cityColumns = sql`city.id, city.name, city.country_code AS "countryCode", city.region, city.city,
    city.lat, city.lon, city.coordinate_precision AS precision`;
  const placeFrom = byCounty ? from : fromWithCity;
  const placeColumns = byCounty
    ? sql`gp.id, gp.name, gp.country_code AS "countryCode", gp.region, gp.city,
        gp.lat, gp.lon, gp.coordinate_precision AS precision`
    : cityColumns;
  const placeGroup = byCounty ? sql`gp.id` : sql`city.id`;
  const [rows, totals, places, catalog, countries, regions] = await Promise.all([
    sql<ItemRow[]>`SELECT ${ITEM_COLUMNS} ${ITEM_FROM} WHERE ${permitted}
      ORDER BY coalesce(p.published_at, p.timeline_at) DESC, p.article_id DESC
      LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
    sql<{ n: number }[]>`SELECT count(*)::int AS n FROM (
      SELECT p.article_id FROM publications p WHERE ${permitted} LIMIT ${cap + 1}
    ) bounded`,
    sql<Array<GeoEventPlace & { count: number }>>`SELECT ${placeColumns}, count(DISTINCT p.article_id)::int AS count
      ${placeFrom} WHERE ${publicEvent} ${matchedPlace} GROUP BY ${placeGroup}
      ORDER BY count DESC, ${placeGroup} LIMIT ${MAX_PLACES + 1}`,
    sql<GeoEventPlace[]>`SELECT DISTINCT ${cityColumns} ${fromWithCity} WHERE ${publicEvent} ${countryRegion}
      AND city.parent_id IS NULL
      ORDER BY city.name, city.id LIMIT ${MAX_PLACES + 1}`,
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
 * The longest window the heat map offers (the card's 月 button). The limit is a
 * cost ceiling, not a rule: the query scans publications by published_at, and a
 * month is the longest range the map is asked to answer.
 */
export const HEAT_MAX_HOURS = 720;

// 963 places carried a story as of 2026-11-16, and this list is what turns a
// `?place=` id back into a name. Cutting it at 500 silently dropped the tail,
// so a link to a quieter county rendered as "选择城市".
const PLACES_MAX = 1400;

/**
 * Every city the reader could pick as "my city", with how many stories it has.
 *
 * The feed picker has to speak the same ids the pool filter accepts; the static
 * city list in the web app predates canonical places and its ids match nothing.
 * Counts are all-time (not the heat window) so a reader can still choose a city
 * that was busy last month.
 */
export async function loadGeoPlaces(now = new Date()): Promise<GeoPlacesResponse> {
  // One row per place the feed can actually filter by, counties included: a
  // `?place=` link to 江宁区 has to come back with its name, not "选择城市".
  // The parent id is what lets the picker show a county under its city.
  //
  // The number beside a city is what the city's feed will hold, so a city counts
  // its counties too (同一个城市，选区和选市看到的是同一批报道). A county counts
  // only itself — the feed does the same, so the two never disagree.
  const rows = await sql<GeoPlaceOption[]>`
    WITH hits AS (
      SELECT gp.id AS place_id, coalesce(gp.parent_id, gp.id) AS city_id, p.article_id
      FROM publications p
      JOIN geo_candidates gc ON gc.article_id = p.article_id AND gc.analysis_id = p.analysis_id
      JOIN analyses an ON an.id = gc.analysis_id
      JOIN articles ar ON ar.id = p.article_id
      JOIN geo_places gp ON gp.id = gc.place_id
      WHERE ${listedCondition(now)} AND p.eligible
        AND an.input_revision = ar.revision
        AND gc.review_status = 'verified' AND gc.role = 'event'
    ), own AS (
      SELECT place_id AS id, count(DISTINCT article_id)::int AS n FROM hits GROUP BY 1
    ), city AS (
      SELECT city_id AS id, count(DISTINCT article_id)::int AS n FROM hits GROUP BY 1
    )
    SELECT gp.id, gp.name, gp.country_code AS "countryCode",
           coalesce(gp.region, parent.region) AS region, gp.city,
           gp.lat, gp.lon, gp.coordinate_precision AS precision,
           gp.parent_id AS "parentId",
           CASE WHEN gp.parent_id IS NULL THEN city.n ELSE own.n END AS count
    FROM geo_places gp
    JOIN own ON own.id = gp.id
    LEFT JOIN city ON city.id = gp.id
    LEFT JOIN geo_places parent ON parent.id = gp.parent_id
    ORDER BY count DESC, gp.name
    LIMIT ${PLACES_MAX}`;
  return { places: rows, generatedAt: new Date().toISOString() };
}

/**
 * How many reviewed events each city had in the last N hours.
 *
 * Same public gate as the listing: verified event places only, and the analysis
 * must still match the article revision and the current publication. Counts are
 * distinct articles, so one story filed from two places is not double-counted
 * inside a city.
 */
export async function loadGeoHeat(hours: number, level: GeoLevel = "city", now = new Date()): Promise<GeoHeatResponse> {
  const window = Math.min(Math.max(Math.floor(hours) || 48, 1), HEAT_MAX_HOURS);
  // The gate is identical at every level, so it is written once. Switching the
  // level regroups these rows; it never adds or drops a story except at 区,
  // where only stories filed at a county can appear at all.
  const from = sql`FROM publications p
    JOIN geo_candidates gc ON gc.article_id = p.article_id AND gc.analysis_id = p.analysis_id
    JOIN analyses an ON an.id = gc.analysis_id
    JOIN articles ar ON ar.id = p.article_id
    JOIN geo_places gp ON gp.id = gc.place_id`;
  const where = sql`WHERE ${listedCondition(now)} AND p.eligible
    AND an.input_revision = ar.revision
    AND gc.review_status = 'verified' AND gc.role = 'event'
    AND coalesce(p.published_at, p.timeline_at) >= ${now}::timestamptz - (${window} * interval '1 hour')`;

  const rows = level === "province"
    // A province has no coordinates of its own in any source we trust, so the
    // dot sits at the mean of the city centres behind it — inside the province,
    // pulled toward wherever the stories actually are.
    ? await sql<GeoHeatPoint[]>`
        SELECT 'province:' || city.region AS id, city.region AS name,
               min(city.country_code) AS "countryCode", city.region AS region,
               avg(city.lat)::float8 AS lat, avg(city.lon)::float8 AS lon,
               count(DISTINCT p.article_id)::int AS count
        ${from}
        JOIN geo_places city ON city.id = coalesce(gp.parent_id, gp.id)
        ${where} AND coalesce(city.region, '') <> ''
        GROUP BY city.region
        ORDER BY count DESC, city.region
        LIMIT ${HEAT_MAX_POINTS + 1}`
    : level === "district"
    // Counties carry their prefecture's coordinates — the source has no county
    // centroids — so the map spreads them around that point by index instead of
    // pretending to know where inside the city they are.
    ? await sql<GeoHeatPoint[]>`
        SELECT gp.id, gp.name, gp.country_code AS "countryCode",
               coalesce(gp.region, city.region) AS region, gp.lat, gp.lon,
               count(DISTINCT p.article_id)::int AS count
        ${from}
        JOIN geo_places city ON city.id = coalesce(gp.parent_id, gp.id)
        ${where} AND gp.parent_id IS NOT NULL
        GROUP BY gp.id, city.region
        ORDER BY count DESC, gp.id
        LIMIT ${HEAT_MAX_POINTS + 1}`
    : await sql<GeoHeatPoint[]>`
        SELECT city.id, city.name, city.country_code AS "countryCode", city.region, city.lat, city.lon,
               count(DISTINCT p.article_id)::int AS count
        ${from}
        JOIN geo_places city ON city.id = coalesce(gp.parent_id, gp.id)
        ${where}
        GROUP BY city.id
        ORDER BY count DESC, city.id
        LIMIT ${HEAT_MAX_POINTS + 1}`;

  const points = rows.slice(0, HEAT_MAX_POINTS).map(({ id, name, countryCode, region, lat, lon, count }) =>
    ({ id, name, countryCode, region, lat, lon, count }));
  const [totals] = await sql<{ n: number }[]>`
    SELECT count(DISTINCT p.article_id)::int AS n
    ${from} ${where}`;
  return {
    hours: window,
    level,
    points,
    articles: totals?.n ?? 0,
    truncated: rows.length > HEAT_MAX_POINTS,
    generatedAt: new Date().toISOString(),
  };
}
