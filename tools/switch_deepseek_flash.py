#!/usr/bin/env python3
"""Safely switch a deployed YiHot's DEFAULT DeepSeek model to V4.1 Flash.

No API calls or secret printing. Dry-run by default. Run --apply from the
server where the real .env and Docker Compose files live.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV = ROOT / ".env"
MODEL = "deepseek-flash"
EXTRA = '{"thinking":{"type":"disabled"}}'
MODEL_KEYS = (
    "PREFILTER_MODEL", "SCORE_MODEL", "UNDERSTAND_MODEL", "SUMMARIZE_MODEL",
    "STRUCTURE_MODEL", "GROUP_MODEL", "GROUP_REVIEW_MODEL", "DIGEST_MODEL",
    "REPORT_MODEL", "TRANSLATE_MODEL", "MONITOR_MODEL",
)


def env_values(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in text.splitlines():
        match = re.match(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z_0-9]*)=(.*)$", line)
        if not match:
            continue
        key, value = match.groups()
        if key in values:
            raise ValueError(f"重复的配置键 {key}：请手工核对，不自动覆盖")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        values[key] = value
    return values


def ensure_deepseek(values: dict[str, str]) -> None:
    url = values.get("LLM_BASE_URL", "").rstrip("/")
    if url not in ("https://api.deepseek.com", "https://api.deepseek.com/v1"):
        raise ValueError("LLM_BASE_URL 不是官方 DeepSeek API 地址，拒绝修改其他模型服务")
    key = values.get("LLM_API_KEY", "")
    if not key or key.lower() in ("changeme", "none", "null"):
        raise ValueError("LLM_API_KEY 缺失；没有可复用的原密钥，不修改配置")


def replace_value(text: str, key: str, value: str) -> str:
    expr = re.compile(rf"^(\s*(?:export\s+)?{re.escape(key)}=)[^\r\n]*$", re.M)
    if len(expr.findall(text)) > 1:
        raise ValueError(f"配置存在多个 {key}，拒绝自动修改")
    if expr.search(text):
        return expr.sub(lambda m: m.group(1) + value, text, count=1)
    sep = "" if text.endswith("\n") or not text else "\n"
    return text + sep + key + "=" + value + "\n"


def migrate_env(text: str) -> tuple[str, tuple[str, ...]]:
    values = env_values(text)
    ensure_deepseek(values)
    updated = replace_value(text, "LLM_MODEL", MODEL)
    updated = replace_value(updated, "LLM_EXTRA_JSON", EXTRA)
    # Do not silently replace per-capability model choices, which could be
    # intentional. Admin overrides in the DB have even higher precedence.
    overrides = tuple(k for k in MODEL_KEYS if values.get(k) and values[k] != "default")
    return updated, overrides


def compose_cmd(root: Path) -> list[str]:
    base = root / "docker-compose.yml"
    if not base.is_file():
        raise ValueError(f"部署目录缺少 {base.name}")
    cmd = (["sudo", "-n"] if os.geteuid() != 0 else []) + [
        "docker", "compose", "-f", str(base)
    ]
    proxy = root / "compose.futureme-proxy.yml"
    if proxy.is_file():
        cmd += ["-f", str(proxy)]
    return cmd


def write_private_atomic(path: Path, text: str, original: os.stat_result) -> None:
    fd, tmp = tempfile.mkstemp(prefix=".env.flash-", dir=str(path.parent), text=True)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp, stat.S_IMODE(original.st_mode))
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def run_cmd(cmd: list[str], cwd: Path) -> None:
    # Never emit compose configuration or environment variables to logs.
    subprocess.run(cmd, cwd=str(cwd), stdout=subprocess.DEVNULL,
                   stderr=subprocess.DEVNULL, check=True)


def apply(root: Path, env_file: Path, original: str, updated: str) -> int:
    cmd = compose_cmd(root)
    try:
        run_cmd(cmd + ["config", "--services"], root)
    except (OSError, subprocess.CalledProcessError):
        print("拒绝修改：当前服务器无法验证 Docker Compose 配置/权限。", file=sys.stderr)
        return 2

    backup_dir = root / ".data" / "backups" / "model-switch"
    backup_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = backup_dir / f"env-before-flash-{stamp}.bak"
    if backup.exists():
        print("备份文件已存在，避免覆盖，请重新执行。", file=sys.stderr)
        return 2
    shutil.copy2(env_file, backup)
    os.chmod(backup, 0o600)
    if updated != original:
        write_private_atomic(env_file, updated, env_file.stat())

    restart = cmd + ["up", "-d", "--no-deps", "--force-recreate", "api", "worker"]
    print(f"已备份原配置至 {backup}（包含密钥，切勿上传 GitHub）。")
    try:
        run_cmd(restart, root)
        for service in ("api", "worker"):
            output = subprocess.run(
                cmd + ["exec", "-T", service, "node", "-e",
                       'process.stdout.write(process.env.LLM_MODEL || "")'],
                cwd=str(root), capture_output=True, text=True, check=True,
            )
            if output.stdout.strip() != MODEL:
                raise RuntimeError(f"{service} 未读取到新模型配置")
    except (OSError, subprocess.CalledProcessError, RuntimeError):
        print("重建或验证失败：尝试恢复原配置并重建 API/Worker。", file=sys.stderr)
        try:
            write_private_atomic(env_file, original, env_file.stat())
            run_cmd(restart, root)
        except (OSError, subprocess.CalledProcessError):
            print("自动回滚容器未成功：请根据私有备份人工恢复。", file=sys.stderr)
        return 1
    print("已验证 API 和 Worker 容器：LLM_MODEL=deepseek-flash，非思考模式。")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Switch deployed YiHot default model to DeepSeek V4.1 Flash")
    parser.add_argument("--apply", action="store_true", help="backup real .env, update model, recreate api/worker, verify")
    args = parser.parse_args()
    if not ENV.is_file():
        print(f"找不到 {ENV}，请在腾讯云实际部署目录执行脚本；GitHub 不含真实 .env。", file=sys.stderr)
        return 2
    try:
        before = ENV.read_text(encoding="utf-8")
        after, overrides = migrate_env(before)
    except (OSError, ValueError) as error:
        print(f"未作更改：{error}", file=sys.stderr)
        return 2

    print("目标：LLM_MODEL=deepseek-flash；LLM_EXTRA_JSON 关闭思考；复用原有 LLM_API_KEY。")
    print("现有默认模型：" + (env_values(before).get("LLM_MODEL") or "（未设置）"))
    if overrides:
        print("注意：以下环境变量对单独任务另有模型设置，本脚本保留原值：" + ", ".join(overrides))
    print("注意：数据库后台「模型与评测」的手动覆盖优先级最高，脚本不会更改它们。")
    if not args.apply:
        print("只读检查已完成，尚未改动 .env 或容器。要真正切换，在服务器运行同一脚本并加 --apply。")
        return 0
    return apply(ROOT, ENV, before, after)


if __name__ == "__main__":
    raise SystemExit(main())
