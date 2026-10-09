# -*- coding: utf-8 -*-
"""把 .workbuddy/memory/ 的 5 个常青分册镜像到 docs/memory/（脱敏后入库）。

用法
----
    python tools/sync_memory.py            # 复制 + 脱敏 + 扫描，写 docs/memory/
    python tools/sync_memory.py --check    # 只扫描（不写文件），有敏感串则非零退出

为什么需要它
------------
`.workbuddy/` 在 `.gitignore` 里 —— 项目记忆**进不了仓库**，于是换机器 / 换 AI
接手时只剩代码、没有经验。`docs/memory/` 是它的**脱敏镜像**（给接手者读）。
两边会漂移，所以用这个脚本做**单向同步**：

    .workbuddy/memory/*.md   ──(脱敏)──▶   docs/memory/*.md

它是「先替换、再扫描」的双保险：即便某个分册里误写了凭据，也会被替换成占位符，
最后再全量扫一遍；**只要还扫到敏感串就非零退出、不落盘**——宁可不同步也不入库。
"""
import argparse
import os
import re
import sys

SRC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       '.workbuddy', 'memory')
DST_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       'docs', 'memory')

VOLUMES = ('MEMORY.md', 'OPS.md', 'CONTENT.md', 'USAGE.md', 'FutureMe.md')

# 加在每个镜像文件开头的横幅，提醒读者「这是生成物、别直接改」。
BANNER = (
    "<!-- 本文件由 tools/sync_memory.py 从 .workbuddy/memory/{name} 单向生成，请勿直接编辑。 -->\n"
    "<!-- 源目录 .workbuddy/ 在 .gitignore 里，所以这里是为「换机器 / 换 AI 接手」准备的脱敏镜像。 -->\n"
    "<!-- 要改：改 .workbuddy/memory/{name} → 重跑 `python tools/sync_memory.py`。 -->\n"
    "\n"
)

# 脱敏规则：(正则, 替换)。按顺序应用，先具体后宽泛。
#
# 关键：取值必须长得像「密钥」（连续 8 位以上、不含空白/`$`/`<`/`>`）。
# 否则会把 `SSH_PASS="$(grep -m1 '^SSH_PASS=' …)"` 这种**命令替换**、
# 以及 `<见 secrets/credentials.env>` 这种**占位符**当成密钥改坏。
_SECRET_VAL = r"[^'\"\s$<>]{8,}"
REDACTIONS = (
    (re.compile(r"(SSH_PASS\s*=\s*['\"])(" + _SECRET_VAL + r")(['\"])"),
     r"\1<redacted: secrets/credentials.env 的 SSH_PASS>\3"),
    (re.compile(r"(ADMIN_PASSWORD\s*=\s*['\"]?)(" + _SECRET_VAL + r")(['\"]?)"),
     r"\1<redacted: secrets/credentials.env>\3"),
    (re.compile(r"\b(?:gho|ghp|ghu|ghs)_[A-Za-z0-9]{20,}\b"), "<github-token-redacted>"),
    (re.compile(r"\bsk-[A-Za-z0-9]{16,}\b"), "<llm-key-redacted>"),
)

# 扫描规则：与上面同源，外加几条「形状像密钥」的兜底。
SCAN = (
    re.compile(r"\bSSH_PASS\s*=\s*['\"]" + _SECRET_VAL + r"['\"]"),
    re.compile(r"\bADMIN_PASSWORD\s*=\s*['\"]?" + _SECRET_VAL),
    re.compile(r"\b(?:gho|ghp|ghu|ghs)_[A-Za-z0-9]{20,}\b"),
    re.compile(r"\bsk-[A-Za-z0-9]{16,}\b"),
    re.compile(r"\bcli_[a-zA-Z0-9]{16,}\b"),
)


def redact(text: str) -> str:
    for rx, rep in REDACTIONS:
        text = rx.sub(rep, text)
    return text


def scan(text: str, where: str):
    hits = []
    for rx in SCAN:
        for m in rx.finditer(text):
            hits.append('%s: %r…' % (where, m.group(0)[:24]))
    return hits


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true',
                    help='只扫描 docs/ 与 .workbuddy/ 两侧，不写任何文件')
    args = ap.parse_args()

    if not os.path.isdir(SRC_DIR):
        print('source not found:', SRC_DIR)
        return 2

    problems, written = [], []
    for name in VOLUMES:
        src = os.path.join(SRC_DIR, name)
        if not os.path.exists(src):
            print('  SKIP (missing):', name)
            continue
        raw = open(src, encoding='utf-8').read()
        clean = redact(raw)

        if args.check:
            problems += scan(raw, '.workbuddy/' + name)
            dst = os.path.join(DST_DIR, name)
            if os.path.exists(dst):
                problems += scan(open(dst, encoding='utf-8').read(), 'docs/memory/' + name)
            continue

        problems += scan(clean, 'docs/memory/' + name)
        os.makedirs(DST_DIR, exist_ok=True)
        with open(os.path.join(DST_DIR, name), 'w', encoding='utf-8', newline='\n') as f:
            f.write(BANNER.format(name=name) + clean)
        written.append(name)
        print('  %-14s %6d B -> %6d B' % (name, len(raw.encode()), len(clean.encode())))

    if problems:
        print('\n!! 扫描到疑似凭据，已中止：', file=sys.stderr)
        for p in problems:
            print('   ', p, file=sys.stderr)
        return 1

    if not args.check:
        print('\nOK 已镜像 %d 个分册到 docs/memory/（无敏感串）' % len(written))
    else:
        print('\nOK 两侧均未扫到敏感串')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
