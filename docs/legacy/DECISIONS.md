# YIHOT v2 decisions

This file records decisions that should not be silently reopened by later agents without new evidence.

## D001 — YIHOT remains an independent repository

**Decision:** do not make `CochraneK/yihot` a GitHub fork of AIHOT.

**Reason:** YIHOT combines its own charity-domain assets, NewsMail migration knowledge, charity-intelligence integration and Lite deployment path. AIHOT is the primary upstream engineering reference, not the whole product identity.

**Constraint:** preserve AIHOT attribution/license notices whenever code is incorporated or substantially adapted.

## D002 — Repository boundaries

- `yihot` = single public-facing product and canonical news/event publication layer.
- `charity-intelligence` = separate deep structured data/evidence backend; do not move its heavy collectors/database into YIHOT.
- `NewsMail` = legacy migration source; archive after unique sources/parsers/email knowledge are accounted for.
- `AIHOT` = upstream/reference; do not claim its work as YIHOT-original.

## D003 — Deterministic substrate before AI

**Decision:** no LLM call is allowed in the Phase 1 request/publication path.

First stabilize source -> ingest -> dedup -> durable store -> publication -> API. AI/editorial stages are added behind worker boundaries later.

## D004 — Node 24 baseline

**Decision:** YIHOT v2 targets Node.js 24, aligning with the upstream engineering baseline and enabling built-in `node:sqlite` for the bootstrap core.

Legacy v0 remains runnable separately during migration.

## D005 — SQLite now, PostgreSQL later for full runtime

**Decision:** use SQLite for the migration core while data contracts and ingest/publication semantics are changing quickly.

This is not a rejection of AIHOT's PostgreSQL architecture. PostgreSQL remains the preferred full-runtime target once event clustering, job queues, reports, editorial state and operational concurrency justify it.

Do not prematurely build a dual-database abstraction. Migrate once the v2 schema semantics are stable enough to justify the cost.

## D006 — One publication read model

Web, RSS, public API, MCP and reports must converge on one canonical publication layer rather than each reimplementing filters/order/visibility rules.

The current SQLite `publication_items` view is the first minimal version of this contract.

## D007 — Authority is not crawl permission

Source authority tier, product participation mode and collection/compliance status are separate dimensions.

A T1 government source can still be `manual_citation` or `blocked`. YIHOT must not override charity-intelligence compliance outcomes just because a source is valuable.

## D008 — External ingest is the integration seam

`charity-intelligence` and future custom collectors should send bounded, provenance-preserving item payloads into YIHOT rather than sharing databases or importing crawler internals.

External ingest stays disabled unless a sufficiently long token is configured.

## D009 — Social/search/aggregator inputs are signals by default

WeChat search, Weibo hot searches and generic aggregators should enter as `hot_signal`/discovery inputs unless an original source is resolved. They are not primary evidence by default.

## D010 — UI comes after publication semantics

Do not replace the legacy page with a visually polished v2 shell until the new publication/event contracts are stable and testable. UI must consume the canonical API rather than embed a second content model.
