#!/usr/bin/env python3
"""Deliver Yi-Hot's published weekly/monthly reports through SMTP.

The website remains the only report generator. This adapter reads the public report DTO, renders
an email-friendly view, and records one receipt per report and recipient in a local state file.
"""

import argparse
import email
import html
import imaplib
import json
import os
import smtplib
import ssl
import tempfile
from email.message import EmailMessage
from pathlib import Path
from email.utils import getaddresses
from urllib.request import Request, urlopen


def env(name, fallback=None):
    value = os.environ.get(name, "").strip()
    if value:
        return value
    if fallback:
        return os.environ.get(fallback, "").strip()
    return ""


def recipients():
    return [x.strip().lower() for x in env("EMAIL_TO").split(",") if x.strip()]


def fetch_latest(base, kind):
    url = f"{base.rstrip('/')}/api/site/reports/{kind}/latest-page"
    req = Request(url, headers={"Accept": "application/json", "User-Agent": "YiHot-Mail/1.0"})
    with urlopen(req, timeout=20) as response:
        return json.load(response).get("report")


def api(path, body):
    base = env("YIHOT_INTERNAL_API") or "http://127.0.0.1/yihot"
    token = env("INGEST_TOKEN")
    req = Request(f"{base.rstrip('/')}{path}", data=json.dumps(body).encode(), method="POST", headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}", "User-Agent": "YiHot-Mail/1.0"})
    with urlopen(req, timeout=30) as response:
        return json.load(response)


def report_url(base, report):
    return f"{base.rstrip('/')}/{report['kind']}/{report['key']}"


def render(report, base, unsubscribe_url=""):
    esc = lambda value: html.escape(str(value or ""))
    kind_name = "周报" if report["kind"] == "weekly" else "月报"
    lead = report.get("lead") or {}
    sections = []
    for section in report.get("sections") or []:
        items = []
        for item in section.get("items") or []:
            if not item.get("available", True):
                continue
            link = item.get("url") or (f"{base.rstrip('/')}/items/{item['itemId']}" if item.get("itemId") else "")
            title = esc(item.get("title"))
            title_html = f'<a href="{esc(link)}" style="color:#14532d;text-decoration:none">{title}</a>' if link else title
            summary = f'<p style="margin:6px 0 0;color:#4b5563;line-height:1.7">{esc(item.get("summary"))}</p>' if item.get("summary") else ""
            items.append(f'<li style="margin:0 0 16px">{title_html}{summary}</li>')
        if items:
            summary = f'<p style="color:#4b5563;line-height:1.7">{esc(section.get("summary"))}</p>' if section.get("summary") else ""
            sections.append(f'<h2 style="margin:28px 0 8px;font-size:19px;color:#166534">{esc(section.get("label"))}</h2>{summary}<ul style="padding-left:22px">{"".join(items)}</ul>')
    url = report_url(base, report)
    headline = lead.get("title") or report.get("title") or f"公益总报 · {kind_name}"
    intro = lead.get("leadParagraph") or report.get("overview") or ""
    body = f"""<!doctype html><html><body style="margin:0;background:#f5f5f0;color:#17201b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif">
<div style="display:none;max-height:0;overflow:hidden">{esc(intro)[:140]}</div>
<main style="max-width:680px;margin:0 auto;padding:28px 18px"><div style="background:#fff;border:1px solid #dce5dd;border-radius:16px;padding:28px">
<div style="color:#15803d;font-size:13px;font-weight:700;letter-spacing:.08em">YI-HOT · 公益总报 · {kind_name}</div>
<h1 style="font-size:26px;line-height:1.35;margin:10px 0 12px">{esc(headline)}</h1>
<p style="color:#4b5563;line-height:1.8;margin:0 0 22px">{esc(intro)}</p>
{"".join(sections)}
<p style="margin:30px 0 0"><a href="{esc(url)}" style="display:inline-block;background:#166534;color:white;text-decoration:none;padding:10px 16px;border-radius:999px">在 Yi-Hot 查看完整总报</a></p>
</div><p style="text-align:center;color:#6b7280;font-size:12px;line-height:1.8">你收到此邮件，是因为该地址已确认订阅 Yi-Hot 公益总报。{f'<br><a href="{esc(unsubscribe_url)}" style="color:#4b5563">退订邮件</a>' if unsubscribe_url else ''}</p></main></body></html>"""
    text = f"{headline}\n\n{intro}\n\n完整总报：{url}\n" + (f"\n退订：{unsubscribe_url}\n" if unsubscribe_url else "")
    return body, text


def render_confirmation(payload):
    url = html.escape(payload["confirmUrl"])
    body = f'''<!doctype html><html><body style="background:#f5f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif"><main style="max-width:620px;margin:30px auto;background:white;border:1px solid #dce5dd;border-radius:16px;padding:30px"><div style="color:#15803d;font-size:13px;font-weight:700">YI-HOT · 邮件订阅</div><h1 style="font-size:24px">请确认订阅公益总报</h1><p style="color:#4b5563;line-height:1.8">点击下面的按钮完成确认。未确认的地址不会收到周报或月报；链接 48 小时内有效。</p><p><a href="{url}" style="display:inline-block;background:#166534;color:white;text-decoration:none;padding:11px 18px;border-radius:999px">确认订阅</a></p><p style="color:#6b7280;font-size:12px;line-height:1.7">如果不是你提交的邮箱，可以忽略此邮件。</p></main></body></html>'''
    text = f"请确认订阅 Yi-Hot 公益总报：\n{payload['confirmUrl']}\n\n如果不是你提交的邮箱，可以忽略此邮件。"
    return body, text


def smtp_settings():
    sender = env("EMAIL_FROM", "MAIL_SOURCE_USER")
    password = env("EMAIL_PASSWORD", "MAIL_SOURCE_PASSWORD")
    host = env("EMAIL_SMTP_SERVER") or ("smtp.qq.com" if sender.lower().endswith("@qq.com") else "")
    port = int(env("EMAIL_SMTP_PORT") or "465")
    if not sender or not password or not host:
        raise RuntimeError("EMAIL_FROM/EMAIL_PASSWORD/EMAIL_SMTP_SERVER are not fully configured")
    return sender, password, host, port


def send(subject, body, text, recipient, unsubscribe_url=""):
    sender, password, host, port = smtp_settings()
    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = recipient
    msg["Subject"] = subject
    msg["X-Mailer"] = "Yi-Hot Report Delivery"
    if unsubscribe_url:
        msg["List-Unsubscribe"] = f"<{unsubscribe_url}>"
    msg.set_content(text)
    msg.add_alternative(body, subtype="html")
    context = ssl.create_default_context()
    if port == 465:
        with smtplib.SMTP_SSL(host, port, context=context, timeout=30) as client:
            client.login(sender, password)
            client.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=30) as client:
            client.starttls(context=context)
            client.login(sender, password)
            client.send_message(msg)


def deliver_outbox(item, base):
    payload = item["payload"]
    recipient = payload["email"]
    if item["kind"] == "confirmation":
        subject = "请确认订阅 Yi-Hot 公益总报"
        body, text = render_confirmation(payload)
    else:
        report = payload["report"]
        label = "周报" if report["kind"] == "weekly" else "月报"
        subject = f"Yi-Hot 公益总报 · {label} · {report['key']}"
        body, text = render(report, base, payload.get("unsubscribeUrl", ""))
    send(subject, body, text, recipient, payload.get("unsubscribeUrl", "") if item["kind"] == "report" else "")


def process_outbox(base):
    api("/api/ingest/newsletter/sync", {})
    items = api("/api/ingest/newsletter/claim", {"limit": 20}).get("items", [])
    results = []
    for item in items:
        try:
            deliver_outbox(item, base)
            api("/api/ingest/newsletter/result", {"id": item["id"], "status": "sent", "response": "SMTP accepted"})
            results.append({"id": item["id"], "status": "sent"})
        except smtplib.SMTPRecipientsRefused as exc:
            api("/api/ingest/newsletter/result", {"id": item["id"], "status": "failed", "response": str(exc)[:400]})
            api("/api/ingest/newsletter/bounce", {"email": item["payload"].get("email", ""), "diagnostic": "SMTP recipient refused"})
            results.append({"id": item["id"], "status": "failed"})
        except smtplib.SMTPResponseException as exc:
            api("/api/ingest/newsletter/result", {"id": item["id"], "status": "failed", "response": f"SMTP {exc.smtp_code}"})
            results.append({"id": item["id"], "status": "failed"})
        except Exception as exc:
            # A connection loss after DATA may still have delivered. Keep it unknown rather than
            # retrying automatically and risking a duplicate message.
            api("/api/ingest/newsletter/result", {"id": item["id"], "status": "unknown", "response": str(exc)[:400]})
            results.append({"id": item["id"], "status": "unknown"})
    return results


def bounce_addresses(message):
    if message.get_content_type() != "multipart/report" and "delivery status" not in str(message.get("Subject", "")).lower():
        return []
    values = []
    for part in message.walk():
        if part.get_content_type() == "message/delivery-status":
            payload = part.get_payload()
            blocks = payload if isinstance(payload, list) else [part]
            for block in blocks:
                action = str(block.get("Action", "")).lower()
                status = str(block.get("Status", ""))
                if action and action != "failed" and not status.startswith("5"):
                    continue
                for key in ("Final-Recipient", "Original-Recipient", "X-Failed-Recipients"):
                    value = block.get(key)
                    if value: values.append(value.split(";", 1)[-1].strip())
    values += [addr for _, addr in getaddresses(message.get_all("X-Failed-Recipients", []))]
    return sorted({v.lower() for v in values if "@" in v})


def process_bounces(state):
    host = env("MAIL_SOURCE_HOST")
    user = env("MAIL_SOURCE_USER")
    password = env("MAIL_SOURCE_PASSWORD")
    if not host or not user or not password:
        return []
    client = imaplib.IMAP4_SSL(host, int(env("MAIL_SOURCE_PORT") or "993"), ssl_context=ssl.create_default_context(), timeout=30)
    try:
        client.login(user, password); client.select("INBOX", readonly=True)
        _, data = client.uid("search", None, "ALL")
        uids = [int(x) for x in (data[0] or b"").split()]
        last = int(state.get("bounce_uid", 0))
        if not last:
            state["bounce_uid"] = max(uids, default=0)
            return []
        results = []
        for uid in [u for u in uids if u > last]:
            status, fetched = client.uid("fetch", str(uid), "(BODY.PEEK[])")
            if status != "OK" or not fetched or not isinstance(fetched[0], tuple):
                continue
            message = email.message_from_bytes(fetched[0][1])
            for address in bounce_addresses(message):
                results.append({"email": address, **api("/api/ingest/newsletter/bounce", {"email": address, "diagnostic": str(message.get("Subject", ""))[:200]})})
            state["bounce_uid"] = uid
        return results
    finally:
        try: client.logout()
        except Exception: pass


def load_state(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {"sent": {}}


def save_state(path, state):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix="delivery-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as out:
            json.dump(state, out, ensure_ascii=False, indent=2, sort_keys=True)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def deliver(report, base, target, state, test=False):
    body, text = render(report, base)
    label = "周报" if report["kind"] == "weekly" else "月报"
    subject = f"{'[测试] ' if test else ''}Yi-Hot 公益总报 · {label} · {report['key']}"
    key = f"{report['kind']}:{report['key']}:{target}"
    if not test and key in state["sent"]:
        return {"recipient": target, "status": "duplicate", "key": key}
    send(subject, body, text, target)
    if not test:
        state["sent"][key] = {"subject": subject}
    return {"recipient": target, "status": "sent", "key": key}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", action="store_true", help="send the latest weekly as a test; do not write a receipt")
    parser.add_argument("--initialize", action="store_true", help="initialize bounce cursor without sending")
    parser.add_argument("--kind", choices=("weekly", "monthly"))
    args = parser.parse_args()
    base = env("YIHOT_BASE") or "https://49.233.72.222/yihot"
    state_path = Path(env("EMAIL_DELIVERY_STATE") or "/var/lib/yihot-email-delivery/state.json")
    state = load_state(state_path)
    if args.test:
        targets = recipients()
        if not targets: raise RuntimeError("EMAIL_TO has no recipients")
        report = fetch_latest(base, args.kind or "weekly")
        results = [deliver(report, base, target, state, True) for target in targets]
        print(json.dumps({"results": results}, ensure_ascii=False)); return
    if env("EMAIL_DELIVERY_ENABLED").lower() not in ("1", "true", "yes"):
        print(json.dumps({"status": "disabled"}))
        return
    bounces = process_bounces(state)
    results = [] if args.initialize else process_outbox(base)
    save_state(state_path, state)
    print(json.dumps({"results": results, "bounces": bounces}, ensure_ascii=False))


if __name__ == "__main__":
    main()
