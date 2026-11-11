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
import time
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



def durable_manifest(path: Path, manifest: dict) -> None:
    """A successful export must be discoverable after interruption, *before* any deletion."""
    temp = path.with_name(path.name + f".{os.getpid()}.tmp")
    with temp.open("w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=1)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(temp, path)
    directory = os.open(str(path.parent), os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def csv_export(table: str, where: str, order: str, target: Path, cutoff: str) -> dict:
    """Export one *fixed ID batch*; never reuse an archive filename."""
    if target.exists():
        raise FileExistsError(f"拒绝覆盖旧归档：{target}")
    psql(f"COPY (SELECT * FROM {table} WHERE {where} ORDER BY {order}) TO STDOUT WITH (FORMAT csv, HEADER)",
         stream_to=target)
    rows = 0
    with gzip.open(target, "rt", encoding="utf-8", newline="") as fh:
        reader = csv.reader(fh)
        next(reader, None)
        for _ in reader:
            rows += 1
    with target.open("rb") as fh:
        os.fsync(fh.fileno())
    digest = hashlib.sha256()
    with target.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return {
        "table": table, "file": target.name, "rows": rows,
        "bytes": target.stat().st_size, "sha256": digest.hexdigest(),
        "cutoff": cutoff, "exportedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def receipt_signature(ids_sql: str) -> str:
    """Fingerprint ALL parent and child column values, including mutable attempt costs/status."""
    return (
        "md5("
        "coalesce((SELECT string_agg(md5(to_jsonb(r)::text), ',' ORDER BY r.id) "
        f"FROM receipts r WHERE r.id IN ({ids_sql})), '') || ':' || "
        "coalesce((SELECT string_agg(md5(to_jsonb(a)::text), ',' ORDER BY a.receipt_id, a.id) "
        f"FROM receipt_attempts a WHERE a.receipt_id IN ({ids_sql})), '')"
        ")"
    )


def archive_receipts(cutoff: str, out_dir: Path, manifest: dict, run: dict,
                     manifest_path: Path, delete: bool, batch: int) -> int:
    """Archive receipts and ALL attempts by stable receipt IDs. Return 0 or a fail-closed code.

    A recent attempt makes the logical receipt ineligible, regardless of parent creation.
    Before deletion: fsync both CSV files and the manifest; lock parents and their children
    inside a single transaction; compare the stored row fingerprint against the locked rows.
    A newly inserted child, status change, concurrent archiver or interrupted run can only
    reject this batch, never delete evidence absent from the persisted archive.
    """
    if not table_exists("receipts") or not table_exists("receipt_attempts"):
        print("receipts / receipt_attempts 缺失，拒绝不完整归档", file=sys.stderr)
        return 4
    last_id = 0
    while True:
        raw = scalar(
            "SELECT id FROM receipts r "
            f"WHERE id > {last_id} AND created_at < '{cutoff}' "
            "AND NOT EXISTS (SELECT 1 FROM receipt_attempts a "
            f"WHERE a.receipt_id=r.id AND a.started_at >= '{cutoff}') "
            f"ORDER BY id LIMIT {batch}"
        )
        ids = [int(v) for v in raw.splitlines() if v.strip()]
        if not ids:
            return 0
        last_id = ids[-1]
        ids_sql = ",".join(str(i) for i in ids)
        parent_where = f"id IN ({ids_sql})"
        child_where = f"receipt_id IN ({ids_sql})"
        signature = scalar(f"SELECT {receipt_signature(ids_sql)}")
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        prefix = f"receipts-{ids[0]}-{ids[-1]}-{stamp}-{os.getpid()}"
        parent = csv_export("receipts", parent_where, "id", out_dir / f"{prefix}-parents.csv.gz", cutoff)
        child = csv_export("receipt_attempts", child_where, "receipt_id,id", out_dir / f"{prefix}-attempts.csv.gz", cutoff)
        item = {
            "table": "receipts+receipt_attempts", "firstId": ids[0], "lastId": ids[-1],
            "parentRows": len(ids), "attemptRows": child["rows"],
            "fingerprint": signature, "files": [parent, child], "delete": False,
        }
        run["items"].append(item)
        if parent["rows"] != len(ids):
            item["error"] = "parent count changed while exporting"
            durable_manifest(manifest_path, manifest)
            return 3
        # Verify that all CSV child rows belong to this exact stable parent batch.
        with gzip.open(out_dir / child["file"], "rt", encoding="utf-8", newline="") as fh:
            reader = csv.DictReader(fh)
            child_ids = set()
            for row in reader:
                if int(row["receipt_id"]) not in ids or int(row["id"]) in child_ids:
                    item["error"] = "unexpected or duplicate child id"
                    durable_manifest(manifest_path, manifest)
                    return 3
                child_ids.add(int(row["id"]))
        with gzip.open(out_dir / parent["file"], "rt", encoding="utf-8", newline="") as fh:
            actual = [int(row["id"]) for row in csv.DictReader(fh)]
        if actual != ids:
            item["error"] = "parent IDs mismatch"
            durable_manifest(manifest_path, manifest)
            return 3
        # The archive and manifest are now durable; only *then* may deletion begin.
        durable_manifest(manifest_path, manifest)
        if not delete:
            continue
        # Deterministic integration-test barrier, refused outside throwaway databases.
        barrier = os.environ.get("AIHOT_ARCHIVE_TEST_BARRIER")
        if barrier and DB_NAME.endswith(("_ci", "_test")):
            Path(barrier + ".ready").write_text(str(ids[0]), encoding="utf-8")
            deadline = time.monotonic() + 15
            while not Path(barrier + ".continue").exists():
                if time.monotonic() >= deadline:
                    item["error"] = "test barrier timed out (no deletion)"
                    durable_manifest(manifest_path, manifest)
                    return 4
                time.sleep(0.05)
        # SELECT .. FOR UPDATE on parents blocks concurrent FK inserts (KEY SHARE).
        # Lock existing children too, to fence off cost/status changes before checking.
        # Each statement gets a fresh READ COMMITTED snapshot, including in-flight inserts
        # that committed while the parent-lock acquisition was waiting.
        delete_sql = f"""
BEGIN;
SELECT pg_advisory_xact_lock(1278514763);
SELECT id FROM receipts WHERE id IN ({ids_sql}) ORDER BY id FOR UPDATE;
SELECT id FROM receipt_attempts WHERE receipt_id IN ({ids_sql}) ORDER BY id FOR UPDATE;
DO $safe_archive$
DECLARE current_sig text;
DECLARE parent_count bigint;
BEGIN
    SELECT {receipt_signature(ids_sql)} INTO current_sig;
    IF current_sig IS DISTINCT FROM '{signature}' THEN
        RAISE EXCEPTION 'receipt archive snapshot changed; not deleting';
    END IF;
    SELECT count(*) INTO parent_count FROM receipts WHERE id IN ({ids_sql});
    IF parent_count <> {len(ids)} THEN
        RAISE EXCEPTION 'receipt archive parents changed; not deleting';
    END IF;
    IF EXISTS (SELECT 1 FROM receipt_attempts
               WHERE receipt_id IN ({ids_sql}) AND started_at >= '{cutoff}') THEN
        RAISE EXCEPTION 'new attempt since cutoff; not deleting';
    END IF;
    DELETE FROM receipts WHERE id IN ({ids_sql});
    GET DIAGNOSTICS parent_count = ROW_COUNT;
    IF parent_count <> {len(ids)} THEN
        RAISE EXCEPTION 'deleted parent count mismatch';
    END IF;
END
$safe_archive$;
COMMIT;
"""
        try:
            psql(delete_sql)
        except (RuntimeError, subprocess.CalledProcessError) as error:
            item["error"] = "safe SQL transaction rejected or interrupted"
            durable_manifest(manifest_path, manifest)
            print(f"  ✗ 批次 {ids[0]}-{ids[-1]} 已归档但未删除：{str(error)[:350]}", file=sys.stderr)
            return 4
        item["delete"] = True
        item["deleted"] = len(ids)
        durable_manifest(manifest_path, manifest)
        print(f"  ✓ 父回执 {len(ids)} 条 + 明细 {child['rows']} 条已归档，事务删除父行（关联明细级联）")

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

    if args.batch <= 0:
        print("--batch 必须为正数", file=sys.stderr)
        return 2
    wanted = {t for t in (args.table or [])}
    if "receipt_attempts" in wanted:
        # Child attempts have a parent FK and must be archived together. No independent delete.
        wanted.remove("receipt_attempts")
        wanted.add("receipts")
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
    if not args.table or "receipts" in wanted:
        # Never run the legacy receipts DELETE/ctid path: it cascades to unarchived attempts.
        days = args.days if args.days is not None else 180
        if args.before:
            try:
                edge = datetime.strptime(args.before, "%Y-%m-%d").replace(tzinfo=BJT)
            except ValueError:
                print("--before 格式应为 YYYY-MM-DD", file=sys.stderr)
                return 2
            receipt_cutoff = edge.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S+00")
        else:
            receipt_cutoff = (now - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S+00")
        # Register this run before the first batch; every batch fsyncs its own manifest.
        manifest["runs"].append(run)
        code = archive_receipts(receipt_cutoff, out_dir, manifest, run, manifest_path, args.delete, args.batch)
        if code:
            return code
        if "receipts" in wanted: wanted.remove("receipts")
    for table, ts, days, note in plan:
        if table == "receipts":
            continue
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
    if run not in manifest["runs"]:
        manifest["runs"].append(run)
    # 只留最近 200 次运行记录，别让清单自己长大。
    manifest["runs"] = manifest["runs"][-200:]
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), "utf-8")

    print(f"\n合计 {total_rows} 行" + ("" if args.delete else "（演练，未删除；加 --delete 才真删）"))
    print(f"清单：{manifest_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
