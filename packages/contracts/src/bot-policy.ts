// Crawler policy, defined once: who is refused, and what a program may still read.
//
// Why this lives in contracts: the 403 gate (apps/web/server.ts) and robots.txt (apps/api) used to
// carry two hand-written lists that drifted — the gate refused ChatGPT-User and Claude-Web while
// llms.txt advertised "给 Claude Code、Codex 用". One module, two readers: what the site declares and
// what it enforces cannot disagree again.

/**
 * Four refusal reasons, four different scopes. `human` is everything else.
 *
 * The split that matters is not "bot vs person" but "does this client have somewhere better to go".
 * A library like python-requests is the normal way to call an API — refusing it at the API would
 * contradict the promise llms.txt makes. So it loses the HTML and keeps the machine surfaces. Only
 * the training crawlers and the pure page-scrapers lose both.
 */
export type BotKind = "training" | "retrieval" | "script" | "seo" | "human";

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
 * Script clients: the default User-Agent of a normal HTTP library. Same treatment as retrieval —
 * machine surfaces open, HTML closed. A Python or Go user calling /api/v1 is the intended use of
 * this site, not an abuse; the frequency limit is what protects it, not a 403.
 *
 * HeadlessChrome and PhantomJS are deliberately absent: browser automation is a legitimate way to
 * read a page (our own screenshots use it), and blocking it only punished honest clients — the UA
 * is one flag away from being forged anyway.
 */
export const SCRIPT_CLIENT_BOTS = [
  "python-requests",
  "python-urllib",
  "Go-http-client",
  "Java/",
  "Java-http-client",
  "okhttp",
  "Apache-HttpClient",
  "Scrapy",
] as const;

/**
 * SEO auditors: they only ever want the HTML, and they fetch it in bulk. Nobody reaches an API
 * through SemrushBot, so refusing them everywhere costs no legitimate caller.
 * PetalBot sits here rather than with the search engines on purpose — it crawls far harder than it
 * ever sends traffic, and this deployment is still IP-only, so there is no search index to protect.
 * Revisit that call when the site gets a domain and search referrals start to matter.
 */
export const SEO_BOTS = [
  "PetalBot",
  "MJ12bot",
  "SemrushBot",
  "AhrefsBot",
  "DotBot",
  "DataForSeoBot",
  "BLEXBot",
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
export const SCRIPT_CLIENT_BOT_RE = matcher(SCRIPT_CLIENT_BOTS);
export const SEO_BOT_RE = matcher(SEO_BOTS);

/**
 * Classify one User-Agent. Order matters: a training bot that also looks like a retrieval bot
 * (`ClaudeBot` vs `Claude-User`) has to land on the stricter side.
 */
export function classifyBot(userAgent: string | undefined | null): BotKind {
  const ua = userAgent ?? "";
  if (!ua) return "human";
  if (TRAINING_BOT_RE.test(ua)) return "training";
  if (SEO_BOT_RE.test(ua)) return "seo";
  if (RETRIEVAL_BOT_RE.test(ua)) return "retrieval";
  if (SCRIPT_CLIENT_BOT_RE.test(ua)) return "script";
  return "human";
}

/**
 * Whether the request is refused outright, before routing.
 *
 * `agentSurface` says the path is a machine surface (API / feed / llms.txt / openapi / sitemap)
 * rather than an HTML page — retrieval and script clients pass only there.
 */
export function botBlocked(userAgent: string | undefined | null, agentSurface: boolean): boolean {
  const kind = classifyBot(userAgent);
  if (kind === "training" || kind === "seo") return true;
  if (kind === "retrieval" || kind === "script") return !agentSurface;
  return false;
}
