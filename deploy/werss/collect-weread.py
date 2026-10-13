"""Refresh subscribed WeRead feeds without notifications or model calls."""
import contextlib
import io
import json

results = []
with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
    from core.db import DB
    from core.models.feed import Feed
    from core.wx.model.weread_mp import MpsWereadMP
    from jobs.article import UpdateArticle
    session = DB.get_session()
    feeds = [(f.id, f.mp_name) for f in session.query(Feed).filter(Feed.status == 1).all()
             if f.id.startswith("MP_WXS_") and f.id != "MP_WXS_FEATURED_ARTICLES"]
    session.close()
    for feed_id, name in feeds:
        try:
            wx = MpsWereadMP()
            wx.get_Articles(Mps_id=feed_id, Mps_title=name, CallBack=UpdateArticle, MaxPage=1)
            results.append({"feed": feed_id, "added": len(wx.articles), "valid": wx.response_valid})
        except Exception as exc:
            results.append({"feed": feed_id, "errorType": type(exc).__name__,
                            "code": getattr(exc, "code", "unknown")})
print(json.dumps(results, ensure_ascii=False))
raise SystemExit(1 if any("errorType" in r for r in results) else 0)
