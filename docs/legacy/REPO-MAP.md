# YIHOT Repository Map

This document is the canonical boundary map for the related repositories.

## Canonical roles

| Repository | Role | Status | Rule |
|---|---|---|---|
| `CochraneK/yihot` | Main public-facing product | Active / v2 refactor | The only user-facing product and integration surface |
| `CochraneK/charity-intelligence` | Deep charity data / evidence / entity intelligence backend | Active | Keep heavy crawlers, longitudinal organization data, evidence, audit and entity relations here |
| `CochraneK/NewsMail` | Legacy collection + briefing + email pipeline | Migration source | Migrate reusable sources/parsers/notification ideas, then archive |
| `KKKKhazix/AIHOT` | Upstream engineering reference | External upstream | Prefer its mature architecture for collection, editorial scoring, clustering, hotness, reports, admin, API/RSS/MCP and operations |

## Non-negotiable boundaries

### YIHOT owns
- Public website and product UX.
- Editorial/news flow: selected, all, hot, topics, reports.
- Event clustering and publication layer.
- Public API / RSS / MCP / llms.txt.
- Admin operations for the news product.
- Industry taxonomy, editorial prompts, source participation rules and thresholds.
- Integration adapters that receive data from `charity-intelligence`.

### charity-intelligence owns
- Full/longitudinal charity-organization datasets.
- Charity China / xxgs and other heavy or specialized crawlers.
- Entity resolution, annual reports, finance, projects, qualifications, risk/evidence, relationships and audits.
- Research-grade provenance and longitudinal evidence.

It should expose selected outputs to YIHOT by API/export/external ingest rather than being copied into the YIHOT codebase.

### NewsMail owns during migration only
- Legacy source registry.
- Any source-specific parsers not already covered by YIHOT/AIHOT.
- Useful email-delivery implementation details.

Do not build new product features in NewsMail unless required to extract/migrate them.

### AIHOT relationship
AIHOT is not a CochraneK repository and is not presented as original YIHOT work. It is a high-quality external upstream/reference implementation. YIHOT may adapt MIT-licensed code while preserving the required copyright/license notices and using YIHOT's own name and branding.

## Target architecture

```text
                    KKKKhazix/AIHOT
                    upstream reference
                           |
               architecture / selected code
                           v
                   CochraneK/yihot
        Web · Admin · API · RSS · MCP · Reports
        Selection · Events · Hotness · Publication
                           ^
                           |
             API / external ingest / exports
                           |
          CochraneK/charity-intelligence
        data · evidence · entities · deep crawlers

          CochraneK/NewsMail
             migration source
                   |
        sources / parsers / email ideas
                   v
                 YIHOT
              then archive
```

## Decision rule for future overlap
When a new feature overlaps repositories, decide by the data lifecycle:

1. **Realtime/public editorial experience?** -> YIHOT.
2. **Deep structured charity facts, longitudinal evidence or heavy crawl?** -> charity-intelligence.
3. **Only exists in NewsMail?** -> migrate once, do not duplicate.
4. **Already solved well by AIHOT?** -> prefer adaptation/reference over a second independent implementation, while preserving attribution.
