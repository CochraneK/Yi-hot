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
from email.header import decode_header
from email.message import Message
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

SOURCES = {
    "email-amcham-events": {"query": "amchamevent", "name": "AmCham China Events 邮件", "kind": "amcham"},
    "email-amity-chuanyi": {"query": "aidechuany", "name": "爱德传一基金 · 慈善纪事简报", "kind": "chuanyi"},
}
IMPACT = re.compile(r"social impact|公益|慈善|esg|可持续|sustainab|乡村|教育|儿童|残障|环境|气候|carbon|community|志愿", re.I)
DROP = re.compile(r"unsubscribe|退订|取消订阅|manage.*subscription|隐私|privacy|powered by|ICP备", re.I)


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
        full = [url for label, url in candidates if url and re.search(r"完整版|完整邮件|网页版|查看全文", label)]
        issue = [url for label, url in candidates if url and "慈善纪事简报" in label]
        url = (full or issue or [None])[0]
    if not url:
        return None
    message_id = (message.get("Message-ID") or "").strip()
    digest = hashlib.sha256((message_id or subject + url).encode()).hexdigest()
    return {
        "title": subject[:500],
        "url": url,
        "author": source["name"],
        "excerpt": body,
        "raw": {"emailMessageIdHash": digest, "_aihot": {"backfill": initial}},
    }


def post_items(source_id: str, source_name: str, items: list[dict]) -> dict:
    endpoint = os.environ.get("YIHOT_INGEST_URL", "http://127.0.0.1/yihot/api/ingest/items")
    token = os.environ.get("INGEST_TOKEN", "").strip()
    if len(token) < 16:
        raise RuntimeError("INGEST_TOKEN missing or too short")
    payload = json.dumps({"sourceId": source_id, "sourceName": source_name, "items": items}, ensure_ascii=False).encode()
    request = urllib.request.Request(endpoint, data=payload, headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read())


def main() -> None:
    state_path = Path(os.environ.get("MAIL_SOURCE_STATE", "/var/lib/yihot-email/state.json"))
    state = json.loads(state_path.read_text("utf-8")) if state_path.exists() else {"initialized": False, "uids": {}}
    initial = not state.get("initialized", False)
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
        print(json.dumps({"ok": False, "errorType": type(exc).__name__}), file=sys.stderr)
        raise SystemExit(1)
