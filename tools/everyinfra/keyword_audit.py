#!/usr/bin/env python3
"""关键词体检：只调 EveryInfra 的 search，看命中构成，**不写库、不入库**。

为什么绕开 YiHot 的采集链路：每入库一条，模型分析要 ¥0.024；而检索本身只要
$0.0056。2026-10-20 实测「养老 公益」「乡村振兴」两个源各入库 10 条、合格 0 条——
白花的不是检索费，是模型费。所以先用检索把关键词筛出来，再决定开哪几个源。

用法：
    sudo python3 keyword_audit.py                      # 用内置候选词
    sudo python3 keyword_audit.py --kw 困境儿童 助学   # 只测指定的词
    sudo python3 keyword_audit.py --limit 5 --gap 2    # 每词取 5 条、间隔 2 秒

输出：每个词的条数、requireMarkers 命中率、标题样本，以及按命中率排序的总表。
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get("EVERYINFRA_BASE_URL", "https://api.everyinfra.com").rstrip("/")

# 与 industry/sources.json 里 xhs-search-charity-project 一致——那是三个源里
# 唯一证明能出合格条目的（46 条入库 / 16 条合格），照它的口径衡量新词。
REQUIRE = [
    "公益项目", "公益活动", "慈善", "捐赠", "募捐", "基金会", "志愿服务", "义工",
    "乡村振兴", "帮扶", "救助", "助学", "敬老", "月捐", "配捐", "99公益日",
    "困境", "受助", "留守儿童", "孤儿", "资助", "困境儿童",
]
DROP = [
    "带货", "好物", "护肤", "减肥", "课程", "训练营", "招生", "招聘", "塔罗",
    "星座", "考研", "备考", "上岸", "私信", "团购", "招募", "接单", "副业",
    "变现", "应援", "粉丝", "生日", "打卡", "抽奖", "同款", "代购", "返图", "开箱",
]

# 双词、场景化优先——「困境儿童 资助」是唯一跑通的模式。
CANDIDATES = [
    "困境儿童 资助", "困境儿童 助学", "留守儿童 帮扶", "留守儿童 公益",
    "事实无人抚养儿童", "孤儿 助学", "残疾儿童 康复 公益", "大病儿童 救助",
    "乡村儿童 阅读", "乡村教师 支持", "免费午餐", "营养改善 计划",
    "女童保护", "儿童安全 教育", "未成年人保护 法", "校园欺凌 干预",
    "先心病 救助", "白血病 儿童 救助", "罕见病 家庭 支持", "尘肺病 救助",
    "乡村医生 培训", "支教 招募", "助学 一对一", "奖学金 申请",
    "困境母亲 帮扶", "空巢老人 关爱", "失独家庭 帮扶", "适老化改造",
    "流浪动物 救助", "环境保护 公益", "救灾 捐赠", "抗震救灾 志愿者",
]


def account(key):
    req = urllib.request.Request(BASE + "/api/v1/account", headers={"authorization": "Bearer " + key})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.loads(res.read().decode("utf-8"))


def search(key, keyword, limit, platform="xiaohongshu", action="search"):
    body = json.dumps({
        "platform": platform,
        "action": action,
        "params": {"keyword": keyword, "limit": limit},
    }).encode("utf-8")
    req = urllib.request.Request(
        BASE + "/api/v1/social",
        data=body,
        headers={"authorization": "Bearer " + key, "content-type": "application/json", "accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=90) as res:
        return json.loads(res.read().decode("utf-8"))


def text_of(item):
    # 各平台字段不同：小红书 title+text，微博 text/content，B站 title+description。
    parts = [str(item.get(k) or "") for k in ("title", "summary", "desc", "content", "note", "text", "description")]
    return " ".join(p for p in parts if p)


def judge(item):
    """照 ingestNoiseFilter 的口径判一条：命中 require 且不碰 drop。"""
    text = text_of(item)
    if not text.strip():
        return False
    if any(d in text for d in DROP):
        return False
    return any(r in text for r in REQUIRE)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kw", nargs="*", help="只测这些词；不给则用内置候选")
    ap.add_argument("--limit", type=int, default=10, help="每词取回的条数")
    ap.add_argument("--gap", type=float, default=3.0, help="两次调用之间的间隔（秒）")
    ap.add_argument("--max-calls", type=int, default=0, help="最多调几次，0 不限")
    ap.add_argument("--platform", default="xiaohongshu", help="平台名，见 /api/v1/social/catalog")
    ap.add_argument("--action", default="search", help="能力名，多数平台是 search")
    ap.add_argument("--out", default="/tmp/keyword-audit.json")
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

    try:
        bal = account(key)["balance"]
        print("余额 $%.6f（付费 $%.2f / 赠送 $%.6f）" % (bal["total_usd"], bal["paid_usd"], bal["bonus_usd"]))
        for e in bal.get("bonus_expiring") or []:
            print("赠送到期 %s" % e["expires_at"])
        print("单价 $0.005556 → 还能调 %.0f 次\n" % (bal["total_usd"] / 0.005556))
    except Exception as exc:
        print("查余额失败：%s\n" % exc)

    words = args.kw or CANDIDATES
    rows, spent, fails = [], 0.0, 0
    for i, kw in enumerate(words):
        if args.max_calls and i >= args.max_calls:
            print("到达 --max-calls，停")
            break
        try:
            out = search(key, kw, args.limit, args.platform, args.action)
        except urllib.error.HTTPError as exc:
            print("%-22s HTTP %s: %s" % (kw, exc.code, exc.read()[:120].decode("utf-8", "ignore")))
            fails += 1
            time.sleep(args.gap)
            continue
        except Exception as exc:
            print("%-22s 失败: %s" % (kw, exc))
            fails += 1
            time.sleep(args.gap)
            continue

        charged = (out.get("billing") or {}).get("charged_usd")
        if isinstance(charged, (int, float)):
            spent += charged
        items = out.get("results") or []
        if isinstance(items, dict):
            items = items.get("list") or items.get("items") or []
        hits = sum(1 for it in items if judge(it))
        rows.append({
            "keyword": kw,
            "returned": len(items),
            "hits": hits,
            "rate": round(hits / len(items), 3) if items else 0.0,
            "samples": [text_of(it)[:48] for it in items if judge(it)][:3],
        })
        print("%-22s 返回 %2d 条，命中 %2d 条（%3.0f%%）" % (kw, len(items), hits, 100 * rows[-1]["rate"]))
        for s in rows[-1]["samples"]:
            print("      · %s" % s)
        time.sleep(args.gap)

    rows.sort(key=lambda r: (-r["rate"], -r["hits"]))
    json.dump(rows, open(args.out, "w"), ensure_ascii=False, indent=1)
    print("\n实付 $%.6f，失败 %d 次，结果写入 %s" % (spent, fails, args.out))
    print("\n=== 按命中率排序 ===")
    for r in rows:
        bar = "█" * int(r["rate"] * 20)
        print("%-22s %3.0f%%  (%d/%d) %s" % (r["keyword"], 100 * r["rate"], r["hits"], r["returned"], bar))


if __name__ == "__main__":
    main()
