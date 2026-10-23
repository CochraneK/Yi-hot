#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把信源全名单与失败清单写进 README（标记位之间，可重复生成）。

数据来源：线上 PostgreSQL 实时导出（TSV，`|` 分隔，10 列）：
  id, name, kind, enabled, health, fail_count, sel, pubs, imported_from, last_error

导出命令（在宿主执行）：
  cat > /tmp/q.sql <<'EOF'
  select s.id, s.name, s.kind, s.enabled, s.health, s.fail_count,
         coalesce(p.sel,0), coalesce(p.pubs,0), coalesce(s.imported_from,''),
         left(coalesce(s.last_error,''),60)
  from sources s
  left join (select source_id, count(*) filter (where selected) sel,
                    count(*) pubs from publications group by 1) p
    on p.source_id = s.id
  order by coalesce(p.sel,0) desc, s.id;
  EOF
  cat /tmp/q.sql | sudo docker exec -i aihot-db-1 psql -U aihot -d aihot -t -A > sources-export.tsv

用法：python scripts/export-source-registry.py <sources-export.tsv> [README.md]

口径：只看入池数（publications.selected，LLM 评分 ≥40），不看 found / created。
失败清单为人工维护的 curated 数据，依据 docs/SOURCE_COVERAGE.md §3、
docs/SOURCE_M1_LIVE_PROBE_2026-10-08.md、docs/SOURCE_EXPANSION_2026-10-21.md。
"""
import io
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

TZ = timezone(timedelta(hours=8))
SEED_JSON = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "industry", "sources.json")


def count_seed():
    """industry/sources.json 里的 seed 条数（JSON 只认数组或 {"sources": [...]} 两种写法）。"""
    with io.open(SEED_JSON, encoding="utf-8") as f:
        doc = json.load(f)
    arr = doc if isinstance(doc, list) else doc.get("sources", [])
    return len(arr)
MARK_START = "<!-- SOURCE-REGISTRY:START -->"
MARK_END = "<!-- SOURCE-REGISTRY:END -->"

KIND_ORDER = ["search", "web_list", "rss", "json_list", "external"]
KIND_LABEL = {
    "search": "搜索源（DeepSeek Search）",
    "web_list": "网页列表源",
    "rss": "RSS 源",
    "json_list": "JSON / API 列表源",
    "external": "外部系统源",
}

# 尝试过但失败 / 未接 / 否决的记录（curated，依据见模块 docstring）
FAILED = [
    ("国家卫健委数据 API", "数据接口", "未接", "HTTP 412 拒接", "只接新闻栏；改以 `search-mohw` 搜索源补齐"),
    ("公安部数据 API", "数据接口", "未接", "HTTP 521 拒接", "只接新闻栏；改以 `search-mps` 搜索源补齐"),
    ("农业农村部候选列表", "网页", "未接", "核查时只返回 1 条 2026-01 旧内容", "暂不启用，等其更新"),
    ("国家卫健委妇幼健康页", "网页", "未接", "生产网络触发反爬", "暂不启用；优先找官方 RSS / JSON"),
    ("联合国儿童基金会中国·新闻页", "网页", "暂停", "生产网络反爬，403", "`web-unicef-cn-press` 已 paused，待定"),
    ("UNGM（联合国采购）", "网页", "否决", "401 需登录", "格式为招标公告，非新闻；按纪律不接"),
    ("cydf.org.cn（青基会官网）", "网页", "否决", "401 需登录", "按纪律不接"),
    ("腾讯公益", "网页", "否决", "项目众筹平台，不是新闻列表", "格式不对口，非技术问题"),
    ("EU Funding & Tenders", "网页", "否决", "资助机会库 / 公告 API", "提案应走官方订阅，不作新闻采集"),
    ("cepf.org.cn（中华环境保护基金会）", "网页", "暂停", "HTTPS 证书错配：返回 baishan.com 的证书", "已 paused；先 `openssl s_client` 看 CN 再定夺"),
    ("sclf.org（中国宋庆龄基金会）", "网页", "暂停", "HTTPS 证书错配：返回别人域名的证书", "已 paused；同上"),
    ("中国发展简报 `/feed`", "RSS", "地址失效", "404 / 返回 HTML", "改走 `web_list`（`china-development-brief` 已接）"),
    ("公益时报 `/rss.xml`", "RSS", "地址失效", "404 / 返回 HTML", "改走 `web_list`（`gongyi-times` 已接）"),
    ("UNICEF China RSS（M1 探测）", "RSS", "探测被拒", "403（测试出口被拦）", "不由此判为来源失效，不建议绕过"),
    ("聚合热榜（tophub / NewsNow 等）", "热榜", "已证伪", "69% 链接被替换成搜索页，且拿不到发布时间", "不采用"),
    ("Jina Reader（r.jina.ai）", "渲染服务", "不可用", "生产网络 DNS 落到 Facebook 段后超时，与凭证无关", "弃用；改无头 chromium 渲染器（见下）"),
    ("everyinfra 预算归零（14 源）", "采集预算", "停摆", "`budgets.everyinfra.per_day=0`：8 公众号 + 3 微博 + 3 小红书退避", "改回 150 即可复活（截至 2026-10-23 仍未恢复）"),
    ("18 个 `wechat-*` rss 源", "公众号", "停用", "`fail_count=0` 且无 last_error，疑似建源时即关闭", "待查因：是漏接还是主动停用"),
]


def load_rows(path):
    rows = []
    with io.open(path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n").rstrip("\r")
            if not line:
                continue
            # psql 的 \pset 会在结果前后打横幅（"Pager usage is off." / "(N rows)"），
            # 它们没有竖线分隔，被当成数据行就会把源总数算多一个。只接受真正的 10 列记录。
            if line.count("|") < 9:
                continue
            parts = line.split("|")
            while len(parts) < 10:
                parts.append("")
            rows.append({
                "id": parts[0], "name": parts[1] or parts[0], "kind": parts[2],
                "enabled": parts[3] == "t", "sel": int(parts[6] or 0),
                "pubs": int(parts[7] or 0), "err": parts[9],
            })
    return rows


def mark(r):
    if not r["enabled"]:
        return "⛔ 停用"
    if r["err"]:
        return "⚠️ 退避"
    if r["sel"] >= 5:
        return "● 主力"
    if r["sel"] >= 1:
        return "· 少量"
    if r["pubs"] > 0:
        return "△ 零入池"
    return "○ 未产出"


def build_section(rows):
    total = len(rows)
    enabled = sum(1 for r in rows if r["enabled"])
    with_sel = sum(1 for r in rows if r["sel"] > 0)
    core5 = sum(1 for r in rows if r["sel"] >= 5)
    total_sel = sum(r["sel"] for r in rows)
    now = datetime.now(TZ).strftime("%Y-%m-%d %H:%M")

    L = []
    L.append(MARK_START)
    L.append("")
    L.append("## 🗂️ 信源全名单")
    L.append("")
    L.append("> 数据时间：%s（北京时间）· 由 `scripts/export-source-registry.py` 从线上 PostgreSQL 实时生成；" % now)
    L.append("> **唯一口径是入池数**（`publications.selected`，LLM 评分 ≥40），不看 found / created / 解析条数——技术接通 ≠ 内容对口。")
    probe = sum(1 for r in rows if r["id"].startswith("web-probe-"))
    L.append("> 这是**快照**：生产信源以数据库运行时配置为准（含 %d 个只在数据库的 `web-probe-*` 探测源），重新生成方法见脚本头部注释。" % probe)
    L.append("")
    L.append("| 指标 | 数值 |")
    L.append("| :--- | :--- |")
    # seed 数从 industry/sources.json 实算：写死会随每次加源立刻失真（曾写 133，实际已 134）。
    seed = count_seed()
    L.append("| 源总数 | %d（`sources.json` seed %d + 仅数据库 %d） |" % (total, seed, total - seed))
    L.append("| 启用 / 停用 | %d / %d |" % (enabled, total - enabled))
    L.append("| 有入池 / 主力（≥5） | %d / %d |" % (with_sel, core5))
    L.append("| 入池文章总量 | %d |" % total_sel)
    L.append("")
    L.append("| 类型 | 源数 | 启用 | 有入池 | 入池文章 | 占比 |")
    L.append("| :--- | :--- | :--- | :--- | :--- | :--- |")
    for k in KIND_ORDER:
        sub = [r for r in rows if r["kind"] == k]
        if not sub:
            continue
        s = sum(r["sel"] for r in sub)
        L.append("| %s | %d | %d | %d | %d | %.0f%% |" % (
            KIND_LABEL[k], len(sub), sum(1 for r in sub if r["enabled"]),
            sum(1 for r in sub if r["sel"] > 0), s, 100.0 * s / max(total_sel, 1)))
    L.append("")
    L.append("### 全部信源（按类型、按入池降序）")
    L.append("")
    L.append("状态：● 主力（入池 ≥5）· 少量（1–4）· △ 有稿零入池 · ○ 从未产出 · ⚠️ 退避中 · ⛔ 停用；数字为**入池 / 产出**。")
    L.append("")
    for k in KIND_ORDER:
        sub = [r for r in rows if r["kind"] == k]
        if not sub:
            continue
        s = sum(r["sel"] for r in sub)
        L.append("#### %s（%d 个，入池 %d）" % (KIND_LABEL[k], len(sub), s))
        L.append("")
        L.append("| 名称 | ID | 状态 | 入池/产出 |")
        L.append("| :--- | :--- | :--- | :--- |")
        for r in sub:
            L.append("| %s | `%s` | %s | %d/%d |" % (r["name"], r["id"], mark(r), r["sel"], r["pubs"]))
        L.append("")
    L.append("### 尝试过但失败 / 未接 / 否决的信源")
    L.append("")
    L.append("> 与上面名单分开：这些**没有形成可用信源**。已接入但零入池的（评分拒绝）不在这里——它们在上面各表里标 △，按\"留观察一周\"纪律处理。")
    L.append("")
    L.append("| 尝试对象 | 类型 | 结果 | 失败 / 受限原因 | 处置 |")
    L.append("| :--- | :--- | :--- | :--- | :--- |")
    for name, kind, result, why, action in FAILED:
        L.append("| %s | %s | %s | %s | %s |" % (name, kind, result, why, action))
    L.append("")
    L.append("**已修复的历史故障**（曾失败、现已正常，留在表外备查）：邮件源 `collect.py` 被 403（默认 UA 被边缘中间件拦）→ 换浏览器 UA（`55fa518`）；`deepseek-tools` 日预算 40 次烧光 → 调到 800（约 ¥4/天）；9 个 SPA 站点旧架构抓不到 → 无头 chromium 渲染器，7 解锁 / 2 否决。")
    L.append("")
    L.append(MARK_END)
    return "\n".join(L) + "\n"


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    tsv, readme = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else "README.md")
    rows = load_rows(tsv)
    section = build_section(rows)
    text = io.open(readme, encoding="utf-8").read()
    if MARK_START in text:
        text = re.sub(re.escape(MARK_START) + ".*?" + re.escape(MARK_END), section.rstrip("\n"),
                      text, flags=re.S)
    else:
        anchor = "## 🛟 当前状态、反馈与贡献"
        if anchor not in text:
            sys.exit("README 里找不到插入点：%s" % anchor)
        text = text.replace(anchor, section.rstrip("\n") + "\n\n" + anchor, 1)
    with io.open(readme, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print("README updated: %d sources, section %d chars" % (len(rows), len(section)))


if __name__ == "__main__":
    main()
