#!/usr/bin/env python3
"""Deliver Yi-Hot's published weekly/monthly reports through SMTP.

The website remains the only report generator. This adapter reads the public report DTO, renders
an email-friendly view, and records one receipt per report and recipient in a local state file.
"""

import argparse
import html
import json
import os
import smtplib
import ssl
import tempfile
from email.message import EmailMessage
from pathlib import Path
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


def report_url(base, report):
    return f"{base.rstrip('/')}/{report['kind']}/{report['key']}"


def render(report, base):
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
</div><p style="text-align:center;color:#6b7280;font-size:12px;line-height:1.6">你收到此邮件，是因为该地址被明确加入 Yi-Hot 总报收件列表。</p></main></body></html>"""
    text = f"{headline}\n\n{intro}\n\n完整总报：{url}\n"
    return body, text


def smtp_settings():
    sender = env("EMAIL_FROM", "MAIL_SOURCE_USER")
    password = env("EMAIL_PASSWORD", "MAIL_SOURCE_PASSWORD")
    host = env("EMAIL_SMTP_SERVER") or ("smtp.qq.com" if sender.lower().endswith("@qq.com") else "")
    port = int(env("EMAIL_SMTP_PORT") or "465")
    if not sender or not password or not host:
        raise RuntimeError("EMAIL_FROM/EMAIL_PASSWORD/EMAIL_SMTP_SERVER are not fully configured")
    return sender, password, host, port


def send(subject, body, text, recipient):
    sender, password, host, port = smtp_settings()
    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = recipient
    msg["Subject"] = subject
    msg["X-Mailer"] = "Yi-Hot Report Delivery"
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
    parser.add_argument("--initialize", action="store_true", help="mark current reports as seen without sending them")
    parser.add_argument("--kind", choices=("weekly", "monthly"))
    args = parser.parse_args()
    targets = recipients()
    if not targets:
        raise RuntimeError("EMAIL_TO has no recipients")
    base = env("YIHOT_BASE") or "https://49.233.72.222/yihot"
    state_path = Path(env("EMAIL_DELIVERY_STATE") or "/var/lib/yihot-email-delivery/state.json")
    state = load_state(state_path)
    kinds = [args.kind or "weekly"] if args.test else ([args.kind] if args.kind else ["weekly", "monthly"])
    if not args.test and env("EMAIL_DELIVERY_ENABLED").lower() not in ("1", "true", "yes"):
        print(json.dumps({"status": "disabled"}))
        return
    results = []
    for kind in kinds:
        report = fetch_latest(base, kind)
        if not report:
            results.append({"kind": kind, "status": "no-report"})
            continue
        for target in targets:
            if args.initialize:
                key = f"{report['kind']}:{report['key']}:{target}"
                state["sent"].setdefault(key, {"subject": "initialized without delivery"})
                results.append({"recipient": target, "status": "initialized", "key": key})
            else:
                results.append(deliver(report, base, target, state, args.test))
    if not args.test:
        save_state(state_path, state)
    print(json.dumps({"results": results}, ensure_ascii=False))


if __name__ == "__main__":
    main()
