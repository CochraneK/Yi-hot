"""Integration regression: never cascade-delete attempts that were not archived.

Requires AIHOT_DB_CONTAINER pointing at a throwaway PostgreSQL 17 Docker container,
AIHOT_DB_USER/AIHOT_DB_NAME, and a database whose name ends in _ci or _test.
No production credentials or network requests are used.
"""
import csv
import gzip
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
import uuid

CONTAINER = os.environ.get("AIHOT_DB_CONTAINER", "")
USER = os.environ.get("AIHOT_DB_USER", "postgres")
DB = os.environ.get("AIHOT_DB_NAME", "")
ROOT = Path(__file__).resolve().parents[1]


def sql(statement: str, data: bytes | None = None) -> str:
    p = subprocess.run(
        ["docker", "exec", "-i", CONTAINER, "psql", "-U", USER, "-d", DB,
         "-X", "-v", "ON_ERROR_STOP=1", "-q", "-tAc", statement],
        input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    if p.returncode:
        raise AssertionError(p.stderr.decode("utf-8", "replace")[:1500])
    return p.stdout.decode().strip()


@unittest.skipUnless(CONTAINER and DB.endswith(("_ci", "_test")), "requires isolated PostgreSQL test database")
class ReceiptArchiveIntegrity(unittest.TestCase):
    def test_concurrent_child_is_not_lost_and_export_can_be_restored(self):
        key = "archive-test-" + uuid.uuid4().hex
        with tempfile.TemporaryDirectory(prefix="yihot-archive-ci-") as tmp:
            marker = str(Path(tmp) / "barrier")
            env = dict(os.environ, AIHOT_ARCHIVE_DIR=tmp, AIHOT_DB_CONTAINER=CONTAINER,
                       AIHOT_DB_NAME=DB, AIHOT_DB_USER=USER, AIHOT_ARCHIVE_TEST_BARRIER=marker)
            cmd = [sys.executable, str(ROOT / "scripts/archive-db.py"),
                   "--table", "receipts", "--days", "180", "--delete", "--out", tmp, "--batch", "100"]
            parent_id = None
            try:
                parent_id = int(sql(
                    "INSERT INTO receipts (logical_key, service, purpose, status, created_at) "
                    f"VALUES ('{key}','fixture','audit','failed',now()-interval '181 days') RETURNING id"
                ).splitlines()[-1])
                sql("INSERT INTO receipt_attempts (receipt_id,attempt,service,status,started_at) "
                    f"VALUES ({parent_id},1,'fixture','failed',now()-interval '181 days')")
                worker = subprocess.Popen(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                for _ in range(300):
                    if Path(marker + ".ready").exists():
                        break
                    if worker.poll() is not None:
                        self.fail("archive stopped before test barrier: " + worker.communicate()[1][-1300:])
                    time.sleep(0.05)
                self.assertTrue(Path(marker + ".ready").exists(), "archive never reached before-delete barrier")
                sql("INSERT INTO receipt_attempts (receipt_id,attempt,service,status,started_at) "
                    f"VALUES ({parent_id},2,'fixture','failed',now()-interval '1 day')")
                Path(marker + ".continue").write_text("go")
                stdout, stderr = worker.communicate(timeout=30)
                self.assertEqual(worker.returncode, 4, stdout + stderr)
                self.assertEqual(int(sql(f"SELECT count(*) FROM receipts WHERE id={parent_id}")), 1)
                self.assertEqual(int(sql(f"SELECT count(*) FROM receipt_attempts WHERE receipt_id={parent_id}")), 2)
                manifest = json.loads(next(Path(tmp).rglob("manifest.json")).read_text())
                failed = manifest["runs"][-1]["items"][0]
                self.assertFalse(failed["delete"])
                self.assertEqual(failed["files"][0]["rows"], 1)
                self.assertEqual(failed["files"][1]["rows"], 1)
                # A newer attempt is not eligible; it cannot be lost via its old parent.
                next_env = dict(env)
                next_env.pop("AIHOT_ARCHIVE_TEST_BARRIER")
                postponed = subprocess.run(cmd, env=next_env, capture_output=True, text=True, timeout=30)
                self.assertEqual(postponed.returncode, 0, postponed.stderr)
                self.assertEqual(int(sql(f"SELECT count(*) FROM receipts WHERE id={parent_id}")), 1)
                # Once the child is actually old, both rows must be in the same new archive.
                sql(f"UPDATE receipt_attempts SET started_at=now()-interval '181 days' WHERE receipt_id={parent_id}")
                complete = subprocess.run(cmd, env=next_env, capture_output=True, text=True, timeout=30)
                self.assertEqual(complete.returncode, 0, complete.stderr)
                self.assertEqual(int(sql(f"SELECT count(*) FROM receipts WHERE id={parent_id}")), 0)
                self.assertEqual(int(sql(f"SELECT count(*) FROM receipt_attempts WHERE receipt_id={parent_id}")), 0)
                manifest = json.loads(next(Path(tmp).rglob("manifest.json")).read_text())
                successful = next(item for run in manifest["runs"] for item in run["items"] if item.get("delete"))
                self.assertEqual([f["rows"] for f in successful["files"]], [1, 2])
                archive_dir = next(Path(tmp).rglob("manifest.json")).parent
                # Full row recovery, not just ID counting. COPY CSV exported by PostgreSQL
                # back into the same throwaway DB in FK order.
                for table, file_info in zip(("receipts", "receipt_attempts"), successful["files"]):
                    content = gzip.decompress((archive_dir / file_info["file"]).read_bytes())
                    self.assertTrue(content.startswith(b"id,"))
                    sql(f"COPY {table} FROM STDIN WITH (FORMAT csv, HEADER)", content)
                self.assertEqual(int(sql(f"SELECT count(*) FROM receipts WHERE id={parent_id}")), 1)
                self.assertEqual(int(sql(f"SELECT count(*) FROM receipt_attempts WHERE receipt_id={parent_id}")), 2)
            finally:
                if parent_id is not None:
                    sql(f"DELETE FROM receipts WHERE id={parent_id}")


if __name__ == "__main__":
    unittest.main()
