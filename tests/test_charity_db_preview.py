"""Synthetic SQLite checks for the private, read-only CharityDB preview."""
import hashlib
import runpy
import sqlite3
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "charity_db_preview.py"
preview = runpy.run_path(str(SCRIPT))["preview"]


class CharityDBPreviewTests(unittest.TestCase):
    def _fixture(self, db_file):
        with sqlite3.connect(db_file) as db:
            db.executescript("""
                CREATE TABLE organizations (
                    org_id TEXT PRIMARY KEY, legal_name TEXT,
                    unified_credit_code TEXT, status TEXT,
                    registration_authority TEXT
                );
                CREATE TABLE organization_names (org_id TEXT, name TEXT, name_type TEXT);
                CREATE TABLE items (item_id TEXT PRIMARY KEY, title TEXT, url TEXT, published_at TEXT);
                CREATE TABLE item_org_mentions (item_id TEXT, org_id TEXT, matched_text TEXT, match_method TEXT);
                CREATE TABLE evidence (evidence_id TEXT, entity_type TEXT, entity_id TEXT, url TEXT, retrieved_at TEXT);
                CREATE TABLE review_queue (entity_id TEXT, status TEXT);
            """)
            db.execute("INSERT INTO organizations VALUES (?,?,?,?,?)", ("o1", "测试基金会", "TEST123", "active", "测试机关"))
            db.execute("INSERT INTO organizations VALUES (?,?,?,?,?)", ("o2", "错列单位", "TEST123", "unknown", "测试机关"))
            db.execute("INSERT INTO organization_names VALUES (?,?,?)", ("o1", "旧称", "former"))
            db.execute("INSERT INTO items VALUES (?,?,?,?)", ("i1", "测试报道", "https://example.org/i1", "2026-10-01"))
            db.execute("INSERT INTO item_org_mentions VALUES (?,?,?,?)", ("i1","o1","测试基金会","exact_name"))
            db.execute("INSERT INTO evidence VALUES (?,?,?,?,?)", ("e1","organization","o1","https://example.org/e1","2026-10-01"))
            db.execute("INSERT INTO review_queue VALUES (?,?)", ("o1", "open"))

    def test_collision_is_not_merged_and_readonly(self):
        with tempfile.TemporaryDirectory() as td:
            db_file = Path(td) / "test.sqlite"
            self._fixture(db_file)
            before = hashlib.sha256(db_file.read_bytes()).hexdigest()
            result = preview(db_file, "o1")
            after = hashlib.sha256(db_file.read_bytes()).hexdigest()
            self.assertEqual(before, after)
            self.assertIsNone(result["canonical_org_id"])
            self.assertFalse(result["import_authorized"])
            self.assertFalse(result["public_release_authorized"])
            self.assertEqual(result["identity_conflicts"]["code_collision_rows"], 1)
            self.assertIn("CREDIT_CODE_COLLISION", result["identity_conflicts"]["reasons"])
            self.assertIn("UNRESOLVED_REVIEW_QUEUE", result["identity_conflicts"]["reasons"])
            self.assertEqual(len(result["article_mentions"]), 1)
            self.assertEqual(result["article_mentions"][0]["review_status"], "UNVERIFIED")
            self.assertEqual(result["evidence_links"][0]["url"], "https://example.org/e1")

    def test_unknown_id_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            db_file = Path(td) / "test.sqlite"
            self._fixture(db_file)
            with self.assertRaisesRegex(ValueError, "not found"):
                preview(db_file, "missing")

    def test_legacy_source_refs_supply_evidence_without_linking_a_shared_source(self):
        # Source contract: schema_v2.py keeps source_ref on facts; collect_cszg.py writes
        # evidence without an entity ID. Migration 0005 adds nullable entity columns later.
        with tempfile.TemporaryDirectory() as td:
            db_file = Path(td) / "legacy.sqlite"
            self._fixture(db_file)
            with sqlite3.connect(db_file) as db:
                db.executescript("""
                    CREATE TABLE org_qualifications (org_id TEXT, qual_type TEXT, source_ref TEXT);
                    ALTER TABLE review_queue ADD COLUMN entity_type TEXT;
                    UPDATE review_queue SET entity_type='organization';
                """)
                db.execute("INSERT INTO evidence VALUES (?,?,?,?,?)", ("registry1",None,None,"https://example.org/registry1","2026-10-02"))
                db.execute("INSERT INTO evidence VALUES (?,?,?,?,?)", ("registry2",None,None,"https://example.org/registry2","2026-10-02"))
                db.execute("INSERT INTO org_qualifications VALUES (?,?,?)", ("o1","registration","registry1"))
                db.execute("INSERT INTO org_qualifications VALUES (?,?,?)", ("o2","registration","registry2"))
                db.execute("INSERT INTO review_queue VALUES (?,?,?)", ("o1","open","source"))
            before = hashlib.sha256(db_file.read_bytes()).hexdigest()
            result = preview(db_file, "o1")
            self.assertEqual({e["evidence_id"] for e in result["evidence_links"]}, {"e1", "registry1"})
            self.assertEqual(result["identity_conflicts"]["open_review_rows"], 1)
            self.assertEqual(hashlib.sha256(db_file.read_bytes()).hexdigest(), before)

    def test_nonexistent_db_never_created(self):
        with tempfile.TemporaryDirectory() as td:
            db_file = Path(td) / "not-created.sqlite"
            with self.assertRaises(FileNotFoundError):
                preview(db_file, "o1")
            self.assertFalse(db_file.exists())


if __name__ == "__main__":
    unittest.main()
