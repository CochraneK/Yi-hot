import unittest
from email.message import EmailMessage
from collect import clean_redirect_url, item_for


class EmailCollectorTests(unittest.TestCase):
    def test_glueup_tracking_url_becomes_canonical_event(self):
        tracked = "https://amcham.glueup.cn/track/rd?redirect_url=https%3A%2F%2Famcham.glueup.cn%2Fevent%2Fsocial-impact-summit-123%2F%3Fpk_campaign%3Dx"
        self.assertEqual(clean_redirect_url(tracked), "https://amcham.glueup.cn/event/social-impact-summit-123/")

    def test_amcham_filters_unrelated_event_and_keeps_social_impact(self):
        message = EmailMessage()
        message["Subject"] = "2026 Social Impact Summit"
        message["Message-ID"] = "<one@example.org>"
        message.set_content("fallback")
        message.add_alternative('<a href="https://amcham.glueup.cn/track/rd?redirect_url=https%3A%2F%2Famcham.glueup.cn%2Fevent%2Fsocial-impact-summit-123%2F">Social Impact Summit</a>', subtype="html")
        item = item_for({"kind": "amcham", "name": "AmCham"}, message, False)
        self.assertEqual(item["url"], "https://amcham.glueup.cn/event/social-impact-summit-123/")
        message.replace_header("Subject", "Business English Workshop")
        message.set_payload("Ordinary commercial training")
        self.assertIsNone(item_for({"kind": "amcham", "name": "AmCham"}, message, False))

    def test_chuanyi_uses_full_issue_link_without_email_date(self):
        message = EmailMessage()
        message["Subject"] = "慈善纪事简报第 82 期"
        message["Date"] = "Tue, 13 Oct 2026 08:00:00 +0800"
        message["Message-ID"] = "<two@example.org>"
        message.set_content("fallback")
        message.add_alternative('<p>本期关注公益行业。</p><a href="https://etrack01.com/track/click2/issue.html">查看本邮件完整版</a><a href="https://example.org/unsubscribe">取消订阅</a>', subtype="html")
        item = item_for({"kind": "chuanyi", "name": "爱德传一基金"}, message, True)
        self.assertEqual(item["url"], "https://etrack01.com/track/click2/issue.html")
        self.assertNotIn("publishedAt", item)
        self.assertTrue(item["raw"]["_aihot"]["backfill"])


if __name__ == "__main__":
    unittest.main()
