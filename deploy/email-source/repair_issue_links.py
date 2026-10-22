"""One-off repair: point chuanyi articles at their own issue page instead of the standing yearbook PDF.

Why this exists
---------------
Every 慈善纪事简报 mail carries fixed navigation links — 《慈善纪事简报》2025年刊 (a PDF that is
uploaded once and never changes) and 往期第 NN 期. The collector used to pick the first link whose
label mentioned 慈善纪事简报, which was that yearbook. Body extraction then read the whole 2025
yearbook (60000-char ceiling filled up), so the model titled those issues after the yearbook:
「爱德传一基金发布《2025年中国公益慈善纪事》，收录101条年度事件」 — a story from January showing up
as today's news.

The collector is fixed (see PAGE_LINK / STANDING_LINK in collect.py). This script repairs the rows
already stored: it reads each mail's 查看或分享邮件内容 link, matches the article by its subject, and
rewrites url + clears the wrong body so extraction and analysis run again against the right page.

Usage (on the server, with the mail env loaded):
    set -a; . /opt/yihot-email/.env; set +a
    python3 repair_issue_links.py            # dry run: what would change
    python3 repair_issue_links.py --apply    # writes SQL, executes it, requeues the articles
"""
from __future__ import annotations

import email
import imaplib
import json
import os
import re
import ssl
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from collect import DROP, PAGE_LINK, STANDING_LINK, clean_redirect_url, decode_header_text, message_content  # noqa: E402

SOURCE_ID = "email-amity-chuanyi"
DB_CONTAINER = "aihot-db-1"
DB_USER = "aihot"
DB_NAME = "aihot"


def psql(sql_text: str) -> str:
    """Run one statement through the database container and return stdout."""
    out = subprocess.run(
        ["sudo", "docker", "exec", "-i", DB_CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
        input=sql_text.encode(), capture_output=True,
    )
    if out.returncode != 0:
        raise RuntimeError(out.stderr.decode("utf-8", "replace")[:2000])
    return out.stdout.decode("utf-8", "replace")


def issue_page_link(message: email.message.Message) -> str | None:
    _, anchors = message_content(message)
    candidates = [(label, clean_redirect_url(url)) for label, url in anchors if not DROP.search(label)]
    page = [url for label, url in candidates if url and PAGE_LINK.search(label) and not STANDING_LINK.search(label)]
    return (page or [None])[0]


def mail_links() -> dict[str, str]:
    """subject → this issue's own page, for every mail from the newsletter."""
    client = imaplib.IMAP4_SSL(
        os.environ["MAIL_SOURCE_HOST"], int(os.environ.get("MAIL_SOURCE_PORT", "993")),
        ssl_context=ssl.create_default_context(), timeout=30,
    )
    try:
        client.login(os.environ["MAIL_SOURCE_USER"], os.environ["MAIL_SOURCE_PASSWORD"])
        client.select("INBOX", readonly=True)
        status, data = client.uid("search", None, "FROM", '"aidechuany"')
        uids = (data[0] or b"").split() if status == "OK" else []
        found: dict[str, str] = {}
        for uid in uids:
            status, fetched = client.uid("fetch", uid, "(BODY.PEEK[])")
            if status != "OK" or not fetched or not isinstance(fetched[0], tuple):
                continue
            message = email.message_from_bytes(fetched[0][1])
            subject = decode_header_text(message.get("Subject"))
            link = issue_page_link(message)
            if subject and link:
                found[subject[:500]] = link
        return found
    finally:
        try:
            client.logout()
        except Exception:
            pass


def main() -> None:
    apply = "--apply" in sys.argv
    rows = psql(f"SELECT id || '|' || coalesce(published_at::text, '') || '|' || title FROM articles WHERE source_id = '{SOURCE_ID}' ORDER BY published_at DESC;\n")
    articles = []
    for line in rows.splitlines():
        if not line.strip():
            continue
        ident, published, title = (line.split("|", 2) + ["", ""])[:3]
        articles.append({"id": ident, "published": published, "title": title})

    links = mail_links()
    plan, missing = [], []
    for article in articles:
        link = links.get(article["title"])
        if not link:
            missing.append(article)
            continue
        plan.append({**article, "url": link})

    print(json.dumps({"mails": len(links), "articles": len(articles), "matched": len(plan)}, ensure_ascii=False))
    for item in plan:
        print("  %s  %s\n      -> %s" % (item["id"], item["title"][:48], item["url"][:96]))
    for item in missing:
        print("  SKIP %s  %s  (no mail with this subject)" % (item["id"], item["title"][:48]))
    if not apply:
        print("\ndry run; pass --apply to rewrite url + body and requeue")
        return

    statements = []
    for item in plan:
        url = item["url"].replace("'", "''")
        statements.append(
            f"UPDATE articles SET url = '{url}', body_text = NULL, body_html = NULL, body_status = 'pending',"
            f" revision = revision + 1, content_hash = NULL, processing_state = 'new', processing_attempts = 0,"
            f" processing_retry_at = NULL, processing_error = NULL, media = '[]'::jsonb,"
            f" raw = coalesce(raw, '{{}}'::jsonb) || jsonb_build_object('_repair', jsonb_build_object('issueLinkFixedAt', now(), 'previousUrl', url)),"
            f" updated_at = now() WHERE id = '{item['id']}';\n"
        )
    psql("".join(statements))
    print(f"\nrewrote {len(statements)} articles; extraction + analysis will run on the next tick")


if __name__ == "__main__":
    main()
