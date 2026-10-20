#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 WeRSS 的登录二维码发到飞书，扫完后自动拉一遍所有公众号。

为什么要这一步：WeRSS 走的是公众号后台的登录会话，有效期固定 4 天，扫码不会延长已有会话，
所以每 3 天左右要扫一次。原来只能人在电脑前，双击 werss-scan.cmd 开隧道点按钮；现在脚本直接
调 WeRSS 自己的接口取二维码图片，先发到飞书，再用手机扫，扫完它自己去拉文章。

用法（在服务器上，root）：
    python3 scan_push.py --force      # 立刻生成并推送（不看剩余时长）
    python3 scan_push.py             # 只在会话快到期时推送（定时器用这个）
    python3 scan_push.py --status    # 只打印剩余时长与各号同步情况，不发消息
    python3 scan_push.py --no-refresh  # 推送后不自动拉文章，只等人扫

退出码：0 成功或无需动作；1 生成/推送失败；2 等扫码超时。
"""
import argparse
import datetime
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

WERSS_API = os.environ.get("WERSS_API", "http://127.0.0.1:18001")
WERSS_ENV = os.environ.get("WERSS_ENV", "/opt/werss/.env")
YIHOT_ENV = os.environ.get("YIHOT_ENV", "/opt/yihot/.env")
CONTAINER = os.environ.get("WERSS_CONTAINER", "yihot-werss-werss-1")
STATE_DIR = os.environ.get("WERSS_PUSH_STATE", "/var/lib/yihot-werss-push")

# 会话 4 天到期。剩不到这个小时数就推一张新的，于是实际节奏约每 3 天一次。
PUSH_BELOW_HOURS = 30.0
# 同一个自然日最多推一次，避免定时器一天里反复打扰。
MIN_GAP_HOURS = 18.0
QR_WAIT_SECONDS = 180
SCAN_WAIT_SECONDS = 600

FEISHU = "https://open.feishu.cn/open-apis"


def log(msg):
    print("[%s] %s" % (datetime.datetime.now().strftime("%H:%M:%S"), msg), flush=True)


def read_env(path):
    values = {}
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                values[key.strip()] = val.strip().strip('"').strip("'")
    except OSError as exc:
        log("读取 %s 失败: %s" % (path, exc))
    return values


def http_json(url, payload=None, token=None, timeout=30, method=None):
    data = None
    headers = {"accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["content-type"] = "application/json"
    if token:
        headers["authorization"] = "Bearer %s" % token
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode("utf-8") or "{}")


def docker_cp(src, dst):
    return subprocess.run(
        ["docker", "cp", "%s:%s" % (CONTAINER, src), dst],
        capture_output=True, text=True, timeout=60)


def docker_exec(args, timeout=60):
    return subprocess.run(["docker", "exec", CONTAINER] + args,
                          capture_output=True, text=True, timeout=timeout)


# ---- 会话剩余时长 ---------------------------------------------------------------------------

def licence_info():
    """从 /app/data/wx.lic 取会话到期时间；取不到返回 (None, None)。"""
    tmp = "/tmp/werss-wx.lic"
    if docker_cp("/app/data/wx.lic", tmp).returncode != 0:
        return None, None
    try:
        raw = open(tmp, encoding="utf-8", errors="replace").read()
        mtime = datetime.datetime.fromtimestamp(os.path.getmtime(tmp), tz=CN)
        m = re.search(r"^\s*expiry_time\s*:\s*['\"]?([0-9:\- ]+)", raw, re.M)
        if not m:
            return mtime, None
        exp = datetime.datetime.strptime(m.group(1).strip(), "%Y-%m-%d %H:%M:%S")
        return mtime, exp.replace(tzinfo=CN)
    except Exception as exc:  # 解析失败不该阻断推送
        log("wx.lic 解析失败: %s" % exc)
        return None, None
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass


def hours_left():
    _, exp = licence_info()
    if not exp:
        return None
    return (exp - datetime.datetime.now(tz=CN)).total_seconds() / 3600.0


def account_state():
    """每个号最后同步时间与最新文章日期，只读 sqlite。"""
    script = (
        "import sqlite3,datetime,sys\n"
        "con=sqlite3.connect('file:/app/data/we_mp_rss.db?mode=ro',uri=True)\n"
        "for i,n,s,u in con.execute('select id,mp_name,sync_time,update_time from feeds order by mp_name'):\n"
        "    c=con.execute('select count(*),max(publish_time) from articles where mp_id=?',(i,)).fetchone()\n"
        "    ts=s or u\n"
        "    when=datetime.datetime.fromtimestamp(int(ts)).strftime('%m-%d %H:%M') if ts else '从未'\n"
        "    latest=datetime.datetime.fromtimestamp(int(c[1])).strftime('%m-%d %H:%M') if c[1] else '无'\n"
        "    print('%s|%s|%s|%s' % (n, when, c[0], latest))\n")
    res = docker_exec(["python3", "-c", script], timeout=60)
    rows = []
    for line in (res.stdout or "").strip().splitlines():
        parts = line.split("|")
        if len(parts) == 4:
            rows.append({"name": parts[0], "synced": parts[1], "articles": parts[2], "latest": parts[3]})
    return rows


# ---- WeRSS ----------------------------------------------------------------------------------

def werss_token():
    env = read_env(WERSS_ENV)
    user, pwd = env.get("USERNAME"), env.get("PASSWORD")
    if not user or not pwd:
        raise RuntimeError("%s 里没有 USERNAME / PASSWORD" % WERSS_ENV)
    body = urllib.parse.urlencode({"username": user, "password": pwd}).encode("utf-8")
    req = urllib.request.Request(
        WERSS_API + "/api/v1/wx/auth/token", data=body,
        headers={"content-type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=30) as res:
        payload = json.loads(res.read().decode("utf-8"))
    token = payload.get("access_token")
    if not token:
        raise RuntimeError("WeRSS 登录失败: %s" % payload)
    return token


def trigger_qr(token):
    """让 WeRSS 开一个后台浏览器去截公众平台登录页的二维码。"""
    return http_json(WERSS_API + "/api/v1/wx/auth/qr/code", token=token)


def qr_status(token):
    try:
        return http_json(WERSS_API + "/api/v1/wx/auth/qr/status", token=token)
    except Exception:
        return {}


def wait_for_png(started_at, path="/tmp/werss-qr.png"):
    """等容器里出现**这一次**生成的二维码图片。

    只看大小和"年龄"是不够的：WeRSS 在旧图还没被删掉时会直接把旧路径返回来，一次推送就可能
    发出上一轮已经过期的二维码。所以这里要求文件修改时间晚于我们发起请求的时刻。
    """
    deadline = time.time() + QR_WAIT_SECONDS
    while time.time() < deadline:
        res = docker_cp("/app/static/wx_qrcode.png", path)
        if res.returncode == 0:
            mtime = os.path.getmtime(path)
            size = os.path.getsize(path)
            if mtime >= started_at - 5 and size > 364:
                return path
        time.sleep(2)
    return None


def update_all(token):
    """扫完码之后把每个号都拉一遍；接口是异步的，这里只负责发起。"""
    try:
        listing = http_json(WERSS_API + "/api/v1/wx/mps?limit=100&offset=0", token=token)
    except Exception as exc:
        return ["取公众号列表失败: %s" % exc]
    items = (listing.get("data") or {}).get("list") or []
    notes = []
    for mp in items:
        mp_id = mp.get("id")
        if not mp_id:
            continue
        try:
            out = http_json(WERSS_API + "/api/v1/wx/mps/update/%s?start_page=0&end_page=1" % mp_id, token=token)
            if out.get("code") == 0:
                notes.append("%s 已开始拉取" % (mp.get("mp_name") or mp_id))
            else:
                notes.append("%s 未拉取：%s" % (mp.get("mp_name") or mp_id, out.get("message")))
        except Exception as exc:
            notes.append("%s 拉取失败：%s" % (mp.get("mp_name") or mp_id, exc))
    return notes


# ---- 飞书 ------------------------------------------------------------------------------------

def feishu_token(env):
    app_id, secret = env.get("FEISHU_APP_ID"), env.get("FEISHU_APP_SECRET")
    if not app_id or not secret:
        raise RuntimeError("%s 里没有 FEISHU_APP_ID / FEISHU_APP_SECRET" % YIHOT_ENV)
    out = http_json(FEISHU + "/auth/v3/tenant_access_token/internal",
                    {"app_id": app_id, "app_secret": secret})
    if out.get("code") != 0:
        raise RuntimeError("飞书取 token 失败: %s" % out.get("msg"))
    return out["tenant_access_token"]


def feishu_upload(token, path):
    res = subprocess.run([
        "curl", "-s", "-m", "60", "-X", "POST", FEISHU + "/im/v1/images",
        "-H", "Authorization: Bearer %s" % token,
        "-F", "image_type=message",
        "-F", "image=@%s" % path,
    ], capture_output=True, text=True, timeout=90)
    out = json.loads(res.stdout or "{}")
    if out.get("code") != 0 or not out.get("data"):
        raise RuntimeError("飞书上传图片失败: %s" % out.get("msg"))
    return out["data"]["image_key"]


def feishu_send(token, chat_id, msg_type, content):
    out = http_json(FEISHU + "/im/v1/messages?receive_id_type=chat_id",
                    {"receive_id": chat_id, "msg_type": msg_type,
                     "content": json.dumps(content, ensure_ascii=False)}, token=token)
    if out.get("code") != 0:
        raise RuntimeError("飞书发消息失败: %s" % out.get("msg"))


def feishu_text(env, token, chat_id, text):
    feishu_send(token, chat_id, "text", {"text": text})


# ---- 主流程 ----------------------------------------------------------------------------------

CN = datetime.timezone(datetime.timedelta(hours=8))


def state_path(name):
    os.makedirs(STATE_DIR, exist_ok=True)
    return os.path.join(STATE_DIR, name)


def last_push_age_hours():
    try:
        meta = json.load(open(state_path("last-push.json"), encoding="utf-8"))
        return (time.time() - float(meta["at"])) / 3600.0
    except Exception:
        return 1e9


def record_push(reason):
    json.dump({"at": time.time(), "reason": reason}, open(state_path("last-push.json"), "w"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="不必等到快过期，立刻生成并推送")
    ap.add_argument("--status", action="store_true", help="只打印状态，不推送")
    ap.add_argument("--no-refresh", action="store_true", help="推送后不自动拉文章")
    ap.add_argument("--dry-run", action="store_true", help="生成二维码但不发飞书")
    args = ap.parse_args()

    left = hours_left()

    if args.status:
        log("会话剩余: %s" % ("未知" if left is None else "%.1f 小时" % left))
        for row in account_state():
            log("%s  最后同步 %s  文章 %s  最新 %s" % (row["name"], row["synced"], row["articles"], row["latest"]))
        return 0

    if not args.force:
        if left is not None and left > PUSH_BELOW_HOURS:
            log("会话还剩 %.1f 小时（阈值 %.0f），不需要扫码" % (left, PUSH_BELOW_HOURS))
            return 0
        if last_push_age_hours() < MIN_GAP_HOURS:
            log("%.1f 小时前刚推过，跳过" % last_push_age_hours())
            return 0

    env = read_env(YIHOT_ENV)
    chat_id = env.get("FEISHU_ALERT_CHAT_ID") or env.get("FEISHU_INTERNAL_CHAT_ID")
    if not chat_id:
        raise RuntimeError("%s 里没有群 id" % YIHOT_ENV)

    token = werss_token()
    # WeRSS 同一时刻只允许一个扫码会话。上一次没扫（或刚超时）时它还占着锁，
    # 这时 qr/code 只会返回"正在运行"，强推会拿到上一轮的旧图。
    for attempt in range(8):
        started = time.time()
        resp = trigger_qr(token)
        if "正在运行" not in str(resp):
            break
        log("WeRSS 里还有一个扫码会话没释放，等 15 秒（第 %d 次）" % (attempt + 1))
        time.sleep(15)
    log("二维码生成请求已发出: %s" % (resp.get("data") or {}).get("code", ""))

    png = wait_for_png(started)
    if not png:
        log("等不到二维码图片，放弃")
        return 1
    log("二维码已就绪（%d 字节）" % os.path.getsize(png))

    if args.dry_run:
        log("dry-run：图片在 %s" % png)
        return 0

    ftoken = feishu_token(env)
    image_key = feishu_upload(ftoken, png)
    feishu_send(ftoken, chat_id, "image", {"image_key": image_key})
    lines = [
        "WeRSS 公众号会话该续了（%s）" % ("已过期" if (left or 0) < 0 else "还剩 %.0f 小时" % (left or 0)),
        "1. 长按这张图，用「公众号管理员」的微信扫",
        "2. 手机上确认登录，其他不用管",
        "3. 扫完我自动把每个号各拉一遍",
        "二维码只有 2~3 分钟有效，过期了跟我说一声，我再发一张。",
    ]
    text = "\n".join(lines)
    feishu_text(env, ftoken, chat_id, text)
    record_push("force" if args.force else "expiring")
    log("已推送到飞书")

    if args.no_refresh:
        return 0

    deadline = time.time() + SCAN_WAIT_SECONDS
    scanned = False
    while time.time() < deadline:
        status = qr_status(token)
        if (status.get("data") or {}).get("login_status"):
            scanned = True
            break
        time.sleep(5)

    if not scanned:
        feishu_text(env, ftoken, chat_id, "这张二维码没扫，已经失效了。需要时回我一句「重发二维码」。")
        log("等扫码超时")
        return 2

    log("扫码成功，等 WeRSS 写会话…")
    time.sleep(8)
    feishu_text(env, ftoken, chat_id, "扫码成功，会话已续期。开始拉取各公众号…")
    notes = update_all(token)
    time.sleep(45)
    rows = account_state()
    summary = ["拉取结果："] + ["· %s：最后同步 %s，共 %s 篇，最新 %s" % (
        r["name"], r["synced"], r["articles"], r["latest"]) for r in rows]
    summary += ["", "四个号都刷新成功就到此为止；有新文章会在站点下一次采集时进来。"]
    feishu_text(env, ftoken, chat_id, "\n".join(summary))
    log("完成：" + "；".join(notes))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print("失败: %s" % exc, file=sys.stderr)
        sys.exit(1)
