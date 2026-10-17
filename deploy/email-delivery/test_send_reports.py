import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("send_reports", Path(__file__).with_name("send_reports.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ReportDeliveryTests(unittest.TestCase):
    def report(self):
        return {"kind": "weekly", "key": "2026-W41", "title": "公益总报", "lead": {"title": "本周公益动态", "leadParagraph": "一周概览"}, "sections": [{"label": "儿童教育", "summary": "主题摘要", "items": [{"itemId": "a1", "title": "教师法修订", "summary": "保障教师权益", "available": True}]}]}

    def test_render_uses_the_public_report_and_absolute_links(self):
        body, text = module.render(self.report(), "https://example.test/yihot")
        self.assertIn("教师法修订", body)
        self.assertIn("https://example.test/yihot/items/a1", body)
        self.assertIn("2026-W41", module.report_url("https://example.test/yihot", self.report()))
        self.assertIn("完整总报", text)

    def test_receipt_prevents_a_second_non_test_send(self):
        state = {"sent": {}}
        sent = []
        old = module.send
        module.send = lambda *args: sent.append(args)
        try:
            first = module.deliver(self.report(), "https://example.test/yihot", "reader@example.com", state)
            second = module.deliver(self.report(), "https://example.test/yihot", "reader@example.com", state)
        finally:
            module.send = old
        self.assertEqual(first["status"], "sent")
        self.assertEqual(second["status"], "duplicate")
        self.assertEqual(len(sent), 1)


if __name__ == "__main__":
    unittest.main()
