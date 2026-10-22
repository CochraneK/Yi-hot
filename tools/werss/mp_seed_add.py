#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把搜到的公众号批量加进 WeRSS，并输出一份 id 映射给 YiHot 建信源。

配合 mp_seed_search.py 用：先搜出候选 JSON，再挑名字批量加。

用法（服务器上，root）：
    python3 mp_seed_add.py --names "中国慈善联合会,中国红十字会" --dry-run
    python3 mp_seed_add.py --names "中国慈善联合会,中国红十字会"
    python3 mp_seed_add.py --names-file /tmp/pick.txt --seeds /tmp/mp-seeds.json --out /tmp/added.json

注意：加号只是建 feed，不会立刻抓文章；抓取要另外触发 update，
且受微信 200013 频控约束（见 docs/WERSS_DEPLOY.md）。
"""
import argparse
import json
import os
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scan_push import werss_token, http_json, WERSS_API  # noqa: E402


def load_seeds(path):
    data = json.load(open(path, encoding="utf-8"))
    return {r["name"]: r for r in data}


def list_mps(token):
    r = http_json(WERSS_API + "/api/v1/wx/mps?limit=100&offset=0", token=token, timeout=60)
    return (r.get("data") or {}).get("list") or []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--names", default="", help="逗号分隔的公众号全名")
    ap.add_argument("--names-file", default="", help="一行一个公众号全名")
    ap.add_argument("--seeds", default="/tmp/mp-seeds.json")
    ap.add_argument("--out", default="/tmp/mp-added.json")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    names = [n.strip() for n in args.names.split(",") if n.strip()]
    if args.names_file:
        names += [l.strip() for l in open(args.names_file, encoding="utf-8") if l.strip()]
    if not names:
        print("没有给 --names 或 --names-file", file=sys.stderr)
        return 1

    seeds = load_seeds(args.seeds)
    missing = [n for n in names if n not in seeds]
    if missing:
        print("这些名字不在候选 JSON 里，先确认拼写：%s" % "、".join(missing), file=sys.stderr)
        return 1

    if args.dry_run:
        for n in names:
            s = seeds[n]
            print("%-26s %s  %s" % (n, s["fakeid"], (s["signature"] or "")[:40]))
        print("\n共 %d 个（dry-run，没有写入）" % len(names))
        return 0

    token = werss_token()
    before = {m["mp_name"] for m in list_mps(token)}
    added = []
    for n in names:
        s = seeds[n]
        if n in before:
            print("%-26s 已存在，跳过" % n)
            continue
        body = {
            "mp_name": n,
            "mp_id": s["fakeid"],
            "avatar": s.get("avatar") or "",
            "mp_cover": s.get("avatar") or "",
            "mp_intro": (s.get("signature") or "")[:200],
        }
        try:
            r = http_json(WERSS_API + "/api/v1/wx/mps", payload=body, token=token, timeout=90)
            ok = r.get("code") == 0
            print("%-26s %s %s" % (n, "已加入" if ok else "失败", "" if ok else r.get("message")))
        except Exception as exc:
            ok = False
            print("%-26s 失败 %s" % (n, exc))
        if ok:
            added.append(n)

    after = {m["mp_name"]: m["id"] for m in list_mps(token)}
    rows = []
    for n in names:
        if n in after:
            rows.append({"name": n, "feed_id": after[n],
                         "rss": "http://werss:8001/feed/%s.rss?limit=30" % after[n],
                         "fakeid": seeds[n]["fakeid"]})
    json.dump(rows, open(args.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("\n本次新增 %d 个；清单写入 %s" % (len(added), args.out))
    for r in rows:
        print("  %-26s %s" % (r["name"], r["feed_id"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
