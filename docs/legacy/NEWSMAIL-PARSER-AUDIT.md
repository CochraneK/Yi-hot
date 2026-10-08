# NewsMail parser migration audit

Status: **initial code-level audit complete**

Scope reviewed:

- `CochraneK/NewsMail/scripts/fetch_news.py`
- `CochraneK/NewsMail/scripts/utils.py`
- `CochraneK/NewsMail/info_sources.md`

The goal is not to port NewsMail wholesale. It is to preserve useful domain knowledge while avoiding a second collection/report architecture inside YIHOT.

## Keep and reimplement

### 1. Multi-strategy publication-date extraction — ADAPT

NewsMail contains useful accumulated knowledge for Chinese and international pages:

- RSS/RFC-2822 dates
- ISO timestamps
- Chinese `YYYY年MM月DD日`
- date-bearing URLs
- `<time datetime>`
- publication meta tags such as `article:published_time`, `pubdate`, `datePublished`
- JSON-LD `datePublished` / `dateCreated`
- nearby date text around an article link

YIHOT should reimplement this as a deterministic utility with explicit provenance (`rss`, `url`, `meta`, `jsonld`, `text`) rather than copying the old Python functions verbatim.

Important correction: do **not** use NewsMail's broad "scan the whole page and pick the latest plausible date" as a production default. Pages commonly contain footer/update/navigation dates unrelated to the article.

### 2. Per-source fallback chains — ADAPT

NewsMail has useful source-specific knowledge, for example China Development Brief trying RSS first and then falling back to known news-list/detail patterns.

Preserve the idea:

```text
stable RSS/API
  -> validated web-list adapter
  -> validated detail-page enrichment
  -> explicit failure / operator review
```

Do not replace a failed source with a generic `a[href] + keyword` scraper and silently call it healthy.

### 3. Date-near-anchor heuristic — REFERENCE_ONLY

Walking a small number of ancestors from a list-page article link can be useful for `web_list` adapters, but only inside a source-specific container/selectors. A page-wide ancestor scan is too ambiguous for a generic production parser.

### 4. RSSBridge operational knowledge — KEEP AS OPTIONAL ADAPTER KNOWLEDGE

NewsMail's experience with non-RSS sources and newsletter archives is useful, but RSSBridge should be treated as an external adapter, not a mandatory YIHOT subsystem.

## Do not migrate

### 1. Title-prefix deduplication — DROP

NewsMail deduplicates using roughly the first 30 normalized title characters. This can collapse unrelated stories and miss syndicated variants.

YIHOT v2 already uses canonical URL identity as its deterministic first layer. Later, semantically related coverage should be handled by event clustering, not title-prefix deletion.

### 2. NewsMail report pipeline and scheduler — DROP

Daily/weekly/monthly generation in NewsMail must not become a parallel production path. YIHOT will have one report engine fed by the canonical publication/event layer.

### 3. MyMemory translation implementation — DROP

Do not migrate the anonymous/free MyMemory translation path or its home-directory cache. Translation belongs in the later provider/worker layer with receipts, budget controls and durable cache semantics inspired by AIHOT.

### 4. Generic keyword scraping as an editorial source — DROP / SIGNAL ONLY

Several legacy fetchers scan all links on a page and retain titles matching charity keywords. This is acceptable as discovery experimentation, but too weak as a production editorial parser.

Where retained, these inputs should default to `hot_signal` / discovery until the original article source and publication metadata are resolved.

### 5. Search/aggregator pages as primary evidence — DROP

Sogou WeChat search, Weibo hot search, TopHub, AnyKnew and similar pages can suggest what is being discussed. They should not be treated as the source of record.

## Source-specific candidates worth validating next

High-value domestic candidates from the old code/list:

1. 中国发展简报 — strongest candidate for a dedicated adapter; old code already has RSS + list fallback knowledge.
2. 南都公益基金会 — likely first-party source; validate current page/feed and stable selectors.
3. 腾讯公益 — validate current information/news entry point before writing selectors.
4. 澎湃公益 / social-good coverage — use only stable current channel/API patterns.
5. UNICEF China / Save the Children China and other first-party NGO newsrooms — prefer official feeds/APIs where available.

Do not enable an old URL simply because it appears in NewsMail. Validate current endpoint, collection permission, response shape and publication-date behavior first.

## Implementation order

1. Add a pure deterministic date utility with unit/smoke fixtures.
2. Keep RSS as the only enabled transport until the utility is stable.
3. Introduce a generic `web_list` contract, but require explicit selectors/configuration.
4. Implement one domestic source adapter (prefer China Development Brief) as the first real web-list test.
5. Add detail-page date/body enrichment only after SSRF/size/redirect controls are reused from the RSS fetch path.
6. Keep all model-based relevance decisions out of parser code.

## Migration principle

NewsMail is valuable as **domain experience and parser archaeology**, not as the future runtime. Each reused behavior should be justified against the v2 contracts rather than copied because it already exists.
