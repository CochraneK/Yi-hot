# -*- coding: utf-8 -*-
"""Yi-Hot 仓库工具 · 共享辅助（仓库根 / GitHub token / 中间产物目录）。

本模块存在的唯一理由：把原先散落在各脚本里的**开发机专属硬编码**收敛成
**可配置**的，这样换一台电脑、或换一个 AI 接手时，clone 下来就能跑。

环境变量
--------
YIHOT_ROOT  本地仓库根目录。默认 = 本文件所在目录（tools/）的上一级。
YIHOT_WORK  中间产物（`_gh_map.json` / `_local_map.json` / `_yihot_cmp.json`）
            的落盘目录。默认 = 仓库根的**上一级**，刻意放在仓库之外，
            避免这些临时文件被误提交。
GITHUB_TOKEN  GitHub PAT（fine-grained，只需 Yi-hot 的 Contents: read/write）。
           未设置时回退到 `GH_TOKEN`，再回退到「从若干本地 git 仓库的 remote
           URL 里抠出内嵌 token」——那是**开发机便利路径**，新设备上不适用。
"""
import hashlib
import os
import re
import urllib.error  # noqa: F401  (re-exported for the callers' convenience)
import urllib.request  # noqa: F401

OWNER, REPO = 'CochraneK', 'Yi-hot'

# tools/ 的上一级就是仓库根
WORKSPACE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.environ.get('YIHOT_ROOT') or WORKSPACE

_TOKEN_CONFIGS = (
    # 开发机惯例：token 内嵌在别的仓库的 remote URL 里（Novel2game 的 API 有效）
    os.path.join(os.path.dirname(WORKSPACE), 'Novel2game', '.git', 'config'),
    # 新设备上更自然的位置：本仓库自己的 remote
    os.path.join(WORKSPACE, '.git', 'config'),
)
_TOKEN_RE = re.compile(r'://(?:[^@/]+:)?((?:gho|ghp)_[A-Za-z0-9]+)@github\.com')


def work_dir() -> str:
    """中间产物目录（已确保存在）。"""
    d = os.environ.get('YIHOT_WORK') or os.path.dirname(WORKSPACE)
    os.makedirs(d, exist_ok=True)
    return d


def work_file(name: str) -> str:
    return os.path.join(work_dir(), name)


def get_token() -> str:
    tok = (os.environ.get('GITHUB_TOKEN') or os.environ.get('GH_TOKEN') or '').strip()
    if tok:
        return tok
    for cfg in _TOKEN_CONFIGS:
        try:
            with open(cfg, encoding='utf-8') as f:
                m = _TOKEN_RE.search(f.read())
        except OSError:
            continue
        if m:
            return m.group(1)
    raise SystemExit(
        'no GitHub token found — set GITHUB_TOKEN (or GH_TOKEN) before running.\n'
        'searched: ' + ', '.join(_TOKEN_CONFIGS)
    )


def blob_sha_bytes(data: bytes) -> str:
    """git blob sha1，即 sha1(b"blob <len>\\0" + content)。"""
    return hashlib.sha1(b'blob %d\x00' % len(data) + data).hexdigest()


def blob_sha_file(path: str) -> str:
    with open(path, 'rb') as f:
        return blob_sha_bytes(f.read())
