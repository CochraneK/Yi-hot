"""Collect approved newsletter issues from a read-only IMAP mailbox into YiHot."""
from __future__ import annotations

import email
import hashlib
import imaplib
import json
import os
import re
import ssl
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from email.header import decode_header
from email.message import Message
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

# The inbox proxy (the web app's edge middleware) rejects requests whose User-Agent looks like a
# bot — urllib's default "Python-urllib/3.x" is blocked with 403 "Access denied". Send the same
# browser UA the rest of YiHot uses so the ingest POST reaches the API instead of the WAF.
BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

SOURCES = {
    "email-amcham-events": {"query": "amchamevent", "name": "AmCham China Events 邮件", "kind": "amcham"},
    "email-amity-chuanyi": {"query": "aidechuany", "name": "爱德传一基金 · 慈善纪事简报", "kind": "chuanyi"},
}
IMPACT = re.compile(r"social impact|公益|慈善|esg|可持续|sustainab|乡村|教育|儿童|残障|环境|气候|carbon|community|志愿", re.I)
DROP = re.compile(r"unsubscribe|退订|取消订阅|manage.*subscription|隐私|privacy|powered by|ICP备", re.I)
# 本期网页版（灵析 mv 页）：正文就是这一期。旧版只认「完整版/网页版」，本期邮件上写的是
# 「查看或分享邮件内容」，于是落到下面的往期导航上——抓回整本《慈善纪事简报》2025 年刊，
# 60000 字上限被一份年度合集填满，模型照它写出「爱德传一基金发布《2025年中国公益慈善纪事》」
# 这类与当期无关的标题。宁可跳过一期，也不要拿往期合集当正文。
PAGE_LINK = re.compile(r"完整版|完整邮件|网页版|查看全文|查看或分享邮件内容|在浏览器|网页浏览")
# 每期固定出现的栏目导航：年刊 PDF、往期第 NN 期、订阅入口。都不是「本期」。
STANDING_LINK = re.compile(r"年刊|年鉴|往期|合集|订阅|下载|第\s*\d+\s*期|\.pdf", re.I)


def decode_header_text(value: str | None) -> str:
    out = []
    for part, charset in decode_header(value or ""):
        if isinstance(part, bytes):
            out.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            out.append(part)
    return re.sub(r"\s+", " ", "".join(out)).strip()


def decode_part(part: Message) -> str:
    payload = part.get_payload(decode=True) or b""
    candidates = [part.get_content_charset(), "utf-8", "gb18030"]
    rows = []
    for charset in dict.fromkeys(value for value in candidates if value):
        try:
            text = payload.decode(charset, errors="replace")
            rows.append((text.count("�"), -sum("\u4e00" <= c <= "\u9fff" for c in text), text))
        except LookupError:
            pass
    return min(rows)[2] if rows else payload.decode("utf-8", errors="replace")


class HtmlContent(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.hidden = 0
        self.text: list[str] = []
        self.href: str | None = None
        self.anchor_text: list[str] = []
        self.anchors: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in {"style", "script"}:
            self.hidden += 1
        if tag.lower() == "a":
            value = dict(attrs).get("href") or ""
            self.href = value if value.startswith(("http://", "https://")) else None
            self.anchor_text = []

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in {"style", "script"} and self.hidden:
            self.hidden -= 1
        if tag.lower() == "a" and self.href:
            label = re.sub(r"\s+", " ", "".join(self.anchor_text)).strip()
            self.anchors.append((label, self.href))
            self.href = None

    def handle_data(self, data: str) -> None:
        if self.hidden:
            return
        self.text.append(data)
        if self.href:
            self.anchor_text.append(data)


def message_content(message: Message) -> tuple[str, list[tuple[str, str]]]:
    texts: list[str] = []
    anchors: list[tuple[str, str]] = []
    for part in message.walk() if message.is_multipart() else [message]:
        if part.get_content_disposition() == "attachment":
            continue
        if part.get_content_type() == "text/html":
            parser = HtmlContent()
            parser.feed(decode_part(part))
            texts.extend(parser.text)
            anchors.extend(parser.anchors)
        elif part.get_content_type() == "text/plain":
            texts.append(decode_part(part))
    text = re.sub(r"\s+", " ", " ".join(texts)).strip()
    return text[:12_000], list(dict.fromkeys(anchors))


def clean_redirect_url(url: str) -> str | None:
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    if parsed.hostname and parsed.hostname.endswith("glueup.cn") and query.get("redirect_url"):
        url = query["redirect_url"][0]
        parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return None
    kept = [(k, v) for k, values in parse_qs(parsed.query).items() for v in values if not k.lower().startswith(("pk_", "utm_"))]
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, "", urlencode(kept), ""))


def published_at_for(message: Message) -> str | None:
    """RFC 822 Date header → ISO-8601 (keeping the offset), or None when it cannot be trusted.

    Emails used to drop this entirely, so items fell back to the ingestion time and the shown
    publish time was wrong. A header with no usable zone (-0000 / missing) yields None: we never
    fabricate an offset, such an item keeps the ingestion fallback instead of a guessed time.
    """
    raw = message.get("Date")
    if not raw:
        return None
    try:
        moment = parsedate_to_datetime(raw)
    except (TypeError, ValueError):
        return None
    if moment is None or moment.tzinfo is None:
        return None
    return moment.isoformat()


def published_on_or_after(published: str | None, cutoff: datetime) -> bool:
    """Whether an ISO-8601 publish instant (from :func:`published_at_for`) is on/after ``cutoff``."""
    if not published:
        return False
    try:
        moment = datetime.fromisoformat(published)
    except ValueError:
        return False
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment >= cutoff


def item_for(source: dict[str, str], message: Message, initial: bool) -> dict | None:
    subject = decode_header_text(message.get("Subject"))
    body, anchors = message_content(message)
    if not subject or not body:
        return None
    if source["kind"] == "amcham":
        if not IMPACT.search(subject + " " + body):
            return None
        candidates = [(label, clean_redirect_url(url)) for label, url in anchors if not DROP.search(label)]
        direct = [url for _, url in candidates if url and "/event/" in url and not url.rstrip("/").endswith(("register", "sponsors.html"))]
        browser = [url for label, url in candidates if url and "view-in-browser" in url]
        url = (direct or browser or [None])[0]
    else:
        candidates = [(label, clean_redirect_url(url)) for label, url in anchors if not DROP.search(label)]
        page = [url for label, url in candidates if url and PAGE_LINK.search(label) and not STANDING_LINK.search(label)]
        url = (page or [None])[0]
    if not url:
        return None
    message_id = (message.get("Message-ID") or "").strip()
    digest = hashlib.sha256((message_id or subject + url).encode()).hexdigest()
    item: dict = {
        "title": subject[:500],
        "url": url,
        "author": source["name"],
        "excerpt": body,
        "raw": {"emailMessageIdHash": digest, "_aihot": {"backfill": initial}},
    }
    published = published_at_for(message)
    if published:
        item["publishedAt"] = published
    return item


def post_items(source_id: str, source_name: str, items: list[dict]) -> dict:
    endpoint = os.environ.get("YIHOT_INGEST_URL", "http://127.0.0.1/yihot/api/ingest/items")
    token = os.environ.get("INGEST_TOKEN", "").strip()
    if len(token) < 16:
        raise RuntimeError("INGEST_TOKEN missing or too short")
    payload = json.dumps({"sourceId": source_id, "sourceName": source_name, "items": items}, ensure_ascii=False).encode()
    request = urllib.request.Request(endpoint, data=payload, headers={"Authorization": "Bearer " + token, "Content-Type": "application/json", "User-Agent": BROWSER_UA}, method="POST")
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read())


def main() -> None:
    state_path = Path(os.environ.get("MAIL_SOURCE_STATE", "/var/lib/yihot-email/state.json"))
    state = json.loads(state_path.read_text("utf-8")) if state_path.exists() else {"initialized": False, "uids": {}}
    initial = not state.get("initialized", False)
    # Optional one-off backfill: MAIL_BACKFILL_AFTER=YYYY-MM-DD reprocesses the whole mailbox, keeps
    # only items published on/after that day (read in Beijing time), ingests them as explicit
    # backfill, then advances the UID cursor so the normal 30-minute incremental runs resume
    # unchanged. The systemd timer never sets this, so it only runs when invoked by hand.
    backfill_after = os.environ.get("MAIL_BACKFILL_AFTER", "").strip()
    backfill_cutoff: datetime | None = None
    if backfill_after:
        try:
            day = datetime.strptime(backfill_after, "%Y-%m-%d")
        except ValueError as exc:
            raise RuntimeError("MAIL_BACKFILL_AFTER must be YYYY-MM-DD, got %r" % backfill_after) from exc
        backfill_cutoff = day.replace(tzinfo=timezone(timedelta(hours=8)))
    client = imaplib.IMAP4_SSL(os.environ["MAIL_SOURCE_HOST"], int(os.environ.get("MAIL_SOURCE_PORT", "993")), ssl_context=ssl.create_default_context(), timeout=30)
    results = []
    try:
        client.login(os.environ["MAIL_SOURCE_USER"], os.environ["MAIL_SOURCE_PASSWORD"])
        if client.select("INBOX", readonly=True)[0] != "OK":
            raise RuntimeError("cannot select INBOX read-only")
        for source_id, source in SOURCES.items():
            status, data = client.uid("search", None, "FROM", f'"{source["query"]}"')
            uids = (data[0] or b"").split() if status == "OK" else []
            previous = int(state.get("uids", {}).get(source_id, 0))
            if backfill_cutoff is not None:
                items = []
                max_uid = previous
                for uid in uids:
                    fetched_status, fetched = client.uid("fetch", uid, "(BODY.PEEK[])")
                    if fetched_status != "OK" or not fetched or not isinstance(fetched[0], tuple):
                        raise RuntimeError(f"cannot fetch UID {uid.decode()}")
                    item = item_for(source, email.message_from_bytes(fetched[0][1]), True)
                    if not item:
                        continue
                    if not published_on_or_after(item.get("publishedAt"), backfill_cutoff):
                        continue
                    items.append(item)
                    max_uid = max(max_uid, int(uid))
                created = 0
                for offset in range(0, len(items), 50):
                    created += int(post_items(source_id, source["name"], items[offset:offset + 50]).get("created", 0))
                state.setdefault("uids", {})[source_id] = max_uid
                results.append({"source": source_id, "backfill": True, "after": backfill_after, "scanned": len(uids), "accepted": len(items), "created": created})
                continue
            pending = [uid for uid in uids if int(uid) > previous]
            if initial:
                state.setdefault("uids", {})[source_id] = max([int(uid) for uid in uids], default=previous)
                results.append({"source": source_id, "initializedAtUid": state["uids"][source_id], "ingested": 0})
                continue
            items = []
            for uid in pending:
                status, fetched = client.uid("fetch", uid, "(BODY.PEEK[])")
                if status != "OK" or not fetched or not isinstance(fetched[0], tuple):
                    raise RuntimeError(f"cannot fetch UID {uid.decode()}")
                item = item_for(source, email.message_from_bytes(fetched[0][1]), False)
                if item:
                    items.append(item)
            created = 0
            for offset in range(0, len(items), 50):
                created += int(post_items(source_id, source["name"], items[offset:offset + 50]).get("created", 0))
            if pending:
                state.setdefault("uids", {})[source_id] = max(int(uid) for uid in pending)
            results.append({"source": source_id, "seen": len(pending), "accepted": len(items), "created": created})
        state["initialized"] = True
        state_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = state_path.with_suffix(".tmp")
        temporary.write_text(json.dumps(state, ensure_ascii=False), "utf-8")
        temporary.replace(state_path)
        print(json.dumps({"ok": True, "results": results}, ensure_ascii=False))
    finally:
        try:
            client.logout()
        except Exception:
            pass


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        detail = str(exc)
        if isinstance(exc, urllib.request.HTTPError):
            try:
                body = exc.read().decode("utf-8", "replace")[:500]
            except Exception:
                body = ""
            detail = f"HTTP {exc.code} {exc.reason}: {body}"
        print(json.dumps({"ok": False, "errorType": type(exc).__name__, "error": detail}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
