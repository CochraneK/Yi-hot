"""Offline email-reader regression: no SMTP, no external source or LLM calls."""
import importlib.util
import pathlib
import unittest
from unittest.mock import patch

MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "deploy" / "email-delivery" / "send_reports.py"
spec = importlib.util.spec_from_file_location("yihot_email_reports", MODULE_PATH)
mail = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mail)
BASE = "https://reports.example.org/yihot"


def fixture(kind="weekly", with_insights=True):
    evidence = [
        {"itemId": "a", "title": "合成新闻甲：发布项目评价安排",
         "summary": "要求公开考核条件", "sourceName": "合成官方源",
         "available": True, "sourceUrl": "https://source.example.org/a"},
        {"itemId": "b", "title": "合成新闻乙：另一机构提交结果",
         "summary": "包含服务对象反馈", "sourceName": "合成媒体",
         "available": True, "sourceUrl": "https://source.example.org/b"},
    ]
    report = {
        "kind": kind, "key": "2026-W46" if kind == "weekly" else "2026-11-17",
        "title": "合成报告", "overview": "旧版较长的周报摘要，仅作为资料保留",
        "lead": {"title": "合成日报头条", "leadParagraph": "一项重要事实及其进展"} if kind == "daily" else None,
        "insights": ([{
            "level": "pattern", "claim": "两个机构在同一议题上采取不同做法",
            "reasoning": "材料甲提出评价安排，材料乙公开了执行结果，但总体影响仍待观察。",
            "alternative": "这也可能只是两个孤立项目。",
            "watchFor": "下次检查是否公开更多实际结果。",
            "evidence": evidence,
        }] if with_insights else []),
        "highlights": evidence[:1],
        "sections": [
            {"label": "项目与执行", "summary": "一段旧分类 summary", "items": evidence},
            {"label": "制度与监管", "summary": "其他长摘要", "items": [
                {"itemId": "c", "title": "合成政策评论", "available": True},
            ]},
        ],
        "flashes": [{"itemId": "d", "title": "合成快讯", "available": True}],
        "yesterdayHot": {
            "day": "2026-11-15", "computedAt": "2026-11-15T15:50:00Z",
            "entries": [{"rank": 1, "storyPublicId": "story-a", "itemId": "a",
                         "title": "合成昨日榜单头条", "heat": 18.7, "sourceName": "合成官方源"}],
        },
        "peers": {"label": "邻域", "items": [{
            "key": "peer:a", "url": "https://peer.example.org/article",
            "title": "合成邻域新事", "peerName": "合成姊妹站", "peerId": "peer",
        }]},
        "metrics": {"totalStories": 2, "sourcesCount": 2},
    }
    return report


class MailReportTests(unittest.TestCase):
    def test_evidence_first_and_short_section_index_with_neighbourhood_last(self):
        report = fixture()
        body, plain = mail.render(report, BASE, "https://reports.example.org/unsubscribe",
                                  hot=[{"title": "DO_NOT_USE_CURRENT_LIVE_HOT"}],
                                  brief="DO_NOT_OVERRIDE_AUDITED_INSIGHT")
        self.assertLess(body.index("本期分析"), body.index("01 · 昨日热榜"))
        self.assertLess(body.index("01 · 昨日热榜"), body.index("02 · 项目与执行"))
        self.assertLess(body.index("02 · 项目与执行"), body.index("03 · 制度与监管"))
        self.assertLess(body.index("03 · 制度与监管"), body.index("04 · 快讯"))
        self.assertLess(body.index("04 · 快讯"), body.index("05 · 邻域"))
        self.assertIn("两个机构在同一议题上采取不同做法", body)
        self.assertIn("合成新闻甲：发布项目评价安排", body)
        self.assertIn(BASE + "/items/a", body)
        self.assertIn("另一种解释", body)
        self.assertIn("<details", body)
        self.assertNotIn("<details open", body)
        self.assertIn(BASE + "/weekly/2026-W46#s-1", body)
        self.assertIn(BASE + "/weekly/2026-W46#s-peers", body)
        self.assertNotIn("DO_NOT_USE_CURRENT_LIVE_HOT", body)
        self.assertNotIn("DO_NOT_OVERRIDE_AUDITED_INSIGHT", body)
        self.assertNotIn("旧版较长的周报摘要", body)
        self.assertNotIn("一段旧分类 summary", body)
        self.assertIn("退订邮件", body)
        self.assertLess(plain.index("01 · 昨日热榜"), plain.index("05 · 邻域"))
        self.assertIn(BASE + "/items/a", plain)

    def test_daily_private_page_never_claims_full_report_url_and_keeps_article_links(self):
        report = fixture("daily", with_insights=False)
        body, plain = mail.render(report, BASE, brief="合成的一分钟日报编辑要点")
        self.assertIn("今日要点", body)
        self.assertIn("合成的一分钟日报编辑要点", body)
        self.assertIn("01 · 昨日热榜", body)
        self.assertIn(BASE + "/items/a", body)
        self.assertIn(BASE + "/all", body)
        self.assertNotIn(BASE + "/daily/2026-11-17", body,
                         "the daily public page is intentionally disabled")
        self.assertNotIn(BASE + "/daily/2026-11-17", plain)
        self.assertIn("01 · 昨日热榜", plain)

    def test_old_period_without_audited_insights_keeps_factual_fallback(self):
        report = fixture("weekly", with_insights=False)
        body, _ = mail.render(report, BASE, brief=None)
        self.assertIn("本期要点", body)
        self.assertIn("旧版较长的周报摘要", body)
        self.assertIn("05 · 邻域", body)

    def test_deliver_does_not_call_anydoor_when_source_report_already_has_insights(self):
        report = fixture()
        item = {
            "kind": "report",
            "payload": {
                "report": report,
                "email": "synthetic@example.org",
                "unsubscribeUrl": "https://reports.example.org/unsubscribe",
            },
        }
        with patch.object(mail, "brief_for", side_effect=AssertionError("extra model call")), \
             patch.object(mail, "send") as smtp:
            mail.deliver_outbox(item, BASE, None, {})
        smtp.assert_called_once()
        html_body = smtp.call_args.args[1]
        self.assertIn("本期分析", html_body)

    def test_html_escape_for_untrusted_news_titles(self):
        report = fixture()
        report["insights"][0]["evidence"][0]["title"] = '<script>alert("x")</script>'
        body, _ = mail.render(report, BASE)
        self.assertNotIn('<script>', body)
        self.assertIn("&lt;script&gt;", body)


if __name__ == "__main__":
    unittest.main()
