#!/usr/bin/env python3
"""Offline, read-only charity-intelligence SQLite migration preflight.

Prints aggregate counts only: no institution names, credit codes or raw evidence.
Never changes the database, creates tables, exports records or grants import approval.
Run against a verified backup snapshot, not the live writer's database.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
from contextlib import closing
from pathlib import Path


TABLES = (
    "organizations", "organization_names", "sources", "items", "evidence",
    "item_org_mentions", "review_queue", "raw_sources", "annual_reports",
    "financials", "org_qualifications", "org_derived_attributes",
)
REQUIRED_COLUMNS = {"org_id", "legal_name", "unified_credit_code"}


def _columns(db: sqlite3.Connection, table: str) -> set[str]:
    # All table names come from TABLES, never from a caller-controlled string.
    return {row[1] for row in db.execute(f'PRAGMA table_info("{table}")')}


def _count(db: sqlite3.Connection, table: str) -> int:
    return db.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]


def audit(path: str | Path) -> dict:
    file = Path(path).resolve(strict=True)
    if not file.is_file():
        raise ValueError("Expected an existing SQLite file")
    # mode=ro must fail rather than silently create a nonexistent database.
    # Do not use immutable=1: it may silently ignore a live WAL file.
    with closing(sqlite3.connect(file.as_uri() + "?mode=ro", uri=True)) as db:
        db.execute("PRAGMA query_only=ON")
        integrity_ok = db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        existing = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        counts = {t: _count(db, t) for t in TABLES if t in existing}
        missing_columns = sorted(REQUIRED_COLUMNS - _columns(db, "organizations")) if "organizations" in existing else sorted(REQUIRED_COLUMNS)
        identity = {}
        references = {}
        blockers = []
        if not integrity_ok:
            blockers.append("SQLITE_INTEGRITY_FAILURE")
        if missing_columns:
            blockers.append("MISSING_ORGANIZATION_COLUMNS")
        else:
            identity["blank_legal_name_rows"] = db.execute(
                "SELECT COUNT(*) FROM organizations WHERE legal_name IS NULL OR TRIM(legal_name)=''"
            ).fetchone()[0]
            identity["blank_credit_code_rows"] = db.execute(
                "SELECT COUNT(*) FROM organizations WHERE unified_credit_code IS NULL OR TRIM(unified_credit_code)=''"
            ).fetchone()[0]
            # Codes and names are counted but never emitted; same code may belong to different bodies.
            groups = db.execute("""
                SELECT COUNT(*), COALESCE(SUM(n),0),
                       COALESCE(SUM(CASE WHEN names>1 THEN 1 ELSE 0 END),0)
                FROM (
                    SELECT COUNT(*) AS n, COUNT(DISTINCT TRIM(legal_name)) AS names
                    FROM organizations
                    WHERE unified_credit_code IS NOT NULL AND TRIM(unified_credit_code)<>''
                    GROUP BY TRIM(unified_credit_code) HAVING COUNT(*)>1
                )
            """).fetchone()
            identity.update(duplicate_credit_code_groups=groups[0],
                            rows_in_duplicate_code_groups=groups[1],
                            conflicting_name_code_groups=groups[2])
            identity["same_name_multiple_code_groups"] = db.execute("""
                SELECT COUNT(*) FROM (
                    SELECT 1 FROM organizations
                    WHERE legal_name IS NOT NULL AND TRIM(legal_name)<>''
                    GROUP BY TRIM(legal_name)
                    HAVING COUNT(DISTINCT NULLIF(TRIM(unified_credit_code),''))>1
                )
            """).fetchone()[0]
            if identity["blank_legal_name_rows"] or identity["duplicate_credit_code_groups"] or identity["same_name_multiple_code_groups"]:
                blockers.append("ORGANIZATION_IDENTITY_NEEDS_ADJUDICATION")
        if {"organizations", "organization_names"} <= existing and {"org_id"} <= _columns(db, "organization_names"):
            references["orphan_name_history_rows"] = db.execute("""
                SELECT COUNT(*) FROM organization_names n
                LEFT JOIN organizations o ON o.org_id=n.org_id WHERE o.org_id IS NULL
            """).fetchone()[0]
        if "item_org_mentions" in existing:
            cols = _columns(db, "item_org_mentions")
            if "organizations" in existing and {"org_id"} <= cols:
                references["orphan_org_mentions"] = db.execute("""
                    SELECT COUNT(*) FROM item_org_mentions m
                    LEFT JOIN organizations o ON o.org_id=m.org_id WHERE o.org_id IS NULL
                """).fetchone()[0]
            if "items" in existing and {"item_id"} <= cols and "item_id" in _columns(db, "items"):
                references["orphan_item_mentions"] = db.execute("""
                    SELECT COUNT(*) FROM item_org_mentions m
                    LEFT JOIN items i ON i.item_id=m.item_id WHERE i.item_id IS NULL
                """).fetchone()[0]
        if "review_queue" in existing and "status" in _columns(db, "review_queue"):
            references["open_review_queue_rows"] = db.execute(
                "SELECT COUNT(*) FROM review_queue WHERE status='open'"
            ).fetchone()[0]
        if any(v for k, v in references.items() if k.startswith("orphan_")):
            blockers.append("DANGLING_REFERENCE_REQUIRES_REVIEW")
        return {
            "schema": "charity-sqlite-readonly-preflight/v1",
            "integrity_ok": integrity_ok,
            "missing_organization_columns": missing_columns,
            "table_counts": counts,
            "identity_counts": identity,
            "reference_counts": references,
            "blockers": blockers,
            "status": "BLOCKED" if blockers else "REVIEW_REQUIRED",
            "migration_authorized": False,
            "note": "Counts are local snapshot observations, not proven identities, permissions, or current production state.",
        }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", required=True, help="Existing offline SQLite backup; never production write DB")
    args = parser.parse_args()
    try:
        result = audit(args.db)
    except (OSError, ValueError, sqlite3.DatabaseError) as exc:
        parser.exit(2, f"[preflight failed] {type(exc).__name__}; no database was modified\n")
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
