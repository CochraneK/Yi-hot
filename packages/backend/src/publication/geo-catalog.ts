// The list itself lives in geo-catalog-select.ts; this file adds counts and caching.
import type { GeoCatalogResponse } from "@aihot/contracts/site";
import { sql } from "../db.ts";
import { allDivisions, gazetteerEntries } from "../editorial/geo-gazetteer.ts";
import { catalogRegions, selectCatalogPlaces } from "./geo-catalog-select.ts";

export { catalogRegions, selectCatalogPlaces } from "./geo-catalog-select.ts";

interface CountRow {
  id: string;
  count: number;
}

const CACHE_MS = 5 * 60_000;
let cached: { at: number; data: GeoCatalogResponse } | null = null;

/**
 * How many listed stories each place has. Same public gate as the feed.
 *
 * Two passes, one map: cities count everything filed at or under them, counties
 * count only their own stories. Adding the county numbers up would be wrong —
 * one article can sit in two counties of the same city — so the city total is
 * counted from the rows, not summed from the parts.
 */
async function loadPlaceCounts(): Promise<Map<string, number>> {
  const [cityRows, countyRows] = await Promise.all([
    sql<CountRow[]>`
      SELECT coalesce(gp.parent_id, gp.id) AS id, count(DISTINCT p.article_id)::int AS count
      FROM publications p
      JOIN geo_candidates gc ON gc.article_id = p.article_id AND gc.analysis_id = p.analysis_id
      JOIN analyses an ON an.id = gc.analysis_id
      JOIN articles ar ON ar.id = p.article_id
      JOIN geo_places gp ON gp.id = gc.place_id
      WHERE p.eligible
        AND an.input_revision = ar.revision
        AND gc.review_status = 'verified' AND gc.role = 'event'
        AND gc.place_id IS NOT NULL
      GROUP BY 1`,
    sql<CountRow[]>`
      SELECT gp.id AS id, count(DISTINCT p.article_id)::int AS count
      FROM publications p
      JOIN geo_candidates gc ON gc.article_id = p.article_id AND gc.analysis_id = p.analysis_id
      JOIN analyses an ON an.id = gc.analysis_id
      JOIN articles ar ON ar.id = p.article_id
      JOIN geo_places gp ON gp.id = gc.place_id
      WHERE p.eligible
        AND an.input_revision = ar.revision
        AND gc.review_status = 'verified' AND gc.role = 'event'
        AND gc.place_id IS NOT NULL AND gp.parent_id IS NOT NULL
      GROUP BY 1`,
  ]);
  const counts = new Map(cityRows.map(row => [row.id, row.count]));
  for (const row of countyRows) counts.set(row.id, row.count);
  return counts;
}

export async function loadGeoCatalog(): Promise<GeoCatalogResponse> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;
  const counts = await loadPlaceCounts();
  const places = selectCatalogPlaces(gazetteerEntries(), counts, allDivisions());
  const data: GeoCatalogResponse = {
    places,
    regions: catalogRegions(places),
    generatedAt: new Date().toISOString(),
  };
  cached = { at: Date.now(), data };
  return data;
}
