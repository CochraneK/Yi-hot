#!/usr/bin/env python3
"""Deliver Yi-Hot's published daily/weekly/monthly reports through SMTP.

The website remains the only report generator. This adapter reads the public report DTO, renders
an email-friendly view, and records one receipt per report and recipient in a local state file.
"""

import argparse
import email
import html
import imaplib
import json
import os
import re
import smtplib
import ssl
import tempfile
import datetime
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


def fetch_hot(base):
    """Current 48h hot ranking (public API). Returns the entries list, or [] on any failure."""
    try:
        url = f"{base.rstrip('/')}/api/site/hot"
        req = Request(url, headers={"Accept": "application/json", "User-Agent": "YiHot-Mail/1.0"})
        with urlopen(req, timeout=20) as response:
            data = json.load(response)
        return (data.get("entries") or []) if isinstance(data, dict) else []
    except Exception:
        return []


def api(path, body):
    base = env("YIHOT_INTERNAL_API") or "http://127.0.0.1/yihot"
    token = env("INGEST_TOKEN")
    req = Request(f"{base.rstrip('/')}{path}", data=json.dumps(body).encode(), method="POST", headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}", "User-Agent": "YiHot-Mail/1.0"})
    with urlopen(req, timeout=30) as response:
        return json.load(response)


def report_url(base, report):
    return f"{base.rstrip('/')}/{report['kind']}/{report['key']}"


# --- Optional LLM "本期速览" -------------------------------------------------
# The heavy condensation is deterministic (see render()). The LLM only writes a
# short 120-160 char digest. It is free (local AnyDoor pool), cached per issue,
# and NEVER allowed to block or fail a delivery: any problem falls back to the
# report's own lead paragraph.
ANYDOOR_LOCAL = env("ANYDOOR_LOCAL_URL") or "http://127.0.0.1:8787/v1"
BRIEF_MODELS = ("glm-4.5-flash", "gemma4:31b")  # verified to emit Chinese; "auto" often lands on an empty weak model
BRIEF_MAX_INPUT = 6000
BRIEF_ITEMS = {"daily": 5, "weekly": 3, "monthly": 3}  # compact head-lines per section


def _anydoor_key():
    k = env("ANYDOOR_API_KEY")
    if k:
        return k
    try:
        with open("/opt/yihot/.env", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("ANYDOOR_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    return ""


def llm_enabled():
    return env("EMAIL_LLM_BRIEF", "1").lower() not in ("0", "false", "no")


def _brief_prompt(report):
    kname = {"daily": "日报", "weekly": "周报", "monthly": "月报"}.get(report.get("kind"), "总报")
    lead = report.get("lead") or {}
    parts = []
    intro = (lead.get("leadParagraph") or report.get("overview") or "").strip()
    if intro:
        parts.append("本期导语：" + intro[:500])
    blocks = report.get("sections") or report.get("themes") or []
    for b in blocks[:24]:
        label = (b.get("label") or b.get("heading") or "").strip()
        summ = (b.get("summary") or "").strip()
        items = b.get("items") or b.get("storyRefs") or []
        titles = [(it.get("title") or "").strip() for it in items[:3]]
        line = "【" + label + "】"
        if summ:
            line += summ[:150]
        if titles:
            line += "；代表条目：" + "、".join(t for t in titles if t)
        parts.append(line)
    head = ("你是严谨的中文公益资讯编辑。请把下面这份" + kname + "的要点浓缩成一段 120～160 字的「本期速览」，"
            "3～4 句连贯的话，点出最重要的政策或事件与趋势。只输出简体中文纯文本，"
            "不要标题、不要分点、不要 JSON、不要客套话。\n\n")
    return (head + "\n".join(parts))[:BRIEF_MAX_INPUT]


def _is_chinese(s):
    han = sum(1 for ch in s if "\u4e00" <= ch <= "\u9fff")
    return han >= len(s) * 0.35


def _call_anydoor(prompt, secret, timeout=15):
    url = ANYDOOR_LOCAL.rstrip("/") + "/chat/completions"
    payload = {
        "messages": [
            {"role": "system", "content": "你是严谨的中文公益资讯编辑，只输出简体中文纯文本。"},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": 400,
        "temperature": 0.3,
    }
    for model in BRIEF_MODELS:
        payload["model"] = model
        try:
            req = Request(url, data=json.dumps(payload).encode(), method="POST",
                          headers={"Content-Type": "application/json", "Authorization": "Bearer " + secret})
            with urlopen(req, timeout=timeout) as r:
                d = json.load(r)
            ch = (d.get("choices") or [{}])[0]
            content = ((ch.get("message") or {}).get("content") or "").strip()
            if len(content) >= 30 and _is_chinese(content):
                return content[:400]
        except Exception:
            continue
    return None


def brief_for(report, state):
    """Short LLM digest, or None. Cached per issue (success AND failure) so a broken
    pool never makes us retry 30s for each recipient of the same issue."""
    cache = state.setdefault("briefs", {})
    key = f"{report.get('kind')}:{report.get('key')}"
    if key in cache:
        return cache[key] or None
    text = None
    if llm_enabled() and _anydoor_key():
        try:
            text = _call_anydoor(_brief_prompt(report), _anydoor_key())
        except Exception:
            text = None
    cache[key] = text or ""  # "" marks "tried, unavailable" — no retry for this issue
    if len(cache) > 200:  # keep the state file bounded
        for old in list(cache)[:len(cache) - 200]:
            cache.pop(old, None)
    return text


# --- Brand (Save the Children / 救助儿童会) ----------------------------------
# 品牌红取自标识指南 Pantone 485C；色阶与 apps/web/app/app.css 的
# --color-brand-red-{0,20,54,82,100} 一致。邮件整体以品牌红为基调，
# 日/周/月报只用同一红阶的深浅做区分，不再用绿/蓝/紫三套互不相干的色系。
BRAND_RED = "#da291c"
BRAND_RED_0 = "#ffd9d5"
BRAND_RED_20 = "#f47b71"
BRAND_RED_54 = "#e2493c"
BRAND_RED_82 = "#c62419"
BRAND_RED_100 = "#9a3324"
INK = "#241a18"           # 暖黑（替代旧墨绿 #0f291f）
INK_BG = "#f5f1ef"        # 邮件外底（暖灰）
LINE = "#f2e9e6"          # 分隔线
CARD_BORDER = "#eee4e1"   # 卡片描边
MUTED = "#8a6a63"         # 暖灰说明文字

ROLE_COLORS = {
    "官方": ("#4b5563", "#f7d9d3"),
    "X·官方": ("#4b5563", "#f7d9d3"),
    "媒体": ("#1d4ed8", "#dbeafe"),
    "公众号": ("#b45309", "#fef3c7"),
    "X·KOL": ("#7e22ce", "#f3e8ff"),
}
METRIC_LABELS = {
    "totalEvents": "本期动态",
    "totalStories": "本期动态",
    "candidateCount": "候选条目",
    "sourcesCount": "覆盖信源",
    "firstPartyEvents": "一手信源",
    "reportsCovered": "覆盖日报",
}
# NOTE: "modelsReleased" (模型发布) is an upstream AIHOT leftover — always 0 on a
# charity-news site. Removed from the email metrics strip; the report DTO still
# carries it for the website/API, so no generator change is needed.
METRIC_ORDER = ("totalEvents", "totalStories", "sourcesCount", "firstPartyEvents",
                "candidateCount", "reportsCovered")

# 主色统一品牌红（Pantone 485C）。辅助色取自救助儿童会使命主题色板
# (industry/save-the-children.ts 与 features/topics/palette.ts 同一套)，只用于
# 次要点缀，让日/周/月一眼可分，又不破坏「红色为基调」。
# 每项 = (辅助色, 浅底, 深字)
AUX_DAILY = ("#FB8500", "#fff2e3", "#9a4b00")    # 残障融合 · 橙（今日 / 快讯）
AUX_WEEKLY = ("#3A86FF", "#eaf1ff", "#1d4ed8")   # 儿童教育 · 蓝（本周 / 综述）
AUX_MONTHLY = ("#6A4C93", "#f1ecf8", "#5b3c85")  # 政策倡导 · 紫（本月 / 盘点）

# 三类报告同属品牌红系，靠红阶深浅（正红 / 深红 / 酒红）+ 辅助色 + 范围 pill + 期号区分。
KIND_THEME = {
    "daily":   {"accent": BRAND_RED,     "soft": "#fff1ef", "border": BRAND_RED_0,  "text": BRAND_RED_82,  "pill_bg": BRAND_RED_0,  "link": BRAND_RED_82,
                "aux": AUX_DAILY[0],   "aux_soft": AUX_DAILY[1],   "aux_ink": AUX_DAILY[2]},
    "weekly":  {"accent": BRAND_RED_82,  "soft": "#fff4f1", "border": BRAND_RED_20, "text": BRAND_RED_100, "pill_bg": "#ffe1dc",    "link": BRAND_RED_100,
                "aux": AUX_WEEKLY[0],  "aux_soft": AUX_WEEKLY[1],  "aux_ink": AUX_WEEKLY[2]},
    "monthly": {"accent": BRAND_RED_100, "soft": "#fdf1ee", "border": BRAND_RED_54, "text": "#7d2a1e",     "pill_bg": "#f7d9d3",    "link": BRAND_RED_100,
                "aux": AUX_MONTHLY[0], "aux_soft": AUX_MONTHLY[1], "aux_ink": AUX_MONTHLY[2]},
}
# What each kind covers, surfaced in the masthead and hot-section heading.
PERIOD_SCOPE = {"daily": "今日热点", "weekly": "本周热点", "monthly": "本月热点"}


def _fmt_cn_date(iso):
    """Publish date as Beijing 'M月D日'. Returns None when the value is missing/unparseable."""
    if not iso:
        return None
    try:
        d = datetime.datetime.fromisoformat(iso.replace("Z", "+00:00")) + datetime.timedelta(hours=8)
        return f"{d.month}月{d.day}日"
    except Exception:
        return None



def _link_for(it, base):
    item_id = it.get("itemId")
    return it.get("sourceUrl") or (base.rstrip("/") + "/items/" + item_id if item_id else "")


def _section_label(text, theme, margin_bottom="6px"):
    """Small neutral heading: the colour lives in the square / rule, never in the text.
    Keeps long stretches of body copy readable instead of painting everything red."""
    return ('<div style="font-size:13px;font-weight:700;color:#4b5563;letter-spacing:.06em;margin-bottom:' + margin_bottom + '">'
            '<span style="display:inline-block;width:8px;height:8px;background:' + theme["aux"]
            + ';border-radius:2px;margin-right:7px;vertical-align:middle"></span>'
            + html.escape(text) + '</div>')


# Older published reports still carry the search vendor tag in sourceName. Align
# with the web app's shortSourceName(): hide transport/provider suffixes so the
# reader only sees the actual outlet/subject, never our upstream vendor.
_SOURCE_TAG_RE = re.compile(r"[（(](?:RSS|网页|API|DeepSeek(?:\s*Search)?)[）)]", re.I)


def _clean_source(name):
    return _SOURCE_TAG_RE.sub("", str(name or "")).strip()


def _item_html(it, base, compact=False):
    esc = html.escape
    title = esc(it.get("title") or "")
    url = _link_for(it, base)
    src_name = esc(_clean_source(it.get("sourceName")))
    src_url = it.get("sourceUrl") or ""
    role = it.get("role") or ""
    rc, rb = ROLE_COLORS.get(role, ("#475569", "#eeeae8"))
    size = '14px' if compact else '15px'
    # Headlines stay neutral dark; colour is carried by blocks, rules and buttons.
    if url:
        t = '<a href="' + esc(url) + '" style="color:' + INK + ';text-decoration:none;font-weight:600;font-size:' + size + ';line-height:1.5">' + title + '</a>'
    else:
        t = '<span style="color:' + INK + ';font-weight:600;font-size:' + size + ';line-height:1.5">' + title + '</span>'
    meta = []
    if src_name:
        if src_url:
            meta.append('<a href="' + esc(src_url) + '" style="color:#6b7280;text-decoration:none" target="_blank" rel="noopener">' + src_name + '</a>')
        else:
            meta.append('<span style="color:#6b7280">' + src_name + '</span>')
    if role:
        meta.append('<span style="display:inline-block;background:' + rb + ';color:' + rc + ';font-size:11px;line-height:1;padding:2px 7px;border-radius:999px">' + esc(role) + '</span>')
    # Publish date (correct), only fall back to the collection date when no publish date exists.
    pub = _fmt_cn_date(it.get("publishedAt"))
    disc = _fmt_cn_date(it.get("discoveredAt"))
    if pub:
        meta.append('<span style="color:#9ca3af">' + pub + '</span>')
    elif disc:
        meta.append('<span style="color:#9ca3af">收录 ' + disc + '</span>')
    metah = ""
    if meta:
        metah = '<div style="margin:5px 0 0;font-size:12px;line-height:1.6">' + ' <span style="color:#d8cfcb">·</span> '.join(meta) + '</div>'
    summ = it.get("summary") or ""
    sumh = ""
    if summ and not compact:
        sumh = '<p style="margin:6px 0 0;color:#374151;line-height:1.7;font-size:14px">' + esc(summ) + '</p>'
    pad = '9px 0' if compact else '14px 0'
    return '<div style="padding:' + pad + ';border-bottom:1px solid ' + LINE + '">' + t + metah + sumh + '</div>'


def _hot_html(hot, base, limit=6, scope="近 48 小时", theme=None):
    esc = html.escape
    if not hot:
        return ""
    theme = theme or KIND_THEME["daily"]
    rows = []
    trend_map = {"up": ("↑", BRAND_RED), "down": ("↓", "#16a34a"), "new": ("新", BRAND_RED_100),
                 "flat": ("—", "#6b7280"), "unknown": ("", "#6b7280")}
    for e in hot[:limit]:
        story = e.get("story") or {}
        title = esc(story.get("title") or e.get("title") or "")
        public_id = story.get("publicId") or e.get("storyPublicId") or ""
        rep = e.get("representative") or {}
        url = rep.get("url") or (base.rstrip("/") + "/stories/" + public_id if public_id else "")
        rank = e.get("rank") or ""
        src_count = e.get("sourceCount") or e.get("participantCount") or 0
        arrow, tcol = trend_map.get(e.get("trend") or "", ("", "#6b7280"))
        badges = e.get("badges") or []
        badge_html = "".join('<span style="display:inline-block;background:#fef3c7;color:#b45309;font-size:10px;padding:1px 6px;border-radius:999px;margin-left:4px">' + esc(b) + '</span>' for b in badges[:2])
        trend_html = (' <span style="color:' + tcol + ';font-weight:600">' + arrow + '</span>') if arrow else ""
        meta = '<div style="font-size:12px;color:#6b7280;margin-top:3px">' + str(src_count) + ' 个信源讨论' + trend_html + '</div>'
        title_block = ('<a href="' + esc(url) + '" style="color:' + INK + ';font-weight:600;font-size:15px;text-decoration:none;line-height:1.5">' + title + '</a>') if url else ('<span style="color:' + INK + ';font-weight:600;font-size:15px;line-height:1.5">' + title + '</span>')
        rows.append(
            '<div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid ' + LINE + '">'
            '<div style="flex:0 0 auto;width:26px;height:26px;border-radius:8px;background:' + theme["aux_soft"] + ';color:' + theme["aux_ink"] + ';font-weight:700;font-size:14px;display:flex;align-items:center;justify-content:center">' + str(rank) + '</div>'
            '<div style="flex:1;min-width:0">' + title_block + meta + badge_html + '</div></div>'
        )
    return '<div style="margin:22px 0 0">' + _section_label("热点榜 · " + scope, theme, "4px") + "".join(rows) + '</div>'


def render(report, base, unsubscribe_url="", hot=None, brief=None):
    esc = lambda v: html.escape(str(v or ""))
    kind = report.get("kind", "daily")
    kind_name = {"daily": "日报", "weekly": "周报", "monthly": "月报"}.get(kind, "公益总报")
    theme = KIND_THEME.get(kind, KIND_THEME["daily"])
    scope = PERIOD_SCOPE.get(kind, "")
    lead = report.get("lead") or {}
    headline = lead.get("title") or report.get("title") or ("公益总报 · " + kind_name)
    intro = lead.get("leadParagraph") or report.get("overview") or ""

    # LLM "本期速览" replaces the long lead paragraph when available (it already
    # condenses the lead + every section). Falls back to the site's own lead text.
    brief_html = ""
    if brief:
        brief_html = ('<div style="margin:16px 0 2px;padding:14px 16px;background:' + theme["soft"]
                      + ';border:1px solid ' + theme["border"] + ';border-left:3px solid ' + theme["accent"]
                      + ';border-radius:10px">' + _section_label("本期速览 · AI 浓缩", theme)
                      + '<p style="margin:0;color:#374151;line-height:1.85;font-size:14.5px">' + esc(brief) + '</p></div>')
    lead_html = ""
    if not brief and intro:
        lead_html = '<p style="color:#4b5563;line-height:1.85;margin:0 0 4px;font-size:15px">' + esc(intro[:260]) + ('…' if len(intro) > 260 else '') + '</p>'

    # Gather section/theme blocks. Daily reports use "sections";
    # weekly/monthly reports use "themes" (heading + summary + storyRefs). Both are rendered.
    blocks = []
    for section in report.get("sections") or []:
        items = [i for i in (section.get("items") or []) if i.get("available", True)]
        if items:
            blocks.append((section.get("label") or "", section.get("summary") or "", items))
    # NOTE: do not name this loop variable `theme` — it would shadow the colour theme dict above.
    for topic in report.get("themes") or []:
        refs = topic.get("storyRefs") or []
        if refs:
            blocks.append((topic.get("heading") or "", topic.get("summary") or "", refs))

    # Highlights (daily "今日重点"): the public DTO carries full item objects here.
    highlight_items = [it for it in (report.get("highlights") or []) if isinstance(it, dict)][:3]
    highlights_html = ""
    if highlight_items:
        cards = []
        for it in highlight_items:
            title = esc(it.get("title") or "")
            url = _link_for(it, base)
            src_name = esc(_clean_source(it.get("sourceName")))
            role = it.get("role") or ""
            pub = _fmt_cn_date(it.get("publishedAt"))
            disc = _fmt_cn_date(it.get("discoveredAt"))
            date_piece = pub or (("收录 " + disc) if disc else "")
            parts = [p for p in [src_name, (esc(role) if role else ""), date_piece] if p]
            sub = ('<div style="color:#6b7280;font-size:12px;margin-top:4px">' + " · ".join(parts) + '</div>') if parts else ""
            card = '<a href="' + esc(url) + '" style="display:block;text-decoration:none;background:#fff8f7;border:1px solid #f0e2df;border-left:3px solid ' + theme["accent"] + ';border-radius:10px;padding:12px 14px;margin-bottom:8px">' \
                   '<div style="color:' + INK + ';font-weight:600;font-size:14px;line-height:1.5">' + title + '</div>' + sub + '</a>'
            cards.append(card)
        highlights_html = '<div style="margin:18px 0 4px">' + _section_label("今日重点", theme, "8px") + "".join(cards) + '</div>'

    # Metrics strip ("本期速览").
    metrics = report.get("metrics") or {}
    chips = []
    for key in METRIC_ORDER:
        val = metrics.get(key)
        if val in (None, ""):
            continue
        label = METRIC_LABELS.get(key, key)
        chips.append('<div style="flex:1;min-width:84px;background:' + theme["soft"] + ';border:1px solid ' + theme["border"] + ';border-radius:12px;padding:10px 6px;text-align:center"><div style="font-size:20px;font-weight:700;color:' + INK + ';line-height:1.1">' + esc(val) + '</div><div style="font-size:11px;color:' + MUTED + ';margin-top:2px">' + esc(label) + '</div></div>')
        if len(chips) >= 4:
            break
    metrics_html = ""
    if chips:
        metrics_html = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 4px">' + "".join(chips) + '</div>'

    # Body blocks — condensed: keep the LLM-written section summary (info-dense),
    # show only a few compact headlines, and point the rest to the full report.
    url = report_url(base, report)
    per_section = BRIEF_ITEMS.get(kind, 3)
    total_hidden = 0
    block_parts = []
    for label, summary, items in blocks:
        shown = items[:per_section]
        hidden = len(items) - len(shown)
        total_hidden += hidden
        bitems = "".join(_item_html(it, base, compact=True) for it in shown)
        head = ""
        if label:
            head = '<h2 style="margin:24px 0 4px;font-size:17px;color:' + INK + ';line-height:1.4;border-left:4px solid ' + theme["aux"] + ';padding-left:10px">' + esc(label) + ('<span style="font-size:12px;font-weight:400;color:#9ca3af;margin-left:8px">' + str(len(items)) + ' 条</span>' if len(items) > per_section else '') + '</h2>'
        summ = ""
        if summary:
            summ = '<p style="margin:0 0 6px;color:#4b5563;line-height:1.7;font-size:14px">' + esc(summary) + '</p>'
        more = ""
        if hidden > 0:
            more = '<div style="margin:8px 0 0;font-size:13px"><a href="' + esc(url) + '" style="color:' + theme["aux_ink"] + ';text-decoration:none">本板块另有 ' + str(hidden) + ' 条 → 在完整总报中查看</a></div>'
        block_parts.append(head + summ + bitems + more)
    blocks_html = "".join(block_parts)
    total_items = sum(len(b[2]) for b in blocks)
    overview_note = ""
    if total_items > 0:
        overview_note = ('<div style="margin:26px 0 0;padding:12px 14px;background:#fdf7f5;border:1px dashed #edd9d4;border-left:3px solid ' + theme["aux"] + ';border-radius:10px;'
                         + 'font-size:13px;color:' + MUTED + ';line-height:1.7">本期共 ' + str(total_items) + ' 条动态，邮件精选 '
                         + str(sum(min(len(b[2]), per_section) for b in blocks)) + ' 条；'
                         + '<a href="' + esc(url) + '" style="color:' + theme["aux_ink"] + ';text-decoration:none;font-weight:600">查看全部 →</a></div>')
    hot_html = _hot_html(hot, base, scope=scope or "近 48 小时", theme=theme)

    # Flashes (daily overflow) as a light "更多速递" list.
    flashes = report.get("flashes") or []
    flashes_html = ""
    if flashes:
        fl = []
        for f in flashes[:12]:
            ft = esc(f.get("title") or "")
            furl = f.get("url") or ""
            fl.append('<li style="margin:0 0 6px;color:#374151;font-size:13px;line-height:1.6">' + ('<a href="' + esc(furl) + '" style="color:' + INK + ';text-decoration:none">' + ft + '</a>' if furl else ft) + '</li>')
        flashes_html = '<div style="margin:22px 0 0">' + _section_label("更多速递", theme) + '<ul style="padding-left:18px;margin:0">' + "".join(fl) + '</ul></div>'

    preheader = esc(brief or intro or headline)[:140]
    unsub = ""
    if unsubscribe_url:
        unsub = '<br><a href="' + esc(unsubscribe_url) + '" style="color:#4b5563">退订邮件</a>'

    body = (
        '<!doctype html><html lang="zh-CN"><body style="margin:0;background:' + INK_BG + ';color:' + INK + ';'
        'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'Microsoft YaHei\',sans-serif">'
        '<div style="display:none;max-height:0;overflow:hidden">' + preheader + '</div>'
        '<main style="max-width:660px;margin:0 auto;padding:26px 16px">'
        '<div style="background:#fff;border:1px solid ' + CARD_BORDER + ';border-top:5px solid ' + theme["accent"]
        + ';border-radius:18px;padding:30px 28px;box-shadow:0 1px 3px rgba(154,51,36,.05)">'
        # Brand-red rule (dominant) + a short auxiliary-colour segment (the type cue).
        + '<div style="margin:0 0 20px;font-size:0">'
        + '<span style="display:inline-block;width:36px;height:4px;background:' + BRAND_RED + ';border-radius:2px;vertical-align:top"></span>'
        + '<span style="display:inline-block;width:20px;height:4px;background:' + theme["aux"] + ';border-radius:2px;margin-left:5px;vertical-align:top"></span>'
        + '</div>'
        '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">'
        '<div style="color:' + INK + ';font-size:13px;font-weight:700;letter-spacing:.08em">'
        '<span style="display:inline-block;width:9px;height:9px;background:' + BRAND_RED + ';border-radius:2px;margin-right:7px"></span>'
        'YI-HOT · 公益总报 · ' + kind_name + '</div>'
        + '<div style="font-size:11px;color:' + theme["aux_ink"] + ';background:' + theme["aux_soft"] + ';padding:3px 9px;border-radius:999px;white-space:nowrap">' + esc(report.get("key") or "") + '</div>'
        '</div>'
        + ('<div style="margin-top:8px"><span style="display:inline-block;background:' + theme["aux_soft"] + ';color:' + theme["aux_ink"] + ';font-size:12px;font-weight:600;padding:3px 11px;border-radius:999px"><span style="display:inline-block;width:6px;height:6px;background:' + theme["aux"] + ';border-radius:50%;margin-right:6px;vertical-align:middle"></span>' + esc(scope) + '</span></div>' if scope else "")
        + '<h1 style="font-size:25px;line-height:1.35;margin:14px 0 10px;color:' + INK + '">' + esc(headline) + '</h1>'
        + brief_html
        + lead_html
        + metrics_html
        + highlights_html
        + hot_html
        + blocks_html
        + overview_note
        + flashes_html
        + '<p style="margin:24px 0 0"><a href="' + esc(url) + '" style="display:inline-block;background:' + BRAND_RED + ';color:#fff;text-decoration:none;padding:11px 18px;border-radius:999px;font-size:14px">在 Yi-Hot 查看完整总报</a></p>'
        '</div>'
        '<p style="text-align:center;color:#6b7280;font-size:12px;line-height:1.9;margin:16px 0 0">你收到此邮件，是因为该地址已确认订阅 Yi-Hot 公益总报。' + unsub + '</p>'
        '</main></body></html>'
    )
    text = headline + "\n\n" + (brief or intro) + "\n\n" + ("完整总报：" + url + "\n") + (("\n退订：" + unsubscribe_url + "\n") if unsubscribe_url else "")
    return body, text


def render_confirmation(payload):
    url = html.escape(payload["confirmUrl"])
    body = f'''<!doctype html><html><body style="background:{INK_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif"><main style="max-width:620px;margin:30px auto;background:white;border:1px solid {CARD_BORDER};border-top:5px solid {BRAND_RED};border-radius:16px;padding:30px"><div style="color:{INK};font-size:13px;font-weight:700"><span style="display:inline-block;width:9px;height:9px;background:{BRAND_RED};border-radius:2px;margin-right:7px"></span>YI-HOT · 邮件订阅</div><h1 style="font-size:24px;color:{INK}">请确认订阅公益总报</h1><p style="color:#4b5563;line-height:1.8">点击下面的按钮完成确认。未确认的地址不会收到周报或月报；链接 48 小时内有效。</p><p><a href="{url}" style="display:inline-block;background:{BRAND_RED};color:white;text-decoration:none;padding:11px 18px;border-radius:999px">确认订阅</a></p><p style="color:#6b7280;font-size:12px;line-height:1.7">如果不是你提交的邮箱，可以忽略此邮件。</p></main></body></html>'''
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


def deliver_outbox(item, base, hot=None, state=None):
    payload = item["payload"]
    recipient = payload["email"]
    if item["kind"] == "confirmation":
        subject = "请确认订阅 Yi-Hot 公益总报"
        body, text = render_confirmation(payload)
    else:
        report = payload["report"]
        label = {"daily": "日报", "weekly": "周报", "monthly": "月报"}.get(report["kind"], "公益总报")
        subject = "Yi-Hot · " + (report.get("title") or ("公益总报 · " + label + " · " + report["key"]))
        brief = brief_for(report, state if state is not None else {})
        body, text = render(report, base, payload.get("unsubscribeUrl", ""), hot, brief)
    send(subject, body, text, recipient, payload.get("unsubscribeUrl", "") if item["kind"] == "report" else "")


def process_outbox(base, state=None):
    state = state if state is not None else {}
    api("/api/ingest/newsletter/sync", {})
    hot = fetch_hot(base)
    items = api("/api/ingest/newsletter/claim", {"limit": 20}).get("items", [])
    results = []
    for item in items:
        try:
            deliver_outbox(item, base, hot, state)
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
    body, text = render(report, base, "", fetch_hot(base), brief_for(report, state))
    label = {"daily": "日报", "weekly": "周报", "monthly": "月报"}.get(report["kind"], "公益总报")
    subject = ("[测试] " if test else "") + "Yi-Hot · " + (report.get("title") or ("公益总报 · " + label + " · " + report["key"]))
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
    results = [] if args.initialize else process_outbox(base, state)
    save_state(state_path, state)
    print(json.dumps({"results": results, "bounces": bounces}, ensure_ascii=False))


if __name__ == "__main__":
    main()
