import copy
import pathlib
import types
import unittest
from urllib.parse import quote


class Collector:
    Gather_Content = False
    _weread_cookies = "test"
    def get_token(self): pass
    def _load_weread_auth(self): pass
    def _get_mp_articles_page(self, *args): return self.items
    def _is_article_gathered(self, *args): return self.known
    def FillBack(self, CallBack, data, Ext_Data): self.articles.append(data)
    def update_mps(self, *args): self.cursor = args[1]
    def Over(self, **kwargs): self.completed = True


ns = {"MpsWereadMP": Collector, "quote": quote, "WereadMPAPIError": lambda *a, **k: ValueError(a),
      "time": types.SimpleNamespace(time=lambda: 1791850000, sleep=lambda _: None),
      "Feed": lambda **kw: kw, "parse_mp_articles": lambda items: (copy.deepcopy(items), 1)}
exec(pathlib.Path(__file__).with_name("weread-list-compat.py").read_text(), ns)


class CompatTests(unittest.TestCase):
    def collector(self, known=False):
        c = Collector(); c.known = known
        c.items = [{"aid": "id", "link": "https://mp.weixin.qq.com/s/abc_def",
                    "title": "Article", "update_time": 1791795895}]
        return c

    def test_original_link_and_date(self):
        self.assertEqual(ns["build_mp_url"]("abc~def"), "https://mp.weixin.qq.com/s/abc_def")
        with self.assertRaises(ValueError): ns["build_mp_url"]("WR1opaque")
        c = self.collector(); c.get_Articles(Mps_id="MP_WXS_1")
        self.assertEqual(c.articles[0]["update_time"], 1791795895)
        self.assertEqual(c.cursor["update_time"], 1791795895)

    def test_repeat_does_not_duplicate(self):
        c = self.collector(known=True); c.get_Articles(Mps_id="MP_WXS_1")
        self.assertEqual(c.articles, [])
        self.assertTrue(c.completed)

    def test_bad_metadata_does_not_advance_cursor(self):
        c = self.collector(); c.items[0]["update_time"] = 0
        with self.assertRaises(ValueError): c.get_Articles(Mps_id="MP_WXS_1")
        self.assertFalse(hasattr(c, "cursor"))


if __name__ == "__main__": unittest.main()
