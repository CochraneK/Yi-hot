# -*- coding: utf-8 -*-
"""把 .workbuddy/memory/ 的常青分册 + 每日日志镜像到 docs/memory/（脱敏后入库）。

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

# 每日日志：docs/memory/ 里也留一份（用户 2026-10-28 明确要求「全部带走」）。
# 只认 `YYYY-MM-DD.md` 这种形状，别把随手放的临时 md 一起镜像进去。
_DAILY_RE = re.compile(r'^\d{4}-\d{2}-\d{2}\.md$')


def volumes():
    """常青分册在前，每日日志按日期升序在后。"""
    if not os.path.isdir(SRC_DIR):
        return list(VOLUMES)
    daily = sorted(n for n in os.listdir(SRC_DIR) if _DAILY_RE.match(n))
    return list(VOLUMES) + daily

# 加在每个镜像文件开头的横幅，提醒读者「这是生成物、别直接改」。
BANNER = (
    "<!-- 本文件由 tools/sync_memory.py 从 .workbuddy/memory/{name} 单向生成，请勿直接编辑。 -->\n"
    "<!-- 源目录 .workbuddy/ 在 .gitignore 里，所以这里是为「换机器 / 换 AI 接手」准备的脱敏镜像。 -->\n"
    "<!-- 要改：改 .workbuddy/memory/{name} → 重跑 `python tools/sync_memory.py`。 -->\n"
    "\n"
)

# 脱敏规则：(正则, 替换)。按顺序应用，先具体后宽泛。
#
# 关键：取值必须长得像「密钥」——只有凭据字符集、连续 8 位以上。
# 三个必须排除的东西：
#   ① 命令替换 `SSH_PASS="$(grep …)"`       —— 含 `$`/`"`，被字符集挡掉
#   ② 占位符 `<见 secrets/credentials.env>` —— 含 `<`/`>`
#   ③ 代码里比对键名 `startswith('ADMIN_PASSWORD=')` —— `)` 不在字符集里
# 早期版本用 `[^'"\s$<>]{8,}`（「非引号非空白就行」）太宽，吃掉了 ③ 那一段，
# 把 `')`）；`gho_` token` 整串替换成了占位符（2026-10-28 实测）。
_SECRET_VAL = r"[A-Za-z0-9_\-.!@#%^&*+/~?]{8,}"
REDACTIONS = (
    (re.compile(r"(SSH_PASS\s*=\s*['\"])(" + _SECRET_VAL + r")(['\"])"),
     r"\1<redacted: secrets/credentials.env 的 SSH_PASS>\3"),
    (re.compile(r"(ADMIN_PASSWORD\s*=\s*['\"]?)(" + _SECRET_VAL + r")(['\"]?)"),
     r"\1<redacted: secrets/credentials.env>\3"),
    # 日志里常见的「裸值」写法：**管理员密码 `xxxxx`**（没有 KEY= 前缀，靠中文标签定位）。
    # 要求「密码」标签 + 反引号 + 12 位以上无空白串，才不会吃掉正文里的普通名词。
    (re.compile(r"(密码[^\n`]{0,4}`)([A-Za-z0-9_!@#$%^&*+=\-]{12,})(`)"),
     r"\1<redacted: secrets/credentials.env>\3"),
    # 飞书：app_id / 群 chat_id。单独拿到用不了，但和 secret 一起就是凭据，统一脱敏。
    (re.compile(r"\bcli_[A-Za-z0-9]{8,}\b"), "<feishu-app-id-redacted>"),
    (re.compile(r"\boc_[0-9a-f]{16,}\b"), "<feishu-chat-id-redacted>"),
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
    re.compile(r"\boc_[0-9a-f]{16,}\b"),
    # 「密码 `…`」形态的漏网之鱼（脱敏后不该再有；留着防回归）
    re.compile(r"密码[^\n`]{0,4}`[A-Za-z0-9_!@#$%^&*+=\-]{12,}`"),
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

    problems, pending = [], []
    for name in volumes():
        src = os.path.join(SRC_DIR, name)
        if not os.path.exists(src):
            print('  SKIP (missing):', name)
            continue
        raw = open(src, encoding='utf-8').read()
        clean = redact(raw)

        if args.check:
            problems += scan(clean, '.workbuddy/' + name)
            dst = os.path.join(DST_DIR, name)
            if os.path.exists(dst):
                problems += scan(open(dst, encoding='utf-8').read(), 'docs/memory/' + name)
            continue

        problems += scan(clean, 'docs/memory/' + name)
        pending.append((name, raw, clean))

    # ⚠️ 先全部扫描、再统一落盘：只要有一处命中就一个字节都不写。
    # （早期版本是「边写边扫」，扫到后文件已经写出去了，与文件头承诺不符。）
    if problems:
        print('\n!! 扫描到疑似凭据，未写入任何文件：', file=sys.stderr)
        for p in problems:
            print('   ', p, file=sys.stderr)
        return 1

    written = []
    if not args.check:
        os.makedirs(DST_DIR, exist_ok=True)
        for name, raw, clean in pending:
            with open(os.path.join(DST_DIR, name), 'w', encoding='utf-8', newline='\n') as f:
                f.write(BANNER.format(name=name) + clean)
            written.append(name)
            print('  %-14s %7d B -> %7d B' % (name, len(raw.encode()), len(clean.encode())))

    if not args.check:
        print('\nOK 已镜像 %d 个文件到 docs/memory/（无敏感串）' % len(written))
    else:
        print('\nOK 两侧均未扫到敏感串')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
