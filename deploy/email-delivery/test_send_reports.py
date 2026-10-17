import importlib.util
import tempfile
import unittest
from email.message import EmailMessage
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

    def test_confirmation_contains_the_confirm_link(self):
        body, text = module.render_confirmation({"confirmUrl": "https://example.test/subscribe/confirm?token=abc"})
        self.assertIn("确认订阅", body)
        self.assertIn("token=abc", text)

    def test_delivery_status_extracts_failed_recipient(self):
        raw = b"From: MAILER-DAEMON@example.test\r\nSubject: Delivery Status Notification\r\nContent-Type: multipart/report; boundary=x\r\n\r\n--x\r\nContent-Type: text/plain\r\n\r\nfailed\r\n--x\r\nContent-Type: message/delivery-status\r\n\r\nFinal-Recipient: rfc822; Bad@Example.com\r\nAction: failed\r\n\r\n--x--\r\n"
        message = module.email.message_from_bytes(raw)
        self.assertEqual(module.bounce_addresses(message), ["bad@example.com"])


if __name__ == "__main__":
    unittest.main()
