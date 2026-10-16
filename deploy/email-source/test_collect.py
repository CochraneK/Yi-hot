import unittest
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from collect import clean_redirect_url, item_for, published_at_for, published_on_or_after


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

    def test_chuanyi_uses_full_issue_link_and_keeps_email_date(self):
        message = EmailMessage()
        message["Subject"] = "慈善纪事简报第 82 期"
        message["Date"] = "Tue, 13 Oct 2026 08:00:00 +0800"
        message["Message-ID"] = "<two@example.org>"
        message.set_content("fallback")
        message.add_alternative('<p>本期关注公益行业。</p><a href="https://etrack01.com/track/click2/issue.html">查看本邮件完整版</a><a href="https://example.org/unsubscribe">取消订阅</a>', subtype="html")
        item = item_for({"kind": "chuanyi", "name": "爱德传一基金"}, message, True)
        self.assertEqual(item["url"], "https://etrack01.com/track/click2/issue.html")
        self.assertEqual(item["publishedAt"], "2026-10-13T08:00:00+08:00")
        self.assertTrue(item["raw"]["_aihot"]["backfill"])

    def test_amcham_keeps_email_date(self):
        message = EmailMessage()
        message["Subject"] = "2026 Social Impact Summit"
        message["Date"] = "Wed, 15 Oct 2026 09:30:00 +0800"
        message["Message-ID"] = "<three@example.org>"
        message.set_content("fallback")
        message.add_alternative('<a href="https://amcham.glueup.cn/event/social-impact-summit-123/">Social Impact Summit</a>', subtype="html")
        item = item_for({"kind": "amcham", "name": "AmCham"}, message, False)
        self.assertEqual(item["publishedAt"], "2026-10-15T09:30:00+08:00")

    def test_missing_date_header_has_no_published_at(self):
        message = EmailMessage()
        message["Subject"] = "2026 Social Impact Summit"
        message["Message-ID"] = "<four@example.org>"
        message.set_content("fallback")
        message.add_alternative('<a href="https://amcham.glueup.cn/event/social-impact-summit-123/">Social Impact Summit</a>', subtype="html")
        item = item_for({"kind": "amcham", "name": "AmCham"}, message, False)
        self.assertNotIn("publishedAt", item)

    def test_naive_date_header_is_not_trusted(self):
        # "-0000" carries no zone; parsedate_to_datetime returns a naive datetime, so we must not
        # invent an offset. published_at_for yields None and such an item keeps the ingestion
        # fallback instead of a guessed publish time.
        message = EmailMessage()
        message["Date"] = "Thu, 16 Oct 2026 08:00:00 -0000"
        self.assertIsNone(published_at_for(message))
        no_date = EmailMessage()
        no_date["Subject"] = "慈善纪事简报第 83 期"
        self.assertIsNone(published_at_for(no_date))

    def test_published_on_or_after_uses_the_instant(self):
        cutoff = datetime(2026, 10, 1, 0, 0, 0, tzinfo=timezone(timedelta(hours=8)))
        # 09-30 23:30 +00:00 == 10-01 07:30 +08:00, which is after the Beijing cutoff despite the
        # earlier-looking UTC date.
        self.assertTrue(published_on_or_after("2026-09-30T23:30:00+00:00", cutoff))
        self.assertTrue(published_on_or_after("2026-10-01T00:00:00+08:00", cutoff))
        self.assertFalse(published_on_or_after("2026-09-30T15:59:00+08:00", cutoff))
        self.assertFalse(published_on_or_after(None, cutoff))
        self.assertFalse(published_on_or_after("not-a-date", cutoff))


if __name__ == "__main__":
    unittest.main()
