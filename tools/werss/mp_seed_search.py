#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""用一批关键词搜公众号，去重后输出候选清单（JSON + 人读表）。

WeRSS 的 /api/v1/wx/mps/search/{kw} 走的是公众号后台的 searchbiz 接口，
和文章列表接口不是同一条链路——2026-10-20 实测列表接口被 200013 频控时，搜索仍可用。

用法（服务器上，root）：
    python3 mp_seed_search.py                 # 默认关键词
    python3 mp_seed_search.py --kw 儿童 公益  # 自定义
    python3 mp_seed_search.py --limit 20 --out /tmp/seeds.json
"""
import argparse
import json
import os
import sys
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scan_push import werss_token, http_json, WERSS_API  # noqa: E402

DEFAULT_KW = [
    "儿童", "困境儿童", "留守儿童", "儿童保护", "儿童福利", "未成年人",
    "青少年", "乡村教育", "助学", "教育公平",
    "公益", "慈善", "基金会", "社会工作", "志愿服务", "救灾",
]


def search(token, kw, limit=10):
    q = urllib.parse.quote(kw)
    r = http_json(WERSS_API + "/api/v1/wx/mps/search/%s?limit=%d&offset=0" % (q, limit),
                  token=token, timeout=90)
    return (r.get("data") or {}).get("list") or []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kw", nargs="*", default=DEFAULT_KW)
    ap.add_argument("--limit", type=int, default=10)
    ap.add_argument("--gap", type=float, default=4.0)
    ap.add_argument("--out", default="/tmp/mp-seeds.json")
    args = ap.parse_args()

    token = werss_token()
    seen = {}
    for i, kw in enumerate(args.kw):
        if i:
            time.sleep(args.gap)
        try:
            lst = search(token, kw, args.limit)
        except Exception as exc:
            print("%-10s 失败: %s" % (kw, exc), flush=True)
            continue
        new = 0
        for x in lst:
            fid = x.get("fakeid")
            if not fid:
                continue
            if fid not in seen:
                seen[fid] = {
                    "fakeid": fid,
                    "name": x.get("nickname"),
                    "alias": x.get("alias"),
                    "signature": (x.get("signature") or "").replace("\r", " ").replace("\n", " "),
                    "verify_status": x.get("verify_status"),
                    "service_type": x.get("service_type"),
                    "hit_kw": kw,
                }
                new += 1
        print("%-10s 返回 %2d 条，新增 %2d" % (kw, len(lst), new), flush=True)

    rows = list(seen.values())
    json.dump(rows, open(args.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    verified = sum(1 for r in rows if r["verify_status"] == 2)
    print("\n去重合计 %d 个号，其中微信认证 %d 个" % (len(rows), verified))
    print("已写入 %s" % args.out)
    for r in rows[:20]:
        print("  [%s] %s | %s" % (r["verify_status"], r["name"], r["signature"][:40]))


if __name__ == "__main__":
    main()
