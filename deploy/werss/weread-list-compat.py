# Appended to the pinned WeRSS 1.5.3 weread_mp.py by install-weread-compat.sh.
# Use the working list endpoint instead of its stale cover response. The upstream
# parser preserves article dates; WeRead's '~' in originalId represents '_'.
def build_mp_url(original_id: str) -> str:
    token = str(original_id or "").strip().replace("~", "_")
    if token.startswith("WR1"):
        raise WereadMPAPIError("encrypted_article_id", "WeRead returned an opaque article ID")
    return f"https://mp.weixin.qq.com/s/{quote(token, safe='')}" if token else ""


def _yihot_weread_articles(self, faker_id="", Mps_id="", Mps_title="",
                           CallBack=None, start_page=0, MaxPage=1, interval=10,
                           Gather_Content=False, Item_Over_CallBack=None,
                           Over_CallBack=None):
    self.articles = []
    self.aids = []
    self.get_token()
    self._load_weread_auth()
    # The supported mobile representation supplies actual WeChat originalId;
    # desktop responses may return WR1 opaque IDs unsuitable as WeChat links.
    self.user_agent = "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1"
    self.start_time = time.time()
    self.response_valid = False
    if not self._weread_cookies:
        raise WereadMPAPIError("missing_cookie", "WeRead login required", retriable=False)
    if not str(Mps_id).startswith("MP_WXS_"):
        raise WereadMPAPIError("invalid_book_id", "MP_WXS_ feed required", retriable=False)
    latest = 0
    offset = max(int(start_page), 0)
    # Fixed small batch: do not perform unbounded historical catch-up.
    for page in range(min(max(int(MaxPage) - offset, 1), 2)):
        if page:
            time.sleep(2)
        items, groups = parse_mp_articles(self._get_mp_articles_page(Mps_id, offset))
        self.response_valid = True
        known = False
        for item in items:
            if not item["link"] or not item["title"] or not item["update_time"]:
                raise WereadMPAPIError("invalid_article", "Missing URL, title or publication date")
            latest = max(latest, int(item["update_time"]))
            if self._is_article_gathered(Mps_id, item["aid"]):
                known = True
                continue
            item["mp_id"] = Mps_id
            if Gather_Content or self.Gather_Content:
                item["content"] = self._get_mp_content(item["aid"])
            self.FillBack(CallBack=CallBack, data=item,
                          Ext_Data={"mp_title": Mps_title, "mp_id": Mps_id})
            if Item_Over_CallBack:
                Item_Over_CallBack(item)
        offset += groups
        if not groups or known:
            break
    self.update_mps(Mps_id, Feed(sync_time=int(time.time()), update_time=latest or None))
    self.Over(CallBack=Over_CallBack)


MpsWereadMP.get_Articles = _yihot_weread_articles
