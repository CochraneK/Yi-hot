// Verified, event-role locations only. All reads go through the publication projection.
// AI candidates, publisher addresses, withdrawn items and unreleased selections are excluded.
import type { GeoReviewedResponse } from "@aihot/contracts/site";
import { sql } from "../db.ts";
import { ITEM_COLUMNS, ITEM_FROM, listedCondition, toFeedItemSummary, type ItemRow } from "./items.ts";

const PAGE_SIZE = 40;
const MAX_PAGES = 50;

export async function loadVerifiedGeoPool(placeId: string, wantedPage = 1, now = new Date()): Promise<GeoReviewedResponse> {
  const page = Math.min(Math.max(Math.floor(wantedPage) || 1, 1), MAX_PAGES);
  const offset = (page - 1) * PAGE_SIZE;
  const cap = PAGE_SIZE * MAX_PAGES;
  // A publication must still reference the same analysis/revision as the *approved* evidence.
  // There is intentionally no search over analyses.output or geo_candidates pending rows.
  const permitted = sql`${listedCondition(now)} AND p.eligible AND EXISTS (
    SELECT 1 FROM geo_candidates gc JOIN analyses an ON an.id = gc.analysis_id
    WHERE gc.article_id = p.article_id AND gc.analysis_id = p.analysis_id AND an.input_revision = p.revision
      AND gc.review_status = 'verified' AND gc.role = 'event' AND gc.place_id = ${placeId}
  )`;
  const [rows, totals] = await Promise.all([
    sql<ItemRow[]>`SELECT ${ITEM_COLUMNS} ${ITEM_FROM}
      WHERE ${permitted} ORDER BY coalesce(p.published_at, p.timeline_at) DESC, p.article_id DESC
      LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    sql<{ n: number }[]>`SELECT count(*)::int AS n FROM (
      SELECT p.article_id FROM publications p WHERE ${permitted}
      ORDER BY coalesce(p.published_at, p.timeline_at) DESC, p.article_id DESC LIMIT ${cap}
    ) bounded`,
  ]);
  const total = totals[0]?.n ?? 0;
  return {
    placeId,
    items: rows.map(toFeedItemSummary),
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    total,
    generatedAt: new Date().toISOString(),
  };
}
