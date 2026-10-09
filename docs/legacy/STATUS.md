# YIHOT v2 Status

Canonical branch: `refactor/v2`

Legacy snapshot branch: `legacy-v0`

## Current stage

**Phase 1 deterministic core implemented; source migration and integration contract started. Machine smoke is pending a usable GitHub runner.**

The current v2 path intentionally excludes LLM/editorial logic. It establishes the deterministic substrate first:

```text
industry/sources.json
  -> fetch RSS/Atom
  -> parse
  -> normalize URL
  -> deduplicate
  -> SQLite
  -> publication view
  -> /api/v2/items
```

## Implemented

- Node.js 24 baseline.
- Built-in `node:sqlite` storage; no database package dependency.
- `database/v2-schema.sql` with `sources`, `items`, `ingest_runs`, indexes and `publication_items` view.
- RSS/Atom parser and public HTTPS source collection.
- URL normalization and tracking-parameter stripping.
- Global canonical-URL deduplication.
- Source health/error timestamps.
- Ingest-run audit records.
- Canonical publication reader.
- Minimal HTTP API:
  - `GET /api/v2/health`
  - `GET /api/v2/items`
  - `GET /api/v2/sources`
  - `POST /api/v2/ingest`
- External ingest is disabled unless `YIHOT_INGEST_TOKEN` is configured with at least 16 characters.
- `industry/sources.json` is the v2 source-of-truth; legacy root `feeds.json` remains for legacy/Lite behavior only.
- Source model separates authority tier, participation mode and collection/compliance status.
- Baseline enabled RSS sources expanded from 3 to 6 after current endpoint verification: ReliefWeb, UN News, UN official, The New Humanitarian, SSIR, Oxfam International.
- NewsMail + charity-intelligence source overlap audited in `SOURCE-MIGRATION-AUDIT.md`.
- `CHARITY-INTELLIGENCE-CONTRACT.md` defines a bounded HTTP integration seam; no shared writable database.
- `src/v2/smoke.mjs` tests source config + parse -> ingest -> duplicate ingest -> publication ordering.
- Node 24 GitHub Actions smoke workflow added.
- Existing legacy runtime remains available through `npm run start:legacy`.
- Runtime SQLite files are gitignored.
- AIHOT provenance/attribution recorded in `THIRD_PARTY_NOTICES.md` and `docs/UPSTREAMS.md`.
- Architecture decisions frozen in `docs/DECISIONS.md`.

## Validation state

GitHub Actions runs are currently failing before runner execution: the reported jobs have no steps, no assigned runner and no downloadable job log. This is recorded as a CI-startup/infrastructure failure, **not** a failing application smoke assertion.

The smoke command remains:

```bash
npm run smoke
```

Do not merge `refactor/v2` into the default branch until the deterministic core smoke has executed successfully on a real Node 24 runner or equivalent local environment.

## Explicitly not implemented yet

- LLM prescreen / repeated scoring.
- Editorial title/summary generation.
- Event clustering.
- Hotness ranking.
- Daily/weekly/monthly report engine.
- New v2 web UI.
- RSS/API/MCP parity with AIHOT.
- charity-intelligence entity linking beyond the ingest contract.
- Full NewsMail source/parser migration.
- PostgreSQL/full worker runtime.

## Next execution order

1. Add deterministic editorial/processing state and queue boundaries to the schema.
2. Continue validating high-priority charity-specific NewsMail sources one by one; do not bulk-enable the legacy inventory.
3. Audit reusable NewsMail date/source-specific parsers without importing its separate report pipeline.
4. Adapt AIHOT-style prescreen/scoring behind worker interfaces; keep model calls out of request-time paths.
5. Add event clustering + hotness.
6. Build the new public web layer only after the publication/event contract is stable.
