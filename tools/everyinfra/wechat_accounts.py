#!/usr/bin/env python3
"""按名字批量取公众号的 ghid，供 `wechat_oa.account_articles` 使用。

为什么需要这一步：EveryInfra 的 `account_articles` 只认 ghid（gh_ 开头的原始 ID），
而我们从 WeRSS 或名录里拿到的是公众号名字。搜一次拿到 ghid 之后就能长期复用，
不必每轮都搜。

用法：
    sudo python3 wechat_accounts.py                        # 内置名单
    sudo python3 wechat_accounts.py --name 公益时报 中国红十字会
    sudo python3 wechat_accounts.py --out /tmp/ghids.json

输出：名字 → ghid / 认证状态 / 简介，并落一份 JSON。
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get("EVERYINFRA_BASE_URL", "https://api.everyinfra.com").rstrip("/")

# 起点是 WeRSS 里已有的 18 个号，再加几个行业里公认的机构号。
NAMES = [
    "救助儿童会", "中国儿童少年基金会", "中华儿慈会", "中国红十字会",
    "中国慈善联合会", "联合国儿童基金会", "中国青少年发展基金会",
    "中国扶贫基金会", "公益时报", "中国社会报", "中国社会工作",
    "中国志愿服务联合会", "韩红爱心慈善基金会", "中国残疾人联合会",
]


def call(key, platform, action, params, timeout=90):
    body = json.dumps({"platform": platform, "action": action, "params": params}).encode("utf-8")
    req = urllib.request.Request(
        BASE + "/api/v1/social",
        data=body,
        headers={"authorization": "Bearer " + key, "content-type": "application/json", "accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode("utf-8"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", nargs="*", help="要查的公众号名字；不给则用内置名单")
    ap.add_argument("--gap", type=float, default=2.5)
    ap.add_argument("--out", default="/tmp/wechat-ghids.json")
    args = ap.parse_args()

    key = os.environ.get("EVERYINFRA_API_KEY")
    if not key:
        for path in ("/opt/yihot/.env", "/opt/everyinfra/.env"):
            if not os.path.exists(path):
                continue
            for line in open(path, encoding="utf-8", errors="ignore"):
                if line.startswith("EVERYINFRA_API_KEY="):
                    key = line.strip().split("=", 1)[1].strip('"').strip("'")
    if not key:
        sys.exit("拿不到 EVERYINFRA_API_KEY")

    found, spent = {}, 0.0
    for name in (args.name or NAMES):
        try:
            out = call(key, "wechat_oa", "account_search", {"keyword": name})
        except urllib.error.HTTPError as exc:
            print("%-16s HTTP %s" % (name, exc.code))
            continue
        except Exception as exc:
            print("%-16s 失败 %s" % (name, exc))
            continue
        b = out.get("billing") or {}
        if isinstance(b.get("charged_usd"), (int, float)):
            spent += b["charged_usd"]

        rows = out.get("results") or []
        # 挑认证过、且名字对得上的第一条；verify_flag=1 是微信认证
        pick = None
        for r in rows:
            if not isinstance(r, dict):
                continue
            ghid = (r.get("ghid") or "").strip()
            if not ghid.startswith("gh_"):
                continue  # 搜公众号时偶尔混入视频号（v2_ 开头），跳过
            rname = (r.get("name") or "").replace('<em class="highlight">', "").replace("</em>", "")
            if ghid not in found:
                if pick is None or (r.get("verify_flag") == 1 and pick.get("verify_flag") != 1):
                    pick = {**r, "name": rname}
        if pick:
            found[pick["ghid"]] = {
                "name": pick["name"],
                "verify": pick.get("verify_flag"),
                "alias": pick.get("alias") or "",
                "description": (pick.get("description") or "")[:70],
            }
            print("%-16s → %-30s %s verify=%s" % (name, pick["name"][:30], pick["ghid"], pick.get("verify_flag")))
        else:
            print("%-16s 没找到可用的 gh_ 号" % name)
        time.sleep(args.gap)

    json.dump(found, open(args.out, "w"), ensure_ascii=False, indent=1)
    print("\n实付 $%.6f，拿到 %d 个号 → %s" % (spent, len(found), args.out))


if __name__ == "__main__":
    main()
