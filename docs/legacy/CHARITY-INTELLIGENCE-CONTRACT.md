# charity-intelligence -> YIHOT contract

Status: **v0 contract / narrow integration seam**

The two repositories remain independent. They must not share a writable database and YIHOT must not import charity-intelligence crawler internals.

## Direction

```text
charity-intelligence
  structured collectors / evidence / entity knowledge
            |
            | bounded HTTP payload
            v
YIHOT /api/v2/ingest
  news/event pipeline + public publication
```

## Authentication

External ingest is disabled unless YIHOT has `YIHOT_INGEST_TOKEN` configured with at least 16 characters.

Request header:

```http
Authorization: Bearer <token>
Content-Type: application/json
```

## Item ingest payload

Maximum 50 items per request in the current v2 transport.

```json
{
  "sourceId": "charity-intelligence:example",
  "sourceName": "Charity Intelligence Example Connector",
  "items": [
    {
      "guid": "stable-upstream-record-id",
      "url": "https://original-publisher.example/article/123",
      "title": "Original or normalized source title",
      "summary": "Optional source-grounded summary",
      "author": "Optional author/publisher",
      "publishedAt": "2026-09-29T08:00:00+08:00",
      "raw": {
        "provenance": {
          "origin": "charity-intelligence",
          "collectionMethod": "automated",
          "evidenceUrl": "https://original-publisher.example/article/123"
        }
      }
    }
  ]
}
```

## Required invariants

1. `url` should be the original public publisher/evidence URL whenever possible, not a YIHOT or charity-intelligence internal page.
2. `title` must not convert an unverified allegation into a factual institutional judgment.
3. `publishedAt` describes the source material, not the time charity-intelligence happened to collect it.
4. `guid` should be stable within the sending connector when one exists.
5. historical backfills must later carry an explicit backfill flag before YIHOT hotness/notifications are enabled.
6. private personal data must not be pushed merely because charity-intelligence can access it internally.
7. compliance-restricted collectors remain governed in charity-intelligence; YIHOT receives only permitted outputs.

## Entity/evidence linking: next contract version

Do not overload the initial item contract with the whole charity database.

The next version may add a small reference block such as:

```json
{
  "entityRefs": [
    {
      "system": "charity-intelligence",
      "entityType": "organization",
      "entityId": "stable-id",
      "confidence": 0.97,
      "evidence": ["source-record-id"]
    }
  ]
}
```

YIHOT should store references/links, not duplicate the organization record, financial history or evidence graph.

## Failure semantics

- malformed request: reject; sender fixes payload.
- duplicate canonical URL: count as duplicate; do not publish twice.
- temporary YIHOT outage: sender may retry the same bounded batch because ingest is designed to be idempotent at canonical-URL level.
- source compliance becomes blocked: stop sending new automatically collected records; existing provenance remains auditable.

## Ownership

- charity-intelligence owns structured charity entities, deep evidence and collector compliance.
- YIHOT owns editorial/publication state, event clustering, hotness, public feeds and public-facing news navigation.
