// Publication rules. Each rule is defined once here and used by every exit.
import { TAG_SYNONYMS } from "@aihot/industry/taxonomy";

export interface SourceFacts {
  id: string;
  name: string;
  kind: string;
  tier: string;
  participation_mode: string;
  publication_rule?: PublicationRule | null;
  first_party: boolean;
  site_fulltext: boolean;
  syndicate_fulltext: boolean;
}

export function channelOf(sourceKind: string, hasXPost: boolean): "x" | "news" {
  return sourceKind === "x_search" || hasXPost ? "x" : "news";
}

/**
 * Per-source publication rule (sources.publication_rule, migration 0042). One source can hold material of
 * very different shape: a Xiaohongshu keyword feed carries both a well-told charity story (scores high) and
 * an institution's project update (scores low but is exactly what the site is about). A single global
 * threshold either lets the marketing posts in or drops the institutional ones, so the threshold lives on
 * the source instead. Every field is optional; an absent rule restricts nothing.
 */
export interface PublicationRule {
  /** Hard score line: at or above it, the material passes regardless of category. */
  minScore?: number;
  /** Lower line for named categories only (e.g. { project: 20, policy: 18 }). */
  scoreByCategory?: Record<string, number>;
  /** On the scoreByCategory track the text must name an institution or a project, not just sound worthy. */
  requireMarkers?: string[];
  /** Categories that never pass (e.g. personal fundraising drives). */
  dropCategories?: string[];
}

export interface PublicationRuleInput {
  /** postgres returns numeric as a string, so both are accepted and coerced. */
  score: number | string | null;
  category: string | null;
  title: string | null;
  summary: string | null;
}

export function passesPublicationRule(rule: PublicationRule | null | undefined, input: PublicationRuleInput): boolean {
  if (!rule) return true;
  const category = input.category ?? "";
  if (rule.dropCategories?.includes(category)) return false;
  const raw = input.score == null ? Number.NaN : Number(input.score);
  const score = Number.isFinite(raw) ? raw : 0;
  if (typeof rule.minScore === "number" && score >= rule.minScore) return true;
  const byCategory = rule.scoreByCategory?.[category];
  if (typeof byCategory !== "number" || score < byCategory) return false;
  if (!rule.requireMarkers?.length) return true;
  const hay = `${input.title ?? ""}\n${input.summary ?? ""}`;
  return rule.requireMarkers.some((marker) => hay.includes(marker));
}

/** Public pool (/all): editorial sources, AI relevant, with a Chinese title and summary, and past the source rule. */
export function isPoolEligible(input: {
  participationMode: string;
  relevance: string | null;
  title: string | null;
  summary: string | null;
  rule?: PublicationRule | null;
  score?: number | null;
  category?: string | null;
}): boolean {
  if (input.participationMode !== "editorial" || input.relevance !== "pass" || !input.title || !input.summary) return false;
  return passesPublicationRule(input.rule, { score: input.score ?? null, category: input.category ?? null, title: input.title, summary: input.summary });
}

/**
 * Item detail page (and its Markdown export): every unwithdrawn item from an editorial source has one,
 * with or without a Chinese summary (noindex unless indexable). hot_signal material is heat evidence
 * only and has none. A paused source keeps its pages.
 */
export function hasItemPage(p: { visibility: string; sourceMode: string }): boolean {
  return p.visibility !== "withdrawn" && p.sourceMode === "editorial";
}

/** Selected: pool eligible, judged selected, and the source tier may enter the selection. */
export function isSelectable(eligible: boolean, judgedSelected: boolean | null, tier: string): boolean {
  return eligible && judgedSelected === true && tier !== "EXCLUDE_MP";
}

/**
 * Site full text: the source licence allows showing it and we have confirmed body text.
 * WeChat and paywalled content never get it just because it was fetchable (source flag false).
 */
export function bodyModeOf(source: SourceFacts, bodyStatus: string, hasBody: boolean): "full" | "summary" {
  return source.site_fulltext && bodyStatus === "ok" && hasBody ? "full" : "summary";
}

/** Full-RSS redistribution whitelist: only sources that explicitly allow it. */
export function mayRedistribute(source: SourceFacts, bodyMode: "full" | "summary"): boolean {
  return source.syndicate_fulltext && bodyMode === "full";
}

/**
 * Detail pages are noindex by default. Selected items are indexed automatically; an editor
 * can mark any other public page for indexing, or exclude a page, which then stays out.
 */
export function isIndexable(p: { visibility: string; hasSummary: boolean; selected: boolean; seoIndexedAt: Date | null; seoExcludedAt: Date | null }): boolean {
  return p.visibility === "public" && p.hasSummary && p.seoExcludedAt === null && (p.selected || p.seoIndexedAt !== null);
}

/** Display tags exclude internal entity markers and use the current concise vocabulary. */
export function displayTags(tags: string[]): string[] {
  return [...new Set(tags
    .filter((t) => !t.startsWith("entity:"))
    .map((t) => TAG_SYNONYMS[t] ?? t))];
}
