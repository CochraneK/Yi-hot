#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""WeRSS 健康快照：采集模式、凭据寿命、每个公众号最后同步时间与最新文章日期。

用法（在 WeRSS 容器内执行，data 目录默认 /app/data）：
    python3 werss_status.py [/app/data]

只读，不打印任何 cookie / token 内容。退出码：0=全部新鲜，1=有账号超过阈值，2=读不到数据。
"""
import datetime
import json
import os
import re
import sqlite3
import sys

try:
    from zoneinfo import ZoneInfo
    TZ = ZoneInfo("Asia/Shanghai")
except Exception:  # pragma: no cover - 老 Python 兜底
    TZ = datetime.timezone(datetime.timedelta(hours=8))

DATA = sys.argv[1] if len(sys.argv) > 1 else "/app/data"
STALE_DAYS = 4.0
now = datetime.datetime.now(TZ)

# 在容器里跑时，/app 才是应用根；脚本自身在 /tmp，需要手动补 sys.path 和 cwd
if os.path.isdir("/app") and DATA.startswith("/app"):
    sys.path.insert(0, "/app")
    os.chdir("/app")


def ts2dt(ts):
    return datetime.datetime.fromtimestamp(int(ts), TZ)


def human(ts):
    if not ts:
        return "从未同步"
    return ts2dt(ts).strftime("%Y-%m-%d %H:%M")


def days(ts):
    if not ts:
        return 999.0
    return (now - ts2dt(ts)).total_seconds() / 86400.0


def section(title):
    print("\n== %s ==" % title)


def yaml_block(text, key):
    """取 YAML 里某个顶层 key 的整个块（按缩进判断结束）。"""
    lines = text.splitlines()
    out, inside = [], False
    for ln in lines:
        if re.match(r"^%s\s*:" % re.escape(key), ln):
            inside = True
            out.append(ln)
            continue
        if inside:
            if ln.strip() and not ln.startswith((" ", "\t")):
                break
            out.append(ln)
    return "\n".join(out)


def yaml_scalar(block_text, key):
    m = re.search(r"^\s*-?\s*%s\s*:\s*(.+?)\s*$" % re.escape(key), block_text, re.M)
    if not m:
        return None
    val = m.group(1).strip().strip('"').strip("'")
    return val or None


def resolve_env(val):
    """把 ${VAR:-default} 这类占位符换成实际生效值。"""
    m = re.match(r"^\$\{([A-Za-z0-9_.]+)(?::-([^}]*))?\}$", val or "")
    if not m:
        return val
    return os.environ.get(m.group(1)) or (m.group(2) or "")


section("采集模式")
model = None
for cfg_name in ("/app/config.yaml", os.path.join(DATA, "config.yaml")):
    if os.path.exists(cfg_name):
        try:
            raw_cfg = open(cfg_name, encoding="utf-8", errors="replace").read()
            gb = yaml_block(raw_cfg, "gather")
            model = yaml_scalar(gb, "model") if gb else yaml_scalar(raw_cfg, "model")
            print("配置文件:", cfg_name)
            break
        except Exception as exc:
            print("配置读取失败:", exc)
print("gather.model =", resolve_env(model) or "web（默认）")

section("凭据")
lic_path = os.path.join(DATA, "wx.lic")
if os.path.exists(lic_path):
    mtime = datetime.datetime.fromtimestamp(os.path.getmtime(lic_path), TZ)
    print("wx.lic 修改时间:", mtime.strftime("%Y-%m-%d %H:%M"))
    try:
        # wx.lic 是 WeRSS 的 YAML 配置；容器里没有 PyYAML，这里只解析需要的两个键
        raw = open(lic_path, encoding="utf-8", errors="replace").read()
        td = yaml_block(raw, "token_data")
        exp = yaml_scalar(td, "expiry_time") if td else None
        print("公众平台会话到期:", exp or "未知")
        if exp:
            try:
                exp_dt = datetime.datetime.strptime(exp, "%Y-%m-%d %H:%M:%S").replace(tzinfo=TZ)
                left = (exp_dt - now).total_seconds() / 3600.0
                print("剩余: %.1f 小时%s" % (left, "（已过期）" if left < 0 else ""))
            except Exception:
                pass
        wd_block = yaml_block(raw, "weread_data")
        cookies = re.findall(r"^\s*-?\s*cookie\s*:\s*(.+?)\s*$", wd_block, re.M) if wd_block else []
        cookies = [c.strip().strip('"').strip("'") for c in cookies]
        print("微信读书账号: %d 个" % len(cookies))
        for i, cookie in enumerate(cookies, 1):
            print("  #%d cookie 长度 %d" % (i, len(cookie)))
    except Exception as exc:
        print("wx.lic 解析失败:", exc)
else:
    print("wx.lic 不存在:", lic_path)

section("公众号同步状态")
db_path = os.path.join(DATA, "we_mp_rss.db")
if not os.path.exists(db_path):
    print("找不到数据库:", db_path)
    sys.exit(2)
con = sqlite3.connect("file:%s?mode=ro" % db_path, uri=True)
stale = 0
rows = list(con.execute(
    "select id, mp_name, sync_time, update_time, updated_at from feeds order by mp_name"))
for mp_id, name, sync_time, update_time, updated_at in rows:
    last = sync_time or update_time
    cnt = con.execute("select count(*), max(publish_time) from articles where mp_id=?", (mp_id,)).fetchone()
    latest = cnt[1]
    d = days(last)
    if d > STALE_DAYS:
        stale += 1
    print("%s（%s）" % (name, mp_id))
    print("  最后同步: %s（%.1f 天前）  updated_at=%s" % (human(last), d, updated_at))
    print("  文章数: %s  最新文章: %s" % (cnt[0], human(latest) if latest else "无"))
print("\n阈值 %.0f 天：%d/%d 个账号需要扫码或排查" % (STALE_DAYS, stale, len(rows)))
sys.exit(0 if stale == 0 else 1)
