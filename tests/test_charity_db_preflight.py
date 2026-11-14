"""No third-party services or real organization data are used in these tests."""
import hashlib
import importlib.util
import sqlite3
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "charity_db_preflight.py"
spec = importlib.util.spec_from_file_location("charity_db_preflight", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CharityPreflightTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = Path(self.tmp.name) / "fixture.sqlite"

    def make_db(self, full=True):
        with sqlite3.connect(self.db) as conn:
            cols = ", legal_name TEXT, unified_credit_code TEXT" if full else ", legal_name TEXT"
            conn.execute(f"CREATE TABLE organizations(org_id TEXT PRIMARY KEY{cols})")
            conn.execute("CREATE TABLE items(item_id TEXT PRIMARY KEY)")
            conn.execute("CREATE TABLE item_org_mentions(item_id TEXT, org_id TEXT)")
            conn.execute("CREATE TABLE organization_names(org_id TEXT, name TEXT)")
        return sqlite3.connect(self.db)

    def test_conflicts_and_dangling_links_are_blocked_without_write(self):
        with self.make_db() as conn:
            conn.executemany("INSERT INTO organizations VALUES(?,?,?)", [
                ("org_a", "示例甲", "CODE-X"), ("org_b", "示例乙", "CODE-X"),
                ("org_c", "示例丙", None),
            ])
            conn.execute("INSERT INTO items VALUES('item_a')")
            conn.execute("INSERT INTO item_org_mentions VALUES('item_missing', 'org_missing')")
            conn.execute("INSERT INTO organization_names VALUES('org_missing','别名')")
        before = hashlib.sha256(self.db.read_bytes()).hexdigest()
        result = module.audit(self.db)
        after = hashlib.sha256(self.db.read_bytes()).hexdigest()
        self.assertEqual(before, after)
        self.assertEqual(result["identity_counts"]["duplicate_credit_code_groups"], 1)
        self.assertEqual(result["identity_counts"]["rows_in_duplicate_code_groups"], 2)
        self.assertEqual(result["identity_counts"]["conflicting_name_code_groups"], 1)
        self.assertEqual(result["identity_counts"]["blank_credit_code_rows"], 1)
        self.assertEqual(result["reference_counts"]["orphan_org_mentions"], 1)
        self.assertEqual(result["reference_counts"]["orphan_item_mentions"], 1)
        self.assertEqual(result["reference_counts"]["orphan_name_history_rows"], 1)
        self.assertEqual(result["status"], "BLOCKED")
        self.assertFalse(result["migration_authorized"])
        self.assertNotIn("CODE-X", str(result))

    def test_clean_data_still_needs_human_review(self):
        with self.make_db() as conn:
            conn.execute("INSERT INTO organizations VALUES('org_a','示例甲','CODE-1')")
        result = module.audit(self.db)
        self.assertEqual(result["status"], "REVIEW_REQUIRED")
        self.assertEqual(result["blockers"], [])
        self.assertFalse(result["migration_authorized"])

    def test_missing_required_credit_column_is_blocked(self):
        with self.make_db(full=False) as conn:
            conn.execute("INSERT INTO organizations VALUES('org_a','示例甲')")
        result = module.audit(self.db)
        self.assertEqual(result["status"], "BLOCKED")
        self.assertIn("unified_credit_code", result["missing_organization_columns"])

    def test_missing_database_is_not_created(self):
        path = Path(self.tmp.name) / "missing.sqlite"
        with self.assertRaises(FileNotFoundError):
            module.audit(path)
        self.assertFalse(path.exists())


if __name__ == "__main__":
    unittest.main()
