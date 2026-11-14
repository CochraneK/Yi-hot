#!/usr/bin/env python3
"""Read one legacy charity-intelligence organization from an offline SQLite backup.

This is an explicit, private preview, NOT an importer or public API. It never
assigns a canonical ID, merges identities, touches production or exports raw text.
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
from contextlib import closing
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def _table(db: sqlite3.Connection, name: str) -> bool:
    return db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone() is not None


def _cols(db: sqlite3.Connection, name: str) -> set[str]:
    return {x[1] for x in db.execute(f'PRAGMA table_info("{name}")')}


def preview(db_path: Path, org_id: str, max_links: int = 30) -> dict:
    if not org_id or max_links < 1 or max_links > 100:
        raise ValueError("invalid org ID or link limit")
    db_path = db_path.resolve(strict=True)
    if not db_path.is_file():
        raise ValueError("SQLite backup file required")
    with closing(sqlite3.connect(db_path.as_uri() + "?mode=ro", uri=True)) as db:
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA query_only=ON")
        if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("SQLite integrity check failed")
        if not _table(db, "organizations"):
            raise ValueError("organizations missing")
        required = {"org_id", "legal_name", "unified_credit_code"}
        if not required <= _cols(db, "organizations"):
            raise ValueError("registry columns missing")
        row = db.execute("SELECT * FROM organizations WHERE org_id=?", (org_id,)).fetchone()
        if row is None:
            raise ValueError("org_id not found")
        name = row["legal_name"]
        code = (row["unified_credit_code"] or "").strip()
        code_collision = db.execute(
            "SELECT COUNT(*) FROM organizations WHERE TRIM(unified_credit_code)=? AND org_id<>?",
            (code, org_id),
        ).fetchone()[0] if code else 0
        name_collision = db.execute(
            """SELECT COUNT(*) FROM organizations
               WHERE TRIM(legal_name)=TRIM(?) AND org_id<>?
               AND COALESCE(TRIM(unified_credit_code),'')<>?""",
            (name or "", org_id, code),
        ).fetchone()[0] if name else 0
        aliases = []
        if _table(db, "organization_names") and {"org_id", "name"} <= _cols(db, "organization_names"):
            aliases = [
                {"name": n["name"], "type": n["name_type"] if "name_type" in n.keys() else None}
                for n in db.execute("SELECT * FROM organization_names WHERE org_id=? LIMIT 100", (org_id,))
            ]
        open_reviews = 0
        if _table(db, "review_queue") and {"entity_id", "status"} <= _cols(db, "review_queue"):
            open_reviews = db.execute(
                "SELECT COUNT(*) FROM review_queue WHERE entity_id=? AND status='open'", (org_id,)
            ).fetchone()[0]
        mentions = []
        if _table(db, "item_org_mentions") and "org_id" in _cols(db, "item_org_mentions"):
            rows = db.execute("SELECT * FROM item_org_mentions WHERE org_id=? LIMIT ?", (org_id, max_links))
            for mention in rows:
                item_id = mention["item_id"] if "item_id" in mention.keys() else None
                item = None
                if item_id and _table(db, "items") and "item_id" in _cols(db, "items"):
                    found = db.execute("SELECT * FROM items WHERE item_id=?", (item_id,)).fetchone()
                    if found:
                        item = {k: found[k] for k in
                                ("item_id", "title", "url", "source_url", "published_at")
                                if k in found.keys()}
                mentions.append({
                    "item": item,
                    "matched_text": mention["matched_text"] if "matched_text" in mention.keys() else None,
                    "match_method": mention["match_method"] if "match_method" in mention.keys() else None,
                    "review_status": "UNVERIFIED",
                })
        evidence = []
        if _table(db, "evidence") and {"entity_type", "entity_id", "url"} <= _cols(db, "evidence"):
            for ev in db.execute(
                "SELECT * FROM evidence WHERE entity_id=? AND entity_type='organization' LIMIT ?",
                (org_id, max_links),
            ):
                evidence.append({k: ev[k] for k in ("evidence_id", "url", "retrieved_at", "evidence_level")
                                 if k in ev.keys()})
        reasons = []
        if code_collision:
            reasons.append("CREDIT_CODE_COLLISION")
        if name_collision:
            reasons.append("SAME_NAME_DIFFERENT_CODE")
        if open_reviews:
            reasons.append("UNRESOLVED_REVIEW_QUEUE")
        if not code:
            reasons.append("MISSING_CREDIT_CODE")
        return {
            "schema": "yihot-charity-private-preview/v1",
            "source": "offline_sqlite_backup",
            "legacy_org_id": org_id,
            "canonical_org_id": None,
            "registration": {
                "legal_name": name,
                "credit_code": code or None,
                "status": row["status"] if "status" in row.keys() else None,
                "registration_authority": row["registration_authority"] if "registration_authority" in row.keys() else None,
            },
            "aliases": aliases,
            "article_mentions": mentions,
            "evidence_links": evidence,
            "identity_conflicts": {"code_collision_rows": code_collision, "name_collision_rows": name_collision,
                                   "open_review_rows": open_reviews, "reasons": reasons},
            "import_authorized": False,
            "public_release_authorized": False,
            "note": "A preview is not a finding, endorsement, legal determination or entity merge.",
        }


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--db", required=True, type=Path, help="Verified OFFLINE backup only")
    p.add_argument("--org-id", required=True, help="Exact legacy organization ID")
    p.add_argument("--output", required=True, type=Path, help="New private JSON file outside Git repo")
    args = p.parse_args()
    out = args.output.resolve()
    try:
        if out == REPO_ROOT or REPO_ROOT in out.parents:
            raise ValueError("output inside Git checkout forbidden")
        if out.exists() or not out.parent.is_dir():
            raise ValueError("output must be a new file in an existing private directory")
        result = preview(args.db, args.org_id)
        with out.open("x", encoding="utf-8") as f:
            os.chmod(out, 0o600)
            json.dump(result, f, ensure_ascii=False, indent=2)
    except (ValueError, OSError, sqlite3.DatabaseError) as exc:
        p.exit(2, f"private preview failed: {type(exc).__name__}; no production database changed\n")
    print(json.dumps({"schema": result["schema"], "saved": True,
                      "identity_review_required": bool(result["identity_conflicts"]["reasons"]),
                      "import_authorized": False}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
