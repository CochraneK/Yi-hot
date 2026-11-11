#!/usr/bin/env python3
"""把库里过期的运维日志导出成 gzip 再从 Postgres 删掉。

为什么要有这个脚本：`receipts` / `receipt_attempts` 存的是每次模型请求的完整
request/response，`article_revisions` 存的是每次改稿的全文。这些是排障用的流水，
不是站点内容——但代码里没有任何保留期，从上线那天起只增不减。按 11 月的增速
（约 30 MB/天，一年 11 GB）跑下去，50 GB 的盘两年就见底，而且是静默见底。

策略分两档，不是"一刀切清空"：

  · 内容资产（articles / publications / analyses / reports）**一行都不删**。
    页面、sitemap、旧报告都靠它们，删了就是断链。
  · 运维流水（receipts / receipt_attempts / fetch_runs / article_revisions /
    hot_rankings）按保留期滚动删除，删之前先落盘并校验。

导出用 `COPY (SELECT ...) TO STDOUT WITH CSV HEADER`，由宿主 gzip 落盘，不落
中间临时文件；一份文件对应一张表一段连续时间，文件名里带首末行的时间戳，
清单 manifest.json 记行数与 sha256，方便事后核对"本地这份到底是不是全的"。

默认只演练（--dry-run），真删要显式 --delete。删除按主键分批，每批 5000 行，
避免一个长事务把表锁住把 worker 拖死。

只在宿主跑（容器内有 psql，宿主没有）：

    sudo python3 /opt/yihot/scripts/archive-db.py                 # 演练
    sudo python3 /opt/yihot/scripts/archive-db.py --delete        # 导出并删除
    sudo python3 /opt/yihot/scripts/archive-db.py --table receipts --days 90
    sudo python3 /opt/yihot/scripts/archive-db.py --before 2026-11-01 --delete
        # 归档并删除北京时间 11-01 之前的全部流水（按自然月切）
"""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

DB_CONTAINER = os.environ.get("AIHOT_DB_CONTAINER", "aihot-db-1")
DB_USER = os.environ.get("AIHOT_DB_USER", "aihot")
DB_NAME = os.environ.get("AIHOT_DB_NAME", "aihot")
DEFAULT_OUT = Path(os.environ.get("AIHOT_ARCHIVE_DIR", "/opt/yihot-archive"))
BJT = timezone(timedelta(hours=8))

# csv 模块默认单字段上限 128 KB。receipts 的 request/response 是整段 JSON，
# 实测远超这个值（不放开会直接 _csv.Error: field larger than field limit）。
csv.field_size_limit(1 << 30)

# (表, 时间列, 保留天数, 说明)
# 保留期到期才删：90 天够回看一次事故，180 天够回看一个季度的成本异常。
TABLES = [
    ("receipt_attempts", "started_at", 180, "每次模型调用的回执（含错误与成本）"),
    ("receipts", "created_at", 180, "模型请求的完整 request/response"),
    ("article_revisions", "created_at", 180, "改稿历史全文"),
    ("fetch_runs", "started_at", 90, "采集轮次日志"),
    ("hot_rankings", "computed_at", 365, "热搜快照"),
]


def psql(sql: str, *, stream_to: Path | None = None) -> bytes | None:
    """跑一条 SQL。stream_to 给定时把 stdout 直接写进 gzip 文件。"""
    cmd = ["docker", "exec", "-i", DB_CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-v", "ON_ERROR_STOP=1", "-q", "-tAc", sql]
    if stream_to is None:
        out = subprocess.run(cmd, capture_output=True, check=True)
        return out.stdout
    with gzip.open(stream_to, "wb", compresslevel=6) as fh:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        if proc.returncode != 0:
            raise RuntimeError(f"psql 失败：{proc.stderr.decode('utf-8', 'replace')[:400]}")
        fh.write(proc.stdout)
    return None


def scalar(sql: str) -> str:
    raw = psql(sql)
    return (raw or b"").decode().strip()


def table_exists(name: str) -> bool:
    return scalar(f"SELECT to_regclass('public.{name}') IS NOT NULL") == "t"


def count_before(table: str, ts: str, cutoff: str) -> int:
    return int(scalar(f"SELECT count(*) FROM {table} WHERE {ts} < '{cutoff}'") or 0)


def export(table: str, ts: str, cutoff: str, target: Path) -> dict:
    """导出一张表里 cutoff 之前的全部行。返回清单条目。"""
    if target.exists():
        target.unlink()
    psql(
        f"COPY (SELECT * FROM {table} WHERE {ts} < '{cutoff}' ORDER BY {ts}) "
        f"TO STDOUT WITH (FORMAT csv, HEADER)",
        stream_to=target,
    )
    # gzip 是流式写的，行数要回头数一遍。不能按 \n 切：request/response 是 JSON，
    # 里面的换行被 CSV 引号包住后照样占一行，按行切会多算（实测 56619 行数成 56635）。
    rows = 0
    with gzip.open(target, "rt", encoding="utf-8", newline="") as fh:
        reader = csv.reader(fh)
        next(reader, None)  # 表头
        for _ in reader:
            rows += 1
    digest = hashlib.sha256()
    with target.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return {
        "table": table,
        "file": target.name,
        "rows": rows,
        "bytes": target.stat().st_size,
        "sha256": digest.hexdigest(),
        "cutoff": cutoff,
        "exportedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def delete_old(table: str, ts: str, cutoff: str, batch: int = 5000) -> int:
    """按批删。每批独立事务，避免长时间持锁把 worker 的查询堵住。

    用 ctid 而不是主键：`article_revisions` 的主键是 (article_id, revision) 复合键，
    单取 revision 会把别的文章的同一版次一起删掉。ctid 只认这一行本身，且这些表
    只追加不改写，行不会在两条语句之间移动。
    """
    total = 0
    while True:
        removed = scalar(
            f"WITH gone AS (SELECT ctid FROM {table} WHERE {ts} < '{cutoff}' LIMIT {batch}) "
            f"DELETE FROM {table} WHERE ctid IN (SELECT ctid FROM gone) RETURNING 1"
        )
        got = len([line for line in removed.splitlines() if line.strip() == "1"])
        total += got
        if got < batch:
            return total


def main() -> int:
    ap = argparse.ArgumentParser(description="导出并清理过期运维日志")
    ap.add_argument("--days", type=int, help="覆盖默认保留天数，测试时用")
    ap.add_argument("--before", help="按北京时间日期切：归档并删除 YYYY-MM-DD 00:00 之前的全部行（优先于 --days）")
    ap.add_argument("--table", action="append", help="只处理指定表，可重复")
    ap.add_argument("--out", default=str(DEFAULT_OUT), help="归档输出目录")
    ap.add_argument("--delete", action="store_true", help="导出校验后真的删除")
    ap.add_argument("--batch", type=int, default=5000, help="删除批大小")
    args = ap.parse_args()

    if not shutil.which("docker"):
        print("没有 docker，这个脚本只能在宿主跑", file=sys.stderr)
        return 2

    now = datetime.now(timezone.utc)
    out_dir = Path(args.out) / str(now.year)
    out_dir.mkdir(parents=True, exist_ok=True)

    wanted = {t for t in (args.table or [])}
    plan = [row for row in TABLES if not wanted or row[0] in wanted]
    if wanted - {row[0] for row in plan}:
        print(f"未知表：{sorted(wanted - {row[0] for row in TABLES})}", file=sys.stderr)
        return 2

    manifest_path = out_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text("utf-8")) if manifest_path.exists() else {"runs": []}
    run = {"startedAt": now.isoformat(timespec="seconds"), "delete": args.delete, "items": []}

    print(f"归档目录：{out_dir}")
    print(f"{'表':20}{'保留':>10}{'可删行':>9}  说明")
    total_rows = 0
    for table, ts, days, note in plan:
        if not table_exists(table):
            print(f"{table:20}{'—':>10}{'—':>9}  表不存在，跳过")
            continue
        if args.before:
            # 按北京时间的自然日切：--before 2026-11-01 归档 10 月及更早，
            # 11 月一行不动。cron 里可以写成 --before $(date +%Y-%m-01)。
            try:
                edge = datetime.strptime(args.before, "%Y-%m-%d").replace(tzinfo=BJT)
            except ValueError:
                print(f"--before 格式应为 YYYY-MM-DD：{args.before}", file=sys.stderr)
                return 2
            cutoff = edge.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S+00")
            label = f"<{args.before}"
        else:
            keep_days = args.days if args.days is not None else days
            cutoff = (now - timedelta(days=keep_days)).strftime("%Y-%m-%d %H:%M:%S+00")
            label = f"{keep_days}d"
        pending = count_before(table, ts, cutoff)
        total_rows += pending
        print(f"{table:20}{label:>10}{pending:>9}  {note}")
        if not pending:
            continue

        first = scalar(f"SELECT to_char(min({ts}) AT TIME ZONE 'Asia/Shanghai', 'YYYYMMDD-HH24MI') FROM {table} WHERE {ts} < '{cutoff}'")
        last = scalar(f"SELECT to_char(max({ts}) AT TIME ZONE 'Asia/Shanghai', 'YYYYMMDD-HH24MI') FROM {table} WHERE {ts} < '{cutoff}'")
        target = out_dir / f"{table}-{first}-{last}.csv.gz"
        print(f"  导出 → {target.name}", flush=True)
        item = export(table, ts, cutoff, target)
        item["delete"] = False

        if item["rows"] != pending:
            print(f"  ✗ 行数不符（导出 {item['rows']} / 应导 {pending}），不删", file=sys.stderr)
            run["items"].append(item)
            manifest["runs"].append(run)
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), "utf-8")
            return 3

        if args.delete:
            removed = delete_old(table, ts, cutoff, args.batch)
            # 删完再数一次：剩下的必须等于"原本的减掉导出的"，对不上说明删多了。
            left = int(scalar(f"SELECT count(*) FROM {table} WHERE {ts} < '{cutoff}'") or 0)
            item["deleted"] = removed
            item["delete"] = left == 0
            print(f"  删除 {removed} 行，剩余过期行 {left}")
            if left:
                print(f"  ✗ {table} 还有 {left} 行没删掉", file=sys.stderr)
                return 4
        run["items"].append(item)

    run["finishedAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    manifest["runs"].append(run)
    # 只留最近 200 次运行记录，别让清单自己长大。
    manifest["runs"] = manifest["runs"][-200:]
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), "utf-8")

    print(f"\n合计 {total_rows} 行" + ("" if args.delete else "（演练，未删除；加 --delete 才真删）"))
    print(f"清单：{manifest_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
