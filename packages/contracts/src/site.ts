// First-party site API (/api/site/*). Not a public API: it may evolve with the website,
// but it is served from the same public read layer as v1, RSS and MCP.
import type { CategoryKey, ChannelKey } from "./taxonomy.ts";

export type SourceKind = "rss" | "web_list" | "json_list" | "x_search" | "search" | "mp_account" | "external" | "peer";

export interface SourceRef {
  id: string;
  name: string;
  kind: SourceKind;
  firstParty: boolean;
  iconUrl: string | null;
  iconSrcSet?: string;
}

export interface MediaView {
  kind: "image" | "video";
  url: string;
  /** Full image for an on-demand viewer; list previews stay small. */
  fullUrl?: string;
  width: number | null;
  height: number | null;
  alt: string | null;
  poster: string | null;
  srcSet?: string;
}

export interface XPostView {
  authorName: string;
  handle: string;
  avatarUrl: string | null;
  avatarSrcSet?: string;
  text: string;
  translation: string | null;
  /** translation: Chinese translation of the quoted post, when it is in another language. */
  quoted: { authorName: string; handle: string; text: string; url: string; translation: string | null } | null;
  media: MediaView[];
}

export interface StoryRef {
  publicId: string;
  title: string;
}

export interface GeoEventPlace {
  id: string;
  name: string;
  countryCode: string;
  region: string | null;
  city: string | null;
  lat: number;
  lon: number;
  precision: "country" | "region" | "city";
}

export interface ItemSummary {
  /** Current, manually verified event places only. No candidate evidence or reviewer identity. */
  eventPlaces?: GeoEventPlace[];
  id: string;
  revision: number;
  title: string;
  originalTitle: string | null;
  summary: string | null;
  reason: string | null;
  source: SourceRef;
  links: { aihot: string; original: string };
  publishedAt: string | null;
  publishedAtPrecision: "date" | "datetime";
  discoveredAt: string;
  timelineAt: string;
  category: CategoryKey | null;
  tags: string[];
  score: number | null;
  selected: boolean;
  channel: "news" | "x";
  story: StoryRef | null;
  x: XPostView | null;
}

/** The fields rendered by a site feed card; full original text lives in the item detail. */
export interface FeedItemSummary extends Pick<ItemSummary, "id" | "title" | "summary" | "reason" | "publishedAt" | "publishedAtPrecision" | "discoveredAt" | "timelineAt" | "category" | "tags" | "score" | "selected" | "channel"> {
  eventPlaces?: GeoEventPlace[];
  source: Pick<SourceRef, "name">;
  x: (Pick<XPostView, "authorName" | "handle" | "avatarUrl" | "avatarSrcSet" | "media"> & {
    quoted: Omit<NonNullable<XPostView["quoted"]>, "url"> | null;
  }) | null;
}

export interface GroupInfo {
  factId: string;
  story: StoryRef | null;
  /** Other public sources of the fact the card represents (same set as the expandable reports). */
  additionalSourceCount: number;
  /** Distinct public reports across the group's facts. */
  reportCount: number;
  /** Facts of the group (the card's own included) with at least one selected item under the current filters. */
  developmentCount: number;
  /** The newest development when it is not the card's own fact: why the card sits where it does. */
  latestDevelopment?: { factId: string; title: string; at: string } | null;
  /**
   * The selected reports of this group under the current filters. The timeline's reader-side unread
   * filter keeps a group while any of them is unread; other callers omit it.
   */
  memberIds?: string[];
}

export interface TimelineCard {
  key: string;
  /** Sort position: the clock the slot prints, newest first. */
  anchorAt: string;
  /** The calendar day (YYYY-MM-DD, Beijing) the card is filed under. A date-only article keeps its own day. */
  dayAt: string;
  item: FeedItemSummary;
  group: GroupInfo | null;
}

export interface HotStripEntry {
  rank: number;
  title: string;
  heat: number;
  trend: "up" | "down" | "flat" | "new" | "unknown";
  storyPublicId: string | null;
  itemId: string | null;
  participants: HotParticipant[];
  participantCount: number;
}

export interface TimelineFilters {
  channel: ChannelKey;
  category: CategoryKey | null;
  tag: string | null;
  topic?: string | null;
}

export interface TimelineResponse {
  filters: TimelineFilters;
  cards: TimelineCard[];
  nextCursor: string | null;
  /** Absolute time when a pending item in this scope becomes visible; the page re-checks then. */
  refreshAt: string | null;
  hot: HotStripEntry[] | null;
  dayCounts: Record<string, number>;
  generatedAt: string;
}

/** Only operator-reviewed event locations; unreviewed AI hints never appear here. */
export interface GeoReviewedResponse {
  placeId: string;
  places: Array<GeoEventPlace & { count: number }>;
  catalog: GeoEventPlace[];
  countries: string[];
  regions: string[];
  placesTruncated: boolean;
  catalogTruncated: boolean;
  totalCapped: boolean;
  items: FeedItemSummary[];
  page: number;
  pageCount: number;
  total: number;
  generatedAt: string;
}

export interface PoolResponse {
  filters: TimelineFilters & { q: string | null; tab: "time" | "relevance" };
  items: FeedItemSummary[];
  page: number;
  pageCount: number;
  total: number;
  todayCount: number;
  freshness: string;
  generatedAt: string;
}

/** One city on the heat map: reviewed event places only, counted by article. */
export interface GeoHeatPoint {
  id: string;
  name: string;
  countryCode: string;
  lat: number;
  lon: number;
  count: number;
}

export interface GeoHeatResponse {
  hours: number;
  points: GeoHeatPoint[];
  /** Distinct articles behind the points, so one story is not counted twice. */
  articles: number;
  truncated: boolean;
  generatedAt: string;
}

/**
 * One selectable city. The picker in the feed needs the same canonical ids the
 * pool filter accepts — the older static city list used short ids ("beijing")
 * that match no reviewed place and silently returned an empty feed.
 */
export interface GeoPlaceOption extends GeoEventPlace {
  count: number;
}

export interface GeoPlacesResponse {
  places: GeoPlaceOption[];
  generatedAt: string;
}

/**
 * The full pickable city list, not just the cities that already have news.
 *
 * A reader can choose a place before anything is filed there; the id is the same
 * gazetteer id the review pipeline writes, so the feed starts matching by itself
 * once events land. `count` is 0 until then.
 */
export interface GeoCatalogPlace {
  id: string;
  name: string;
  /** Province for the mainland (北京, 四川), or 中国香港 / 中国澳门 / 中国台湾. */
  region: string;
  countryCode: string;
  lat: number;
  lon: number;
  count: number;
}

export interface GeoCatalogRegion {
  key: string;
  label: string;
  countryCode: string;
  /** How many cities the region offers, so the picker can order them. */
  cities: number;
}

export interface GeoCatalogResponse {
  places: GeoCatalogPlace[];
  regions: GeoCatalogRegion[];
  generatedAt: string;
}

export interface OutlineEntry {
  id: string;
  text: string;
  level: number;
}

export interface ItemDetail extends ItemSummary {
  readingMode: "full" | "summary-only";
  author: string | null;
  language: string | null;
  /** Chinese body (translation or Chinese original) and original body, whitelisted HTML. */
  body: { zh: string | null; original: string | null; zhKind: "translation" | "original" | null; complete: boolean } | null;
  outline: OutlineEntry[];
  relatedStories: StoryRef[];
  indexable: boolean;
  markdownAvailable: boolean;
  group: GroupInfo | null;
}

export interface GroupReport {
  id: string;
  title: string;
  summary: string | null;
  source: SourceRef;
  timelineAt: string;
  originalUrl: string;
  selected: boolean;
}

export interface GroupReportsResponse {
  factId: string;
  revision: string;
  reports: GroupReport[];
  nextCursor: string | null;
}

export interface Development {
  factId: string;
  title: string;
  occurredAt: string | null;
  representative: ItemSummary;
  reportCount: number;
}

export interface DevelopmentsResponse {
  story: StoryRef;
  revision: string;
  developments: Development[];
  nextCursor: string | null;
}

export interface ProblemBody {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  requestId: string;
  retryAfter?: number;
}

// ---------------------------------------------------------------------------
// Hot ranking and stories
// ---------------------------------------------------------------------------

export interface HotParticipant {
  name: string;
  kind: "editorial" | "signal";
  /**
   * The outlet a search source surfaced (its registrable host), when the participant is that site:
   * each domain holds its own vote, and `name` is then the outlet's own name ("光明网"), not the
   * search source's.
   */
  site?: string;
  /** The source's icon, or for an X account its latest collected avatar (proxied). */
  iconUrl: string | null;
  iconSrcSet?: string;
}


export interface HotEntryView {
  rank: number;
  story: StoryRef;
  heat: number;
  trend: "up" | "down" | "flat" | "new" | "unknown";
  trendPct: number | null;
  badges: Array<"surge" | "new" | "rising">;
  participantCount: number;
  sourceCount: number;
  signalCount: number;
  reportCount: number;
  sourceNames: string[];
  latestAt: string;
  firstReportAt: string;
  representative: { id: string; url: string; sourceName: string } | null;
  participants: HotParticipant[];
  /** Hourly heat across the ranking's own window (`windowHours`), oldest first; null where no comparable snapshot exists. */
  spark: Array<number | null>;
  /** The story's AI digest, else its fact statement. */
  summary: string | null;
  /** The latest development, one line. */
  latest: string | null;
  /** A picture from the story's public reports (the representative first), for the leading cards. */
  cover: { url: string; srcSet?: string; width: number | null; height: number | null } | null;
}

export interface HotResponse {
  computedAt: string | null;
  ruleVersion: string | null;
  windowHours: number;
  entries: HotEntryView[];
}

export interface HeatPoint {
  hour: string;
  heat: number;
  participants: number;
}

export interface StoryReportView {
  id: string;
  title: string;
  summary: string | null;
  source: SourceRef;
  publishedAt: string;
  originalUrl: string;
  selected: boolean;
  factId: string;
}

export interface StoryFactView {
  factId: string;
  title: string;
  occurredAt: string | null;
  firstReportAt: string;
  reportCount: number;
  representative: StoryReportView;
}

export interface StoryDetail {
  publicId: string;
  title: string;
  status: "active" | "watching" | "settled";
  reportCount: number;
  sourceCount: number;
  firstReportAt: string | null;
  latestAt: string | null;
  digest: string | null;
  digestUpdatedAt: string | null;
  /** The story's own factual summary, when it has one. */
  summary: string | null;
  /** Without a digest or summary: the summary of the report the story started from. */
  excerpt: { text: string; sourceName: string } | null;
  latest: string | null;
  whyHot: {
    participants48h: number;
    newParticipants6h: number;
    recentReports24h: number;
    observationComplete: boolean;
    rank: number | null;
    heat: number | null;
  };
  developments: StoryFactView[];
  officialReports: StoryReportView[];
  timeline: StoryReportView[];
  heat: HeatPoint[];
  related: Array<StoryRef & { relation: "storyline" | "related"; latestAt: string | null }>;
}

// ---------------------------------------------------------------------------
// Reports (daily / weekly / monthly)
// ---------------------------------------------------------------------------

export type ReportKind = "daily" | "weekly" | "monthly";

export interface ReportCitation {
  itemId: string | null;
  title: string;
  summary: string | null;
  sourceName: string;
  sourceUrl: string;
  sourceId: string | null;
  sourceIconUrl: string | null;
  sourceIconSrcSet?: string;
  firstParty: boolean;
  role: string | null;
  storyPublicId: string | null;
  /** When the cited report was published, if it is still in the database. */
  publishedAt: string | null;
  /** False once the item was withdrawn; the citation then shows as removed. */
  available: boolean;
}

/** 「邻域」里的一条：姊妹站自己的条目，链接回原站，我们只引用标题与摘要。 */
export interface ReportPeerItem {
  /** peerId:itemId，跨期去重用的稳定键。 */
  key: string;
  peerId: string;
  peerName: string;
  peerUrl: string;
  title: string;
  summary: string;
  /** 对端写的入选理由，可能没有。 */
  reason: string | null;
  category: string | null;
  /** 对端评分。只在同一家站内部可比，不要跨站比较。 */
  score: number | null;
  publishedAt: string | null;
  /** 对端站内的条目页。 */
  url: string;
  sourceName: string | null;
  originalUrl: string | null;
}

export interface ReportPeerBlock {
  label: string;
  note: string | null;
  items: ReportPeerItem[];
}

/** Evidence-audited interpretation, explicitly not a verified causal finding. */
export interface ReportInsight {
  level: "pattern" | "hypothesis";
  claim: string;
  reasoning: string;
  alternative: string;
  watchFor: string;
  evidence: ReportCitation[];
}

/** Historical published heat ranking pinned to the report's prior Beijing day.
 * These are ranking snapshots, NOT a list of articles first published yesterday.
 */
export interface ReportYesterdayHot {
  day: string;
  computedAt: string;
  entries: Array<{
    rank: number;
    storyPublicId: string;
    itemId: string;
    title: string;
    sourceName: string | null;
    heat: number | null;
  }>;
}

export interface ReportDetail {
  kind: ReportKind;
  key: string;
  title: string;
  windowStart: string;
  windowEnd: string;
  generatedAt: string;
  revision: number;
  lead: { title: string; leadParagraph: string } | null;
  overview: string | null;
  /** Empty for legacy issues, or when corroborating citations were withdrawn. */
  insights?: ReportInsight[];
  /** Optional in legacy issues and when no historical ranking snapshot exists. */
  yesterdayHot?: ReportYesterdayHot | null;
  highlights: ReportCitation[];
  /** As edited: daily categories, weekly and monthly themes. */
  sections: Array<{ label: string; summary: string | null; items: ReportCitation[] }>;
  /** Reading order: every section item once, labelled with its section. */
  stories: Array<ReportCitation & { label: string }>;
  flashes: ReportCitation[];
  /** 邻域：姊妹站入选条目的引用。不是本报编辑判断，缺失时为 null。 */
  peers: ReportPeerBlock | null;
  /**
   * The front page's picture: from the lead item (a daily's lead, a weekly or monthly's first highlight),
   * else from another public report of that event. Captioned with the story when it is not the lead's own.
   */
  cover: { url: string; srcSet?: string; width: number | null; height: number | null; caption: string | null } | null;
  metrics: Record<string, number>;
  readingMinutes: number;
  prev: string | null;
  next: string | null;
}

export interface ReportIndexEntry {
  key: string;
  title: string | null;
  generatedAt: string;
  count: number;
}

/** Figures and samples for the about page (site-only; not part of v1). */
export interface SiteStats {
  /** Sources collected from now. */
  sources: number;
  /** Enabled sources by kind: x_search, rss, web_list, mp_account, json_list. */
  sourceKinds: Record<string, number>;
  /** Of them, sources that only count toward heat (their items never reach 精选). */
  heatOnlySources: number;
  /** Everything collected and not withdrawn, heat-only sources included. */
  items: number;
  selected: number;
  dailies: number;
  /** Weekly and monthly editions of 公益总报. */
  reports?: number;
  /** The last 24 hours: items found (heat-only sources included), and items that made 精选 (by their place on the timeline). */
  day: { collected: number; selected: number };
  /** Enabled sources in a daily shuffle, for the about page's river: one line per source. */
  sampleSources: Array<{ name: string; kind: string; heatOnly: boolean }>;
  /** The latest 精选, newest first. */
  latest: Array<{ id: string; title: string; source: string }>;
}

/** A reading page transfers one language; the canonical item retains both for exports. */
export interface SiteItemDetail extends Omit<ItemDetail, "x"> {
  x: Omit<XPostView, "text" | "translation"> | null;
  hasTranslation: boolean;
  bodyLanguage: "zh" | "original";
}

export interface StoryFollowup {
  factId: string;
  representative: { id: string; title: string; source: { name: string }; timelineAt: string };
}
export interface StoryFollowupsResponse { items: StoryFollowup[]; more: boolean }

/** All issue keys keep numbering and calendars stable; closed daily months omit their titles. */
export interface ReportNavigationEntry { key: string; title?: string | null; count?: number }
