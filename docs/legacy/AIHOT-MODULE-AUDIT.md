# AIHOT -> YIHOT v2 Module Audit

Status: **initial pass**

Legend:
- `ADAPT` — strong candidate to port/adapt into YIHOT v2.
- `REFERENCE_ONLY` — keep the design idea, reimplement around YIHOT constraints.
- `KEEP_YIHOT` — existing YIHOT behavior is intentionally retained.
- `DEFER` — not needed for first usable v2.
- `DROP` — AI-specific feature not part of YIHOT product scope.

## Platform architecture

| AIHOT area | Decision | YIHOT v2 note |
|---|---|---|
| `apps/api` | ADAPT | Replace the current single `server.mjs` responsibility with a real API boundary |
| `apps/worker` | ADAPT | Move collection/model/report work out of request-time paths |
| `apps/web` | ADAPT | Use as the architectural/UI baseline; YIHOT keeps its own product identity |
| `packages/contracts` | ADAPT | Shared types/contracts will reduce drift between API, worker and web |
| `packages/backend/src/publication` | ADAPT | Critical: one canonical public read layer for web/RSS/API/MCP |
| PostgreSQL + migrations | ADAPT | Needed for events, reports, observability and durable editorial state |
| Docker Compose | ADAPT | Full deployment mode |
| current static bake path | KEEP_YIHOT | Preserve as a future `Lite` mode, not as the canonical full runtime |

## Ingestion and content

| AIHOT area | Decision | YIHOT v2 note |
|---|---|---|
| `sources` | ADAPT | YIHOT needs RSS/web/JSON/external first; X/WeChat can be enabled only where justified |
| source tiers | ADAPT | Replace AI examples with charity-sector source quality tiers |
| participation modes | ADAPT | `editorial` / `hot_signal` / `isolated` is useful for mixed charity sources |
| `content` / dedup | ADAPT | Supersedes simple URL/title handling in current prototype |
| `ingest` external push | ADAPT | Primary bridge from `charity-intelligence` and custom crawlers |
| old-article/backfill rule | ADAPT | Prevent historical imports from polluting current hot lists |
| current YIHOT allowlist safety ideas | KEEP_YIHOT | Retain explicit source restrictions and no arbitrary URL proxy behavior |

## Editorial pipeline

| AIHOT area | Decision | YIHOT v2 note |
|---|---|---|
| prescreen | ADAPT | Charity-specific low-cost prefilter |
| repeated/independent scoring | ADAPT | Stronger than current prototype ranking; must be calibrated |
| `industry/prompts` separation | ADAPT | Charity know-how belongs here, not in generic backend code |
| `selection.ts` thresholds | ADAPT | Rebuild thresholds using charity-sector labeled samples |
| title/summary writing | ADAPT | Preserve source traceability and avoid unsupported institutional claims |
| translation | ADAPT | Replace current standalone translation endpoint with worker-stage processing/caching |
| current score as "discovery only" safety language | KEEP_YIHOT | Must remain explicit in product copy and admin review surfaces |
| `gold.example.jsonl` / selection benchmark pattern | ADAPT | Create a YIHOT charity gold set before calling ranking production-ready |

## Events, hotness and reports

| AIHOT area | Decision | YIHOT v2 note |
|---|---|---|
| event clustering | ADAPT | Major upgrade: multiple reports of one charity event should become one event |
| second-model merge confirmation | REFERENCE_ONLY | Keep concept; exact cost/threshold policy should be YIHOT-specific |
| event hotness | ADAPT | Use independent-source count rather than raw article count |
| daily/weekly/monthly report engine | ADAPT | Replaces overlapping NewsMail report pipeline |
| event summaries | ADAPT | Add provenance and uncertainty rules for charity/public-interest reporting |

## Public interfaces

| AIHOT area | Decision | YIHOT v2 note |
|---|---|---|
| web selected/all/hot/topics/reports | ADAPT | Core YIHOT product |
| RSS | ADAPT | Maintain human and agent-friendly feeds |
| public API | ADAPT | Also supports charity-intelligence links and external consumers |
| MCP | ADAPT | Useful for agent consumption of YIHOT data |
| `llms.txt` | ADAPT | Cheap and useful |
| sitemap / robots | ADAPT | Standard publication hygiene |

## Admin and operations

| AIHOT area | Decision | YIHOT v2 note |
|---|---|---|
| source admin + test fetch | ADAPT | High priority |
| run history / diagnostics | ADAPT | High priority |
| budget receipts / budget breaker | ADAPT | High priority once paid providers are enabled |
| alerts / backup / cleanup | ADAPT | Required before serious deployment |
| source failure reports | ADAPT | Combine with source coverage ideas from charity-intelligence/NewsMail |
| Feishu-specific notifications | DEFER | Notification transport should be pluggable |

## AIHOT-specific modules

| AIHOT area | Decision | YIHOT v2 note |
|---|---|---|
| AI model leaderboard | DROP | Not part of the charity product |
| Codex reset monitor | DROP | Not part of the charity product |

## YIHOT-specific additions not supplied by AIHOT

1. **Charity entity link** — event/item -> organization/entity ID.
2. **Evidence link** — editorial item -> deeper verified facts in `charity-intelligence`.
3. **Risk of harm / allegation guardrails** — distinguish public-source reporting from verified organizational facts.
4. **Source coverage accounting** — not just collection success, but charity-sector category/region/source coverage.
5. **Lite deployment** — static bake/Pages/CloudBase remains an optional low-cost edition after full v2 is stable.

## First implementation slice

Do not port the whole upstream in one commit. The first code slice should be:

```text
contracts
  + database/migrations
  + source model
  + ingest/dedup
  + publication read model
  + one minimal API route
```

Acceptance condition: one existing YIHOT RSS item can enter the new store, be deduplicated, and be returned through the new publication/API layer **without** model calls. This gives a stable base before adding editorial AI, events, reports or UI replacement.

## Second implementation slice

```text
prescreen
  -> repeated score
  -> write title/summary
  -> event cluster
  -> hotness
```

Only after this path is testable should the v2 web UI replace the legacy page.
