# Source migration audit

Status: **active**

Purpose: turn the overlapping source lists in legacy YIHOT, NewsMail and charity-intelligence into one controlled YIHOT source model without activating stale, blocked or legally ambiguous sources by accident.

## Inputs

- legacy YIHOT `feeds.json`: 3 currently configured RSS/Atom sources.
- `CochraneK/NewsMail/info_sources.md`: broad 90+ candidate inventory across government, charity media, NGOs, social/search signals, international media, aggregators, newsletters and research institutions.
- `CochraneK/charity-intelligence/compliance/source-register.yaml`: compliance-aware registry with access status, robots checks, collection method, priority and probe results.

NewsMail's list is an **inventory**, not proof that every listed URL is still valid or appropriate for automatic collection.

## Canonical dimensions

Every source should eventually have independent fields for:

1. **Authority tier** — provenance, not crawl permission.
2. **Participation mode** — editorial item, hotness signal, or isolated/internal.
3. **Collection status** — allowed / conditional / pending retest / manual citation / blocked.
4. **Collection kind** — RSS, web list, JSON, social/account connector, external push, manual evidence.
5. **First-party flag** — whether the source speaks for the entity itself.
6. **Domain/category** — policy, humanitarian, foundation, research, platform philanthropy, etc.
7. **Compliance provenance** — where the collection decision came from and when it was last reviewed.

## Migration decisions

### A. Keep active now

Only the three already-configured YIHOT feeds are copied into `industry/sources.json` during the deterministic-core phase:

- ReliefWeb public updates
- 联合国新闻（中文）
- United Nations official updates

This deliberately preserves a small known baseline while the source model is rebuilt.

### B. High-priority candidates, but validate before enabling

From NewsMail:

- 中国发展简报
- 南都公益基金会
- 中国慈善联合会
- 中华慈善总会
- 民政部 / 社会组织相关公开栏目
- UNICEF China
- UNDP China
- UN Women China
- WFP / WHO China
- The New Humanitarian
- Philanthropy News Digest
- Stanford Social Innovation Review
- Oxfam / other major first-party international NGO sources

These should be migrated one by one only after URL/feed validity, terms/robots and parser behavior are checked.

### C. Social/search sources become signals by default

NewsMail's 搜狗微信关键词、公众号搜索、微博热搜等 should **not** enter YIHOT as ordinary editorial sources by default.

Default target:

- `participationMode = hot_signal`
- source-specific connector required
- no public full-text redistribution by default
- original source URL/provenance required before a signal can become an editorial item

This avoids treating search-result volume as verified news.

### D. Aggregators are not primary evidence

今日热榜、AnyKnew and similar aggregators may be useful as discovery/hotness signals, but should not be preferred over original publishers.

Default target: `hot_signal` or `isolated`, not T1 editorial evidence.

### E. Respect charity-intelligence compliance outcomes

The charity-intelligence register already records sources where automatic collection is blocked, conditional or manual-only. Those decisions are not overridden during YIHOT migration.

Examples already recorded there include:

- 中国社会组织政务服务平台 — manual citation / blocked automation in the recorded probe state.
- 社会组织信用信息公示平台 — captcha-gated; manual citation in normal operation.
- 国家法律法规数据库 — robots disallow-all; manual citation only.
- 财政部电子票据查验 — robots disallow-all; manual citation only.
- 国家企业信用信息公示系统 — blocked/manual in the recorded probe state.
- 信用中国 — blocked/manual in the recorded probe state.
- 慈善中国 — conditional and governed by the separate charity-intelligence compliance/exception process; its heavy structured collector remains outside YIHOT.

YIHOT may link to structured/evidence outputs produced by charity-intelligence, but should not duplicate or silently re-enable its restricted collectors.

## NewsMail migration rule

Do not migrate NewsMail as a second pipeline.

Potentially reusable assets:

- source registry knowledge
- unique page/date parsers
- RSSBridge operational knowledge
- bilingual handling patterns
- email delivery implementation

Do not reuse if already superseded:

- separate dedup store
- separate report pipeline
- separate scheduler
- parallel canonical source registry

## Next source work

1. Verify high-priority RSS feeds first.
2. Create explicit adapters only where a source has no stable feed/API.
3. Add compliance metadata before enabling web-list collectors.
4. Convert NewsMail social/search entries into hot-signal connectors rather than ordinary news sources.
5. Reconcile duplicate organizations/sources by stable IDs and domains.
6. Keep `industry/sources.json` small until each candidate passes validation.
