"""Read-only IMAP probe for approved YiHot newsletter senders.

Prints metadata and link domains only. It never changes flags, moves messages, or
prints credentials/message bodies. Configuration comes from MAIL_SOURCE_* env vars.
"""
from __future__ import annotations

import email
import hashlib
import imaplib
import json
import os
import re
import ssl
from collections import Counter
from email.header import decode_header
from email.message import Message
from email.utils import getaddresses
from html.parser import HTMLParser
from urllib.parse import urlparse

APPROVED = {
    "amcham-events": {"amchamevent@amchamchina.org", "ebmail.amchamchina.org"},
    "amity-chuanyi-newsletter": {"aidechuany@batch.lingxi360.com"},
}


def decoded(value: str | None) -> str:
    parts = []
    for part, charset in decode_header(value or ""):
        if isinstance(part, bytes):
            parts.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            parts.append(part)
    return "".join(parts).strip()


class Links(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.urls: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        href = dict(attrs).get("href") or ""
        if href.startswith(("http://", "https://")):
            self.urls.append(href)


def bodies(message: Message) -> tuple[list[str], list[str]]:
    html: list[str] = []
    plain: list[str] = []
    parts = message.walk() if message.is_multipart() else [message]
    for part in parts:
        if part.get_content_disposition() == "attachment":
            continue
        content_type = part.get_content_type()
        if content_type not in {"text/html", "text/plain"}:
            continue
        payload = part.get_payload(decode=True) or b""
        text = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
        (html if content_type == "text/html" else plain).append(text)
    return html, plain


def links_of(message: Message) -> list[str]:
    html, plain = bodies(message)
    urls: list[str] = []
    for text in html:
        parser = Links()
        parser.feed(text)
        urls.extend(parser.urls)
    for text in plain:
        urls.extend(re.findall(r"https?://[^\s<>\"]+", text))
    return list(dict.fromkeys(urls))


def sender_key(message: Message) -> str | None:
    raw_headers = [message.get("From", ""), message.get("Sender", ""), message.get("Return-Path", "")]
    raw = "\n".join(raw_headers).lower()
    addresses = {address.lower() for _, address in getaddresses(raw_headers)}
    for key, allowed in APPROVED.items():
        if any(value in raw for value in allowed) or any(address in allowed or any(address.endswith("@" + value) for value in allowed if "@" not in value) for address in addresses):
            return key
    return None


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"missing {name}")
    return value


def main() -> None:
    host = required("MAIL_SOURCE_HOST")
    port = int(os.environ.get("MAIL_SOURCE_PORT", "993"))
    user = required("MAIL_SOURCE_USER")
    password = required("MAIL_SOURCE_PASSWORD")
    context = ssl.create_default_context()
    client = imaplib.IMAP4_SSL(host, port, ssl_context=context, timeout=30)
    try:
        client.login(user, password)
        status, _ = client.select("INBOX", readonly=True)
        if status != "OK":
            raise RuntimeError("cannot select INBOX read-only")
        found: dict[str, bytes] = {}
        for query in ("amchamchina.org", "ebmail.amchamchina.org", "amchamevent", "lingxi360.com", "aidechuany"):
            status, data = client.uid("search", None, "FROM", f'"{query}"')
            if status != "OK":
                continue
            for uid in (data[0] or b"").split()[-10:]:
                found[uid.decode()] = uid
        # QQ Mail's server-side FROM search does not consistently match Sender or
        # Return-Path. Inspect only envelope headers for recent mail, then fetch the
        # body solely for approved senders.
        if not found:
            status, data = client.uid("search", None, "ALL")
            recent = (data[0] or b"").split()[-500:] if status == "OK" else []
            for offset in range(0, len(recent), 50):
                batch = recent[offset:offset + 50]
                status, header_data = client.uid("fetch", b",".join(batch), "(UID BODY.PEEK[HEADER.FIELDS (FROM SENDER RETURN-PATH)])")
                if status != "OK":
                    continue
                for part in header_data or []:
                    if not isinstance(part, tuple):
                        continue
                    uid_match = re.search(rb"\bUID\s+(\d+)\b", part[0])
                    header = email.message_from_bytes(part[1])
                    if uid_match and sender_key(header):
                        found[uid_match.group(1).decode()] = uid_match.group(1)
        rows = []
        for uid in sorted(found.values(), key=lambda value: int(value)):
            status, data = client.uid("fetch", uid, "(BODY.PEEK[])")
            if status != "OK" or not data or not isinstance(data[0], tuple):
                continue
            message = email.message_from_bytes(data[0][1])
            key = sender_key(message)
            if not key:
                continue
            urls = links_of(message)
            domains = Counter(urlparse(url).hostname or "" for url in urls)
            message_id = (message.get("Message-ID") or "").strip().encode()
            rows.append({
                "source": key,
                "subject": decoded(message.get("Subject"))[:200],
                "headerDate": decoded(message.get("Date"))[:100],
                "messageIdHash": hashlib.sha256(message_id).hexdigest()[:16] if message_id else None,
                "linkCount": len(urls),
                "linkDomains": dict(domains.most_common(12)),
            })
        print(json.dumps({"connected": True, "mailbox": "INBOX", "messages": rows}, ensure_ascii=False))
    finally:
        try:
            client.logout()
        except Exception:
            pass


if __name__ == "__main__":
    main()
