// Web list pages: HTML with selectors, Markdown through Jina Reader, and Docusaurus changelogs.
import * as cheerio from "cheerio";
import { guardedFetch } from "../lib/http-fetch.ts";
import { collapseWhitespace, stripTags } from "../lib/text.ts";
import { readable, type ExtractedBody } from "../content/extract.ts";
import { sanitizeBody } from "../content/sanitize.ts";
import { jinaRead } from "../providers/jina.ts";
import { FetchError, type Candidate, type SourceRow } from "./types.ts";

const JINA_PREFIX = "https://r.jina.ai/";

/** A time followed by its zone: "10:00Z", "10:00:00+08:00", "10:00:00 +0000", "10:00:00 GMT". */
const EXPLICIT_ZONE = /\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:Z|[+-]\d{2}:?\d{2}|GMT|UTC)\b/i;

function atOffset(y: string | number, mo: string | number, d: string | number, h: string | number, mi: string | number, s: string | number, utcOffset: string): Date | null {
  const p = (n: string | number) => String(n).padStart(2, "0");
  const t = Date.parse(`${y}-${p(mo)}-${p(d)}T${p(h)}:${p(mi)}:${p(s)}${utcOffset}`);
  return Number.isFinite(t) ? new Date(t) : null;
}

/**
 * A published date as a list page or article prints it. Date.parse is kept only where it reads the same
 * on every host: a time with its zone, and an ISO date alone (UTC midnight). Anything else it would read
 * in the server's local zone (UTC in Docker), so "2026-09-26 10:00" is read in the source's offset instead.
 */
export function parseLooseDate(value: string | null | undefined, utcOffset = "+08:00"): Date | null {
  if (!value) return null;
  // "Sep 26, 2026 at 10:30": "at" joins a date and its time like a space (English listings use it).
  const v = value.trim().replace(/(\d),?\s+at\s+(?=\d{1,2}:\d{2})/gi, "$1 ");
  if (!v) return null;
  if (EXPLICIT_ZONE.test(v) || /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const direct = Date.parse(v);
    if (Number.isFinite(direct) && /\d{4}/.test(v)) return new Date(direct);
  }
  // 2026-09-26 / 2026/09/26 / 2026-09-26T10:00 / 2026年9月26日 (+ optional time), interpreted in the given offset.
  const m = /(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:(?:T|\s*)(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(v);
  if (m) {
    const [, y, mo, d, h = "00", mi = "00", s = "00"] = m;
    return atOffset(y!, mo!, d!, h, mi, s, utcOffset);
  }
  // "09.21.2026" (MM.DD.YYYY, month-first, as One Foundation's news listing prints its <time>):
  // anchored, so it never competes with the year-first forms above; placed in the source's offset.
  const us = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(v);
  if (us) return atOffset(us[3]!, us[1]!, us[2]!, "00", "00", "00", utcOffset);
  // "Sep 26, 2026": Date.parse reads it in the host's zone, so take its fields and place them in the offset.
  const en = Date.parse(v.replace(/(\d)(st|nd|rd|th)/, "$1"));
  if (!Number.isFinite(en)) return null;
  const local = new Date(en);
  return atOffset(local.getFullYear(), local.getMonth() + 1, local.getDate(), local.getHours(), local.getMinutes(), local.getSeconds(), utcOffset);
}

function datePrecision(value: string | null | undefined): "date" | "datetime" {
  return value && /\d{1,2}:\d{2}/.test(value) ? "datetime" : "date";
}

/** The calendar day a moment falls on in a source's offset ("2026-10-22"), for same-day comparisons. */
export function dayInOffset(at: Date, utcOffset = "+08:00"): string {
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(utcOffset);
  const minutes = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 480;
  return new Date(at.getTime() + minutes * 60_000).toISOString().slice(0, 10);
}

/** The datePublished of the page's structured data (JSON-LD, also inside @graph or embedded app state). */
export function jsonLdPublished($: cheerio.CheerioAPI, html: string): string | null {
  const find = (v: unknown, depth = 0): string | null => {
    if (depth > 6 || v === null || typeof v !== "object") return null;
    if (Array.isArray(v)) {
      for (const x of v) {
        const got = find(x, depth + 1);
        if (got) return got;
      }
      return null;
    }
    const o = v as Record<string, unknown>;
    if (typeof o.datePublished === "string" && o.datePublished) return o.datePublished;
    return find(o["@graph"], depth + 1);
  };
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    try {
      const got = find(JSON.parse($(el).text()));
      if (got) return got;
    } catch {
      // a broken block: the pattern below may still find it
    }
  }
  return /"datePublished"\s*:\s*"([^"]+)"/.exec(html)?.[1] ?? null;
}

/** Prefix rules ignore the scheme: a Jina listing of an http:// address links its posts over http. */
const overHttps = (url: string) => url.replace(/^http:\/\//i, "https://");

// Suffixes where the registrable name is the third label from the right ("mca.gov.cn", not "gov.cn").
const MULTI_LABEL_SUFFIX = new Set(["gov.cn", "org.cn", "com.cn", "net.cn", "edu.cn", "ac.cn", "gov.hk", "com.hk", "gov.tw", "co.uk", "org.uk", "co.jp", "or.jp"]);

/** The site a URL belongs to, ignoring www and its CMS subdomains ("mzt.ln.gov.cn" → "ln.gov.cn"). */
export function siteHost(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./i, "");
    const parts = host.split(".");
    const suffix = parts.slice(-2).join(".");
    if (parts.length >= 3 && MULTI_LABEL_SUFFIX.has(suffix)) return parts.slice(-3).join(".");
    return parts.length >= 2 ? suffix : host;
  } catch {
    return "";
  }
}

/** A listing that links a different site is reposting: its own date is the repost date, not the publication date. */
export function externalLink(url: string, listing: string): boolean {
  const a = siteHost(url);
  const b = siteHost(listing);
  return !!a && !!b && a !== b;
}

/**
 * Keywords a page uses for the field that holds its publication date. The name is compared case-
 * insensitively: Chinese government CMSs print "PubDate" and "PublishDate" as often as "pubdate",
 * and a case-sensitive attribute selector silently matched none of the variants.
 */
const DATE_META_KEYS = new Set([
  "article:published_time", "og:release_date", "datepublished", "pubdate", "publishdate", "publish_date",
  "publishdate2", "publishtime", "publish_time", "publishtime2", "firstpublishedtime", "first_published_at",
  "release_date", "releasedate", "dc.date", "dc.date.issued", "dc.date.created", "article.published", "created",
]);

/**
 * The publication date a detail page states. Reads metadata first, then the byline an article page
 * prints ("时间：2026-10-13", "2026-10-13 14:02:19 来源：新华网"), scanning only the opening of the
 * visible text so a footer or a related-article list cannot supply it. A date that comes with a clock
 * beats a bare day.
 *
 * `expectDay` (YYYY-MM-DD in the source's offset) restricts every candidate to that day: a listing
 * already said which day the piece belongs to, so a clock found elsewhere on the page — a related
 * article, an update note — cannot move the piece to another day while the caller reads the clock.
 */
export function pagePublishedAt(html: string, expectDay?: string | null, utcOffset = "+08:00"): { at: Date; precision: "date" | "datetime" } | null {
  const $ = cheerio.load(html);
  const seen: Array<{ at: Date; precision: "date" | "datetime" }> = [];
  const take = (raw: string | null | undefined) => {
    const at = parseLooseDate(raw, utcOffset);
    if (!at) return;
    if (expectDay && dayInOffset(at, utcOffset) !== expectDay) return;
    seen.push({ at, precision: datePrecision(raw) });
  };
  for (const el of $("meta[name], meta[property], meta[itemprop]").toArray()) {
    const key = ($(el).attr("name") ?? $(el).attr("property") ?? $(el).attr("itemprop") ?? "").trim().toLowerCase();
    if (DATE_META_KEYS.has(key)) take($(el).attr("content"));
  }
  for (const el of $("time[datetime]").toArray().slice(0, 3)) take($(el).attr("datetime"));
  take(jsonLdPublished($, html));
  const text = collapseWhitespace($("body").text()).slice(0, 3000);
  const labeled = /(?:发布时间|发布日期|发稿时间|时间|日期)\s*[：:]\s*(\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?(?:\s*\d{1,2}:\d{2}(?::\d{2})?)?)/.exec(text);
  if (labeled) take(labeled[1]);
  const bare = /(\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?\s+\d{1,2}:\d{2}(?::\d{2})?)/.exec(text);
  if (bare) take(bare[1]);
  // Nothing but a day: still better than no date at all when the listing printed none, and the
  // caller's same-day check throws it away when this is a page about some other day.
  if (!seen.length) {
    const day = /(\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?)/.exec(text);
    if (day) take(day[1]);
  }
  return seen.find((s) => s.precision === "datetime") ?? seen[0] ?? null;
}

export function allowed(url: string, source: SourceRow): boolean {
  const allow: string[] = (source.config.allowUrlPrefixes ?? []).map(overHttps);
  const deny: string[] = (source.config.denyUrlPrefixes ?? []).map(overHttps);
  const target = overHttps(url);
  if (deny.some((p) => target.startsWith(p))) return false;
  return allow.length === 0 || allow.some((p) => target.startsWith(p));
}

/** A link back to the listing page itself (skip links, in-page anchors such as #paper, #blog). */
function listingItself(url: string, listing: string): boolean {
  // Some CMSes identify both their list and every article through query parameters on /index.php.
  // Ignoring the query made every article look like a self-link and silently emptied the source.
  const bare = (x: URL) => `${x.host}${x.pathname.replace(/\/$/, "")}${x.search}`;
  return bare(new URL(url)) === bare(new URL(listing));
}

/**
 * Navigation a listing links to but that is no post: the listing itself, year archives, and taxonomy,
 * author and pagination pages.
 */
function navigationLink(url: string, listing: string): boolean {
  if (listingItself(url, listing)) return true;
  const u = new URL(url);
  return /\/(label|labels|tag|tags|category|categories|author|authors|page)(\/|$)/i.test(u.pathname) || /\/(19|20)\d{2}(\/\d{1,2})?\/?$/.test(u.pathname);
}

/** Absolute http(s) URL; a link to the listing's own https site keeps https. */
function absolute(href: string | undefined, base: string): string | null {
  if (!href) return null;
  try {
    const u = new URL(href, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const b = new URL(base);
    if (u.protocol === "http:" && b.protocol === "https:" && u.host === b.host) u.protocol = "https:";
    return u.toString();
  } catch {
    return null;
  }
}

async function fetchListingText(source: SourceRow): Promise<{ text: string; viaJina: boolean; base: string }> {
  const url = String(source.config.url ?? "");
  if (!url) throw new FetchError("url missing");
  if (url.startsWith(JINA_PREFIX)) {
    const target = url.slice(JINA_PREFIX.length);
    const page = await jinaRead(target, { purpose: "source_listing", subject: `source:${source.id}`, cacheToleranceSeconds: source.config.cacheToleranceSeconds, perRead: true });
    return { text: page.markdown, viaJina: true, base: source.config.baseUrl ?? target };
  }
  const res = await guardedFetch(url, { headers: { accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8" }, timeoutMs: 25_000 });
  if (res.status !== 200) throw new FetchError(`HTTP ${res.status}`, res.status);
  return { text: res.text(), viaJina: false, base: source.config.baseUrl ?? url };
}

export function fromMarkdown(md: string, base: string, source: SourceRow): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  const listing = String(source.config.url ?? base).replace(JINA_PREFIX, "");
  // Card links wrap an image and the text, [![alt](img) ##### Title …](url "Title"): images go first so the
  // link text is plain; a bare image link is then left without a title and skipped, as are nav-length labels.
  const text = md.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  // Listings whose teasers link other articles in their prose (Axios: "capping a [chaotic three weeks](…)")
  // take only links that begin their line, after heading, list, quote or emphasis marks and image links.
  const startsLine = (at: number) =>
    /^[\s>#*+_|-]*(?:\d+[.)]\s*)?[\s*_]*$/.test(text.slice(text.lastIndexOf("\n", at - 1) + 1, at).replace(/\[\]\([^)]*\)/g, ""));
  for (const m of text.matchAll(/\[([^\]]{6,1000})\]\((https?:\/\/[^)\s]+|\/[^)\s]*)(?:\s+"([^"]*)")?\)/g)) {
    const url = absolute(m[2], base);
    if (!url || seen.has(url) || !allowed(url, source) || navigationLink(url, listing)) continue;
    if (source.config.linksStartLine === true && !startsLine(m.index!)) continue;
    const label = collapseWhitespace(m[1]!.replace(/[*_`#]/g, ""));
    // A title attribute the card text already contains is the clean title, without dates and blurbs.
    const attr = collapseWhitespace(m[3] ?? "");
    const title = attr.length >= 6 && label.includes(attr) ? attr : label;
    if (title.length < 6) continue;
    seen.add(url);
    out.push({ url, title });
  }
  return out;
}

export function fromHtml(html: string, base: string, source: SourceRow): Candidate[] {
  const c = source.config;
  const $ = cheerio.load(html);
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const listing = String(c.url ?? base).replace(JINA_PREFIX, "");
  // Sections of the listing page are posts only for sources that keep fragments as identity.
  const sectionsArePosts = c.preserveUrlFragment === true;
  const itemSel: string | undefined = c.itemSelector;
  const nodes = itemSel ? $(itemSel).toArray() : $("a[href]").toArray();
  for (const node of nodes) {
    const el = $(node);
    const linkEl = c.linkSelector ? (el.is(c.linkSelector) ? el : el.find(c.linkSelector).first()) : el.is("a") ? el : el.find("a[href]").first();
    const url = absolute(linkEl.attr("href"), base);
    if (!url || seen.has(url) || !allowed(url, source)) continue;
    if (!sectionsArePosts && listingItself(url, listing)) continue;
    const titleEl = c.titleSelector ? (el.is(c.titleSelector) ? el : el.find(c.titleSelector).first()) : linkEl;
    // A few official lists put their date inside the link itself. Keep that useful date for
    // publishedAt, but do not append it to the reader-facing headline.
    const visibleTitle = c.publishedAtSelector
      ? titleEl.clone().find(c.publishedAtSelector).remove().end().text()
      : titleEl.text();
    const title = collapseWhitespace((c.titleFromAttribute === true ? linkEl.attr("title") : visibleTitle) || linkEl.attr("title") || "");
    if (!title) continue;
    let publishedAt: Date | null = null;
    let publishedAtPrecision: "date" | "datetime" | undefined;
    if (c.publishedAtSelector) {
      const dateEl = el.find(c.publishedAtSelector).first();
      const raw = dateEl.attr("datetime") ?? dateEl.attr("title") ?? dateEl.text();
      publishedAt = parseLooseDate(raw, c.publishedAtUtcOffset);
      if (publishedAt) publishedAtPrecision = datePrecision(raw);
    }
    if (!publishedAt && c.publishedAtRegex) {
      const m = new RegExp(c.publishedAtRegex).exec($.html(el));
      publishedAt = parseLooseDate(m?.[1], c.publishedAtUtcOffset);
      if (publishedAt) publishedAtPrecision = datePrecision(m?.[1]);
    }
    seen.add(url);
    out.push({ url, title, publishedAt, publishedAtPrecision });
  }
  return out;
}

/** A changelog heading that is only a date, bare or after a short label: "时间: 2026-09-10", "时间：2024-05-17". */
const DATE_HEADING = /^(?:[^\d:：]{1,12}[:：])?\s*(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/;

/** The day a date heading names, at midnight in the source's offset (Date.parse would read "时间: …" in the host's zone). */
function headingDate(title: string, utcOffset = "+08:00"): Date | null | undefined {
  const m = DATE_HEADING.exec(title);
  if (!m) return undefined;
  const t = Date.parse(`${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}T00:00:00${utcOffset}`);
  return Number.isFinite(t) ? new Date(t) : null;
}

function fromDocusaurusChangelog(html: string, base: string, source: SourceRow): Candidate[] {
  const $ = cheerio.load(html);
  const out: Candidate[] = [];
  // A date heading is no update itself: it dates the updates under it, up to the next h2.
  let sectionDate: Date | null = null;
  $("article h2[id], article h3[id], .markdown h2[id], .markdown h3[id]").each((_i, h) => {
    const head = $(h);
    const id = head.attr("id")!;
    const title = collapseWhitespace(head.text().replace(/​/g, "").replace(/#$/, ""));
    const date = headingDate(title, source.config.publishedAtUtcOffset);
    if (date !== undefined) {
      sectionDate = date;
      return;
    }
    if (head.is("h2")) sectionDate = null;
    const parts: string[] = [];
    let n = head.next();
    while (n.length && !n.is("h2, h3")) {
      parts.push($.html(n));
      n = n.next();
    }
    const bodyHtml = sanitizeBody(parts.join(""), base);
    const url = `${base.replace(/#.*$/, "")}#${id}`;
    if (!allowed(url.replace(/#.*$/, ""), source)) return;
    out.push({
      url,
      identityKey: `url:${url}`,
      title,
      publishedAt: parseLooseDate(title) ?? sectionDate ?? parseLooseDate(stripTags(bodyHtml).slice(0, 80)),
      bodyHtml,
      bodyText: stripTags(bodyHtml),
      bodyStatus: "ok",
    });
  });
  return out;
}

async function fetchScript(url: string): Promise<string> {
  const res = await guardedFetch(url, { timeoutMs: 25_000 });
  if (res.status !== 200) throw new FetchError(`HTTP ${res.status} for ${url}`, res.status);
  return res.text();
}

/** A double-quoted string literal in minified script. */
const SCRIPT_STRING = String.raw`"(?:[^"\\]|\\.)*"`;
function scriptString(literal: string): string {
  try {
    return JSON.parse(literal.replace(/\\x([0-9a-f]{2})/gi, "\\u00$1").replace(/\\'/g, "'"));
  } catch {
    return literal.slice(1, -1);
  }
}

/**
 * mimo.xiaomi.com (config.adapter "mimo_home"). The homepage's post rows navigate by script: its HTML has
 * their titles but no links, so the generic parse found only the menu (MiMo Desktop, 简体中文, #paper).
 * The rows are a prop of the homepage's own chunk, `sectionTitle:"Blog", … blogs:[{title:"…",
 * link:"/blog/…", desc:"…"}, …]`; the site's route table names the chunks of path "/" and the runtime's
 * chunk map their files, both in the scripts the homepage loads. A homepage that no longer looks like
 * this fails the fetch instead of falling back to the menu.
 */
async function fromMimoHome(html: string, base: string, source: SourceRow): Promise<Candidate[]> {
  let routeChunks: string[] = [];
  let chunkFile: ((id: string) => string | null) | null = null;
  // Entry scripts come last; the libraries loaded before them hold neither table.
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)].map((m) => absolute(m[1], base)).filter((u) => u !== null);
  for (const src of scripts.reverse()) {
    if (routeChunks.length && chunkFile) break;
    const js = await fetchScript(src);
    const route = /\{path:"\/",[^{}]*\}/.exec(js)?.[0];
    if (route) routeChunks = [...route.matchAll(/\.e\("([^"]+)"\)/g)].map((m) => m[1]!);
    const map = /"(static\/js\/async\/)"\+\w+\+"\."\+\(?\{([^}]*)\}\)?\[\w+\]\+"\.js"/.exec(js);
    const publicPath = /\b\w+\.p="([^"]*)"/.exec(js)?.[1];
    if (map && publicPath !== undefined) {
      const names = new Map([...map[2]!.matchAll(/"?(\w+)"?:"(\w+)"/g)].map((m) => [m[1]!, m[2]!]));
      const root = new URL(publicPath, src);
      chunkFile = (id) => (names.has(id) ? new URL(`${map[1]}${id}.${names.get(id)}.js`, root).toString() : null);
    }
  }
  if (!routeChunks.length || !chunkFile) throw new FetchError("mimo_home: no route table or chunk map in the homepage scripts");
  const listing = String(source.config.url ?? base);
  // The page's own chunk is the last one its route loads.
  for (const id of routeChunks.reverse()) {
    const file = chunkFile(id);
    if (!file) continue;
    const js = await fetchScript(file);
    const at = js.indexOf('sectionTitle:"Blog"');
    if (at < 0) continue;
    const next = js.indexOf("sectionTitle:", at + 1);
    const section = js.slice(at, next < 0 ? undefined : next);
    const out: Candidate[] = [];
    for (const [row] of section.matchAll(new RegExp(String.raw`\{(?:[^{}"]|${SCRIPT_STRING})*\}`, "g"))) {
      const field = (name: string) => {
        const m = new RegExp(String.raw`\b${name}:(${SCRIPT_STRING})`).exec(row);
        return m ? collapseWhitespace(scriptString(m[1]!)) : "";
      };
      const url = absolute(field("link"), base);
      const title = field("title");
      if (!url || !title || out.some((c) => c.url === url) || !allowed(url, source) || listingItself(url, listing)) continue;
      const desc = field("desc");
      out.push({ url, title, excerpt: desc && desc !== title ? desc : null });
    }
    return out;
  }
  throw new FetchError("mimo_home: no Blog list in the homepage's chunks");
}

export async function fetchWebList(source: SourceRow): Promise<Candidate[]> {
  const { text, viaJina, base } = await fetchListingText(source);
  const mode = source.config.adapter === "mimo_home" ? "mimo_home" : source.config.parseMode ?? (viaJina ? "markdown" : "html");
  let out: Candidate[];
  if (mode === "mimo_home") out = await fromMimoHome(text, base, source);
  else if (mode === "markdown") out = fromMarkdown(text, base, source);
  else if (mode === "docusaurus_changelog") out = fromDocusaurusChangelog(text, base, source);
  else out = fromHtml(text, base, source);
  if (out.length === 0) throw new FetchError(`no items matched (${mode})`);
  return out;
}

export interface DetailNeed {
  date: boolean;
  title: boolean;
  summary: boolean;
  /** Reuse HTML already needed for metadata; never fetch a page just for this hint. */
  body?: boolean;
  /** The day the listing already claimed (YYYY-MM-DD): a clock found on the page must be on that day. */
  expectDay?: string | null;
}

/**
 * What a listing's detail pages add (config.detail): the date, title and summary its rules find. Each
 * rule reads the rendering it was written for. For a listing read through Jina, regexes match Jina's
 * text ("Published Time: …", "# Heading"), so that paid rendering is bought only when such a rule is
 * needed; selectors and page metadata read the page's own HTML.
 */
export async function fetchDetail(url: string, source: SourceRow, need: DetailNeed): Promise<{ publishedAt: Date | null; publishedAtPrecision: "date" | "datetime" | null; title: string | null; summary: string | null; body: ExtractedBody | null }> {
  const d = source.config.detail ?? {};
  const jinaListing = String(source.config.url ?? "").startsWith(JINA_PREFIX);
  const dateInJina = need.date && jinaListing && !!d.publishedAtRegex;
  const titleInJina = need.title && jinaListing && !!d.titleRegex;
  const jina = dateInJina || titleInJina ? (await jinaRead(url, { purpose: "source_detail", subject: `source:${source.id}` })).raw : null;
  let html: string | null = null;
  let body: ExtractedBody | null = null;
  if ((need.date && !dateInJina) || (need.title && !titleInJina) || need.summary) {
    const res = await guardedFetch(url, { timeoutMs: 20_000 });
    if (res.status === 200) {
      html = res.text();
      if (need.body && /html/.test(res.headers.get("content-type") ?? "")) {
        try { body = readable(html, res.url); }
        catch { /* A failed extraction must not discard the detail metadata. */ }
      }
    }
  }
  const $ = html === null ? null : cheerio.load(html);

  let publishedAt: Date | null = null;
  let publishedAtPrecision: "date" | "datetime" | null = null;
  const dateText = dateInJina ? jina : html;
  if (need.date && dateText !== null) {
    const offset = d.publishedAtUtcOffset ?? "+08:00";
    if ($ && !dateInJina && d.publishedAtSelector) {
      const el = $(d.publishedAtSelector).first();
      const raw = el.attr("datetime") ?? el.attr("title") ?? el.text();
      publishedAt = parseLooseDate(raw, offset);
      // Same rule as the listing parse: a byline that carries a clock time refines the listing's
      // day. Without it the caller keeps "date", and the feed then prints no time at all.
      if (publishedAt) publishedAtPrecision = datePrecision(raw);
    }
    if (!publishedAt && d.publishedAtRegex) publishedAt = parseLooseDate(new RegExp(d.publishedAtRegex).exec(dateText)?.[1], offset);
    // An authoritative rule is the only source of the date: when its byline is missing, no other
    // timestamp on the page (an update time, a related post) stands in for it.
    const authoritative = d.publishedAtAuthoritative === true && !!(d.publishedAtSelector || d.publishedAtRegex);
    // Everything else a page states about itself: its metadata under any of the names CMSs use
    // ("PubDate", "publishdate", …), structured data, <time>, and the byline it prints. One reader
    // for all of them, restricted to the day the listing already claimed.
    if (!publishedAt && html && !dateInJina && !authoritative) {
      const page = pagePublishedAt(html, need.expectDay, offset);
      if (page) {
        publishedAt = page.at;
        publishedAtPrecision = page.precision;
      }
    }
  }

  let title: string | null = null;
  if (need.title) {
    const titleText = titleInJina ? jina : html;
    if (d.titleRegex && titleText !== null) title = collapseWhitespace(new RegExp(d.titleRegex, "m").exec(titleText)?.[1] ?? "") || null;
    else if (d.titleSelector && $) title = collapseWhitespace($(d.titleSelector).first().text()) || null;
  }

  let summary: string | null = null;
  if (need.summary && $) {
    const el = $(d.summarySelector).first();
    summary = collapseWhitespace(el.attr("content") ?? el.text()) || null;
  }
  return { publishedAt, publishedAtPrecision, title, summary, body };
}
