"""Synthetic, network-free tests for the opt-in WeChat corpus adapter."""
import json
import runpy
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "tools" / "wechat-analysis" / "prepare_jsonl.py"
prepare = runpy.run_path(str(SCRIPT))["prepare"]


class WeChatCorpusTests(unittest.TestCase):
    def test_explicit_approved_input_with_same_day_titles(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            source = root / "in.jsonl"
            rows = [
                dict(id=f"id{i}", title="公益项目：2026 / 报告", published_at="2026-10-20",
                     body=f"合成测试文章内容{i}", source_url="https://example.org/article",
                     analysis_permitted=True)
                for i in range(2)
            ]
            source.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows), encoding="utf-8")
            result = prepare(source, root / "result")
            self.assertEqual(result["count"], 2)
            corpus = list((root / "result").glob("*.txt"))
            self.assertEqual(len(corpus), 2)
            self.assertNotEqual(corpus[0].name, corpus[1].name)
            manifest = json.loads((root / "result" / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["count"], 2)

    def test_rejects_unlicensed_without_partial_output(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            data = {"id": "one", "title": "测试", "published_at": "2026-10-19",
                    "body": "正文", "source_url": "https://example.org/item"}
            source = root / "in.jsonl"
            source.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "permission"):
                prepare(source, root / "out")
            self.assertFalse((root / "out").exists())

    def test_rejects_invalid_calendar_date_and_duplicate_ids(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            data = {"id": "one", "title": "测试", "published_at": "2026-02-30",
                    "body": "正文", "source_url": "https://example.org/item",
                    "analysis_permitted": True}
            source = root / "in.jsonl"
            source.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "date"):
                prepare(source, root / "bad")
            data["published_at"] = "2026-02-28"
            source.write_text(json.dumps(data, ensure_ascii=False) + "\n" + json.dumps(data, ensure_ascii=False), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "duplicate"):
                prepare(source, root / "duplicate")
            self.assertFalse((root / "duplicate").exists())

    def test_refuses_existing_output(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            source = root / "in.jsonl"
            source.write_text(json.dumps({"id":"1","title":"example","published_at":"2026-11-01",
                                          "body":"test", "source_url":"https://example.org/",
                                          "analysis_permitted":True}),encoding="utf-8")
            (root / "out").mkdir()
            with self.assertRaisesRegex(ValueError, "new directory"):
                prepare(source, root / "out")


if __name__ == "__main__":
    unittest.main()
