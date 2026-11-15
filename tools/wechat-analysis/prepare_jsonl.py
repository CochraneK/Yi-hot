#!/usr/bin/env python3
"""Opt-in, offline JSONL -> legacy YiHot WeChat analysis corpus preparation.

Only explicitly permitted article bodies. Never reads a database, contacts a
provider, calls a model, writes to a repository, or publishes an output.
Input (one JSON object per line): id, title, published_at (YYYY-MM-DD),
body, source_url, analysis_permitted=true.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from datetime import date
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def outside_repo(path: Path) -> bool:
    return path != REPO_ROOT and REPO_ROOT not in path.parents


def validate(row: object, index: int) -> dict:
    if not isinstance(row, dict):
        raise ValueError(f"line {index}: expected JSON object")
    if row.get("analysis_permitted") is not True:
        raise ValueError(f"line {index}: explicit analysis permission missing")
    for field in ("id", "title", "published_at", "body", "source_url"):
        if not isinstance(row.get(field), str) or not row[field].strip():
            raise ValueError(f"line {index}: missing {field}")
    published_at = row["published_at"]
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", published_at):
        raise ValueError(f"line {index}: exact publication date required")
    try:
        date.fromisoformat(published_at)
    except ValueError as exc:
        raise ValueError(f"line {index}: invalid publication date") from exc
    if not re.fullmatch(r"https://[^\s]+", row["source_url"]):
        raise ValueError(f"line {index}: HTTPS source URL required")
    if "\x00" in row["body"]:
        raise ValueError(f"line {index}: NUL in body")
    return {field: row[field].strip() for field in ("id", "title", "published_at", "body", "source_url")}


def prepare(source: Path, output: Path) -> dict:
    source, output = source.resolve(strict=True), output.resolve()
    if not source.is_file():
        raise ValueError("input must be a JSONL file")
    if not outside_repo(output):
        raise ValueError("output must be outside Git checkout")
    if output.exists():
        raise ValueError("output must be a new directory (refuse overwrites)")
    if output == source or output in source.parents:
        raise ValueError("output must not overwrite input")
    validated = []
    seen = set()
    for n, line in enumerate(source.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            row = validate(json.loads(line), n)
        except json.JSONDecodeError as exc:
            raise ValueError(f"line {n}: invalid JSON") from exc
        if row["id"] in seen:
            raise ValueError(f"line {n}: duplicate article ID")
        seen.add(row["id"])
        slug = re.sub(r"[^\u4e00-\u9fff\w-]+", "_", row["title"], flags=re.UNICODE).strip("_")[:55] or "article"
        suffix = hashlib.sha256(row["id"].encode("utf-8")).hexdigest()[:12]
        row["filename"] = f'{row["published_at"]}_{slug}_{suffix}.txt'
        validated.append(row)
    if not validated:
        raise ValueError("no permitted articles found")
    output.mkdir(parents=True, mode=0o700)
    if os.name == "posix":
        output.chmod(0o700)
    for row in validated:
        path = output / row["filename"]
        with path.open("x", encoding="utf-8") as f:
            f.write(row["body"])
        if os.name == "posix":
            path.chmod(0o600)
    manifest = {
        "schema": "yihot-wechat-analysis-corpus/v1",
        "count": len(validated),
        "publication_range": [min(r["published_at"] for r in validated), max(r["published_at"] for r in validated)],
        "articles": [{"id": r["id"], "file": r["filename"], "source_url": r["source_url"]} for r in validated],
        "note": "Private, explicit permission only. Analysis eligibility is not republication permission.",
    }
    target = output / "manifest.json"
    with target.open("x", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    if os.name == "posix":
        target.chmod(0o600)
    return {"count": len(validated), "output": str(output)}


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", required=True, type=Path)
    p.add_argument("--output", required=True, type=Path)
    args = p.parse_args()
    try:
        result = prepare(args.input, args.output)
    except (ValueError, OSError) as exc:
        p.exit(2, f"input validation failed: {type(exc).__name__}; no batch published\n")
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
