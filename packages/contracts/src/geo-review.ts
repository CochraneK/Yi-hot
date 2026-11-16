/** Admin-only DTOs. Never returned by the public geography API. */
export type GeoRole = "event" | "affected" | "publisher" | "mentioned";
export type GeoStatus = "pending" | "verified" | "rejected";
export interface GeoReviewRow {
  id: number; articleId: string; analysisId: number; placeText: string; role: GeoRole; evidence: string;
  status: GeoStatus; placeId: string | null; title: string; url: string;
  inputRevision: number; currentRevision: number; currentAnalysis: boolean;
  visibility: string | null; eligible: boolean; reviewedBy: string | null; reviewReason: string | null;
}
export interface GeoReviewPlace {
  id: string; name: string; countryCode: string; region: string | null; city: string | null;
  lat: number; lon: number; precision: "country" | "region" | "city"; sourceUrl: string;
}
export interface GeoReviewPage {
  rows: GeoReviewRow[]; places: GeoReviewPlace[]; placesTruncated: boolean;
  total: number; page: number; pageCount: number;
  filters: { status: GeoStatus; role: GeoRole | null; q: string; placeQ: string; includeStale: boolean };
}
