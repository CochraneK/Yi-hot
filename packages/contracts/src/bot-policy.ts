// Crawler policy, defined once: who is refused, and what a retrieval bot may still read.
//
// Why this lives in contracts: the 403 gate (apps/web/server.ts) and robots.txt (apps/api) used to
// carry two hand-written lists that drifted — the gate refused ChatGPT-User and Claude-Web while
// llms.txt advertised "给 Claude Code、Codex 用". One module, two readers: what the site declares and
// what it enforces cannot disagree again.

/** Three refusal reasons, three different scopes. `human` is everything else. */
export type BotKind = "training" | "retrieval" | "generic" | "human";

/**
 * Training crawlers: the page text is the corpus. Refused everywhere, /llms.txt included — a map of
 * the site is only useful to a crawler we are letting in.
 */
export const TRAINING_BOTS = [
  "GPTBot",
  "ClaudeBot",
  "anthropic-ai",
  "Google-Extended",
  "CCBot",
  "Bytespider",
  "omgilibot",
  "omgili",
  "Applebot-Extended",
  "Diffbot",
] as const;

/**
 * Retrieval crawlers: they fetch because a person just asked a question, not to build a corpus.
 * They may read the machine surfaces — API, feeds, llms.txt, sitemap — and are refused the HTML.
 * Structured data belongs in the API; scraping the rendered page buys them nothing extra.
 */
export const RETRIEVAL_BOTS = [
  "ChatGPT-User",
  "OAI-SearchBot",
  "Claude-User",
  "Claude-Web",
  "Claude-SearchBot",
  "PerplexityBot",
] as const;

/**
 * SEO auditors and script libraries: no AI angle, but unbounded bulk fetching all the same.
 * PetalBot sits here rather than with the search engines on purpose — it crawls far harder than it
 * ever sends traffic, and this deployment is still IP-only, so there is no search index to protect.
 * Revisit that call when the site gets a domain and search referrals start to matter.
 */
export const SCRAPER_BOTS = [
  "PetalBot",
  "MJ12bot",
  "SemrushBot",
  "AhrefsBot",
  "DotBot",
  "DataForSeoBot",
  "BLEXBot",
  "Scrapy",
  "python-requests",
  "python-urllib",
  "Go-http-client",
  "Java/",
  "okhttp",
  "Apache-HttpClient",
  "HeadlessChrome",
  "PhantomJS",
] as const;

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Names to one case-insensitive alternation. Whole names only: `ClaudeBot` must not match `Claude-User`. */
function matcher(names: readonly string[]): RegExp {
  return new RegExp(names.map(escapeRe).join("|"), "i");
}

export const TRAINING_BOT_RE = matcher(TRAINING_BOTS);
export const RETRIEVAL_BOT_RE = matcher(RETRIEVAL_BOTS);
export const SCRAPER_BOT_RE = matcher(SCRAPER_BOTS);

/**
 * Classify one User-Agent. Order matters: a training bot that also looks like a retrieval bot
 * (`ClaudeBot` vs `Claude-User`) has to land on the stricter side.
 */
export function classifyBot(userAgent: string | undefined | null): BotKind {
  const ua = userAgent ?? "";
  if (!ua) return "human";
  if (TRAINING_BOT_RE.test(ua)) return "training";
  if (SCRAPER_BOT_RE.test(ua)) return "generic";
  if (RETRIEVAL_BOT_RE.test(ua)) return "retrieval";
  return "human";
}

/**
 * Whether the request is refused outright, before routing.
 *
 * `agentSurface` says the path is a machine surface (API / feed / llms.txt / openapi / sitemap)
 * rather than an HTML page — retrieval bots pass only there. Training and scraper bots never pass.
 */
export function botBlocked(userAgent: string | undefined | null, agentSurface: boolean): boolean {
  const kind = classifyBot(userAgent);
  if (kind === "training" || kind === "generic") return true;
  if (kind === "retrieval") return !agentSurface;
  return false;
}
