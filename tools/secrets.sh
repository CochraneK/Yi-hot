#!/usr/bin/env bash
# Yi-Hot 凭据归档：加密 / 解密
#
# 用途：让「换设备」只需要带一样东西 —— 一个口令。
#   secrets/credentials.env.enc  密文（进 git，可安全公开）
#   secrets/credentials.env      明文（.gitignore 白名单外，永不提交）
#
# 用法：
#   bash tools/secrets.sh encrypt [明文路径]     # 默认 secrets/credentials.env
#   bash tools/secrets.sh decrypt [输出路径]     # 默认 secrets/credentials.env
#
# 口令由 openssl 交互式询问（不回显、不进 shell history、不落盘）。
# ⚠️ 口令丢了 = 密文报废 = 只能回服务器上手工重取凭据。请存进密码管理器。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENC="$REPO_ROOT/secrets/credentials.env.enc"
DEFAULT_PLAIN="$REPO_ROOT/secrets/credentials.env"

# AES-256-CBC + PBKDF2(300k) + salt。参数写死在这里，改了两边必须一致。
OPENSSL_COMMON=(-aes-256-cbc -pbkdf2 -iter 300000)

usage() {
  echo "用法: bash tools/secrets.sh {encrypt|decrypt} [文件路径]" >&2
  echo "  encrypt [明文]  默认 secrets/credentials.env  ->  secrets/credentials.env.enc" >&2
  echo "  decrypt [输出]  默认 secrets/credentials.env.enc  ->  secrets/credentials.env" >&2
  exit 2
}

[ $# -ge 1 ] || usage
cmd="$1"
shift

case "$cmd" in
  encrypt)
    src="${1:-$DEFAULT_PLAIN}"
    [ -f "$src" ] || { echo "ERROR: 找不到明文凭据 $src" >&2; exit 1; }
    mkdir -p "$(dirname "$ENC")"
    umask 077
    openssl enc "${OPENSSL_COMMON[@]}" -salt -in "$src" -out "$ENC"
    [ -s "$ENC" ] || { echo "ERROR: 加密产物为空，失败" >&2; exit 1; }
    echo "OK  已加密 -> $ENC  ($(wc -c < "$ENC") 字节)"
    echo "    明文仍在 $src（已被 .gitignore 挡住，不会提交）"
    echo "    凭据有改动后，重跑本命令覆盖密文即可。"
    ;;
  decrypt)
    dst="${1:-$DEFAULT_PLAIN}"
    [ -f "$ENC" ] || { echo "ERROR: 找不到密文 $ENC" >&2; exit 1; }
    mkdir -p "$(dirname "$dst")"
    umask 077
    openssl enc -d "${OPENSSL_COMMON[@]}" -in "$ENC" -out "$dst"
    chmod 600 "$dst" 2>/dev/null || true
    echo "OK  已解密 -> $dst  ($(wc -l < "$dst") 行)"
    echo "    换设备后按此还原，再把里面的键值填进新机 .env / 脚本环境变量。"
    ;;
  *)
    usage
    ;;
esac
