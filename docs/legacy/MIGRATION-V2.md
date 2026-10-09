# YIHOT v2 Migration Plan

Status: **active planning / staged migration**

The goal is to rebuild YIHOT into the single public-facing charity intelligence/news product without turning related repositories into a monolith.

## Phase 0 — Freeze boundaries

- [x] Define repository roles in `REPO-MAP.md`.
- [x] Record AIHOT as primary upstream engineering reference in `UPSTREAMS.md`.
- [ ] Snapshot/tag current YIHOT as legacy v0 before destructive refactor.
- [ ] Add third-party notice file before importing AIHOT code.

## Phase 1 — Inventory before code migration

### AIHOT -> YIHOT candidate modules
- source model + source participation modes
- collection / dedup
- editorial prescreen + repeated scoring
- writing pipeline
- event clustering
- hotness
- publication layer
- daily/weekly/monthly reports
- public API/RSS/MCP
- admin + budgets/receipts/operations
- generic tests and deployment patterns

For each item mark: `ADAPT`, `REFERENCE_ONLY`, `NOT_NEEDED`, or `YIHOT_ALREADY_BETTER`.

### NewsMail -> YIHOT migration audit
- source registry / candidate source list
- source-specific parsers
- date extraction strategies
- RSSBridge knowledge
- bilingual processing
- email delivery implementation

Do **not** migrate a second report pipeline, second dedup store or second scheduler if the AIHOT-derived architecture replaces it.

### charity-intelligence -> YIHOT integration audit
- identify stable outputs that should be exposed to YIHOT
- define organization/entity identifiers
- define evidence/deep-link contract
- define external-ingest or API payloads
- explicitly exclude heavy crawler/database code from YIHOT

## Phase 2 — Establish YIHOT v2 skeleton

Target structure, subject to adaptation after inventory:

```text
apps/
  api/
  worker/
  web/
packages/
  backend/
  contracts/
industry/
  site
  taxonomy
  topics
  sources
  prompts
  selection
  features
  brand
integrations/
  charity-intelligence/
docs/
tests/
```

Key principle: **industry/domain configuration stays separate from generic news-platform mechanics.**

## Phase 3 — Rebuild the public news flow

Acceptance path:

```text
source -> ingest -> dedup -> prescreen -> score -> write
       -> event cluster -> hotness -> publication
       -> web / RSS / API / MCP / reports
```

Do not add charity entity intelligence to the UI until this path is stable.

## Phase 4 — Integrate charity-intelligence

First integration should be intentionally narrow:

1. Match a news item/event to a charity organization/entity when confidence is sufficient.
2. Show a small `机构档案 / evidence` link or card.
3. Fetch deep structured data from charity-intelligence rather than duplicating it.
4. Preserve provenance and the difference between editorial news signals and verified structured facts.

## Phase 5 — Migrate NewsMail and archive it

Migration completion criteria:
- useful sources accounted for
- unique parsers accounted for
- email delivery either migrated or explicitly dropped
- no active production dependency remains
- README points to YIHOT as successor

Then archive NewsMail; retain Git history.

## Phase 6 — Product hardening

- source coverage dashboard
- source failure monitoring
- editorial calibration benchmark
- event-clustering evaluation
- budget limits and receipts
- audit/provenance views
- security review
- responsive UI review
- YIHOT Lite/static deployment decision
- bilingual README + architecture diagram

## Definition of done for v2.0

YIHOT v2.0 is not done merely when the homepage renders. It is done when:

- one canonical public pipeline powers selected/all/hot/reports
- major source failures are observable
- events can be traced to original sources
- AI selection is calibrated and inspectable
- charity-intelligence is integrated through a documented contract
- NewsMail has no hidden production responsibility
- AIHOT-derived portions have clear attribution/license notices
- documentation is sufficient for another agent to continue without reconstructing repository history from chat
