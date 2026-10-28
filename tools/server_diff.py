# -*- coding: utf-8 -*-
# Full server-vs-local diff for /opt/yihot (run ON the server).
#   * lists every local source file missing/different on the server (blob-sha compare)
#   * lists server-side stray files not present locally (excl. runtime dirs)
#   * writes BOTH /tmp/_to_upload.txt (relative paths) and /tmp/_upload_manifest.txt
#     (lines "LOCAL_ABS|REMOTE_ABS") ready for deploy/sftp-upload-many.js.
# Workflow: run this on the server -> cat /tmp/_upload_manifest.txt > local file
#           -> cd deploy && node sftp-upload-many.js <that file> -> docker compose build/up -d.
import json, hashlib, os

LOCAL_BASE = os.environ.get('YIHOT_LOCAL_BASE') or 'D:/Software/DSH/gonyi-hot'  # 本机源码树的绝对路径（只在生成上传清单时用；服务器上可覆盖）
REMOTE_BASE = '/opt/yihot'
loc = json.load(open('/tmp/_local_map.json'))

# ⚠️ 定向模式：本地可能**落后**于远端（另一台机器在推进 19 天，本机只改了几个文件）。
# 这时全树比对会把「远端新功能」判成「服务器需要上传本地旧版」= 倒退覆盖。
# 所以只改了几个文件时，用 YIHOT_ONLY 限定要处理的范围：
#   YIHOT_ONLY=docs/memory/README.md,tools/sync_memory.py python3 tools/server_diff.py
ONLY = [p.strip().replace('\\', '/') for p in (os.environ.get('YIHOT_ONLY') or '').replace(',', '\n').split('\n')]
ONLY = [p for p in ONLY if p]
if ONLY:
    absent = [p for p in ONLY if p not in loc]
    assert not absent, 'not in _local_map.json: %r' % absent
    loc = {p: loc[p] for p in ONLY}
    print('YIHOT_ONLY mode: %d paths' % len(loc))

def sha(fp):
    c = open(fp, 'rb').read()
    return hashlib.sha1(b'blob %d\x00' % len(c) + c).hexdigest()

miss, diff = [], []
for p, s in sorted(loc.items()):
    fp = os.path.join(REMOTE_BASE, p)
    if not os.path.exists(fp):
        miss.append(p)
    elif sha(fp) != s:
        diff.append(p)

print('=== LOCAL -> SERVER : need upload total=%d (missing=%d diff=%d) ===' % (len(miss) + len(diff), len(miss), len(diff)))
for p in miss:
    print('  MISSING', p)
for p in diff:
    print('  DIFF   ', p)

EXCL = {'node_modules', 'dist', '.cache', '.data', '.git', '.workbuddy', '.claude',
        '.react-router', 'package', 'build', '__pycache__', 'postgres-data'}
localset = set(loc)
extra = []
if ONLY:
    print('\n=== SERVER stray: 跳过（定向模式不看全树） ===')
else:
    for root, dirs, files in os.walk(REMOTE_BASE):
        dirs[:] = [d for d in dirs if d not in EXCL and not d.startswith('_backup') and not d.startswith('.backup')]
        for fn in files:
            rel = os.path.relpath(os.path.join(root, fn), REMOTE_BASE).replace(os.sep, '/')
            if rel.startswith(tuple(EXCL)) or rel in localset:
                continue
            if rel == '.env' or (rel.startswith('.env.') and rel != '.env.example'):
                continue
            extra.append(rel)
    print('\n=== SERVER stray (not in local set) : %d ===' % len(extra))
    for p in sorted(extra)[:60]:
        print('  EXTRA  ', p)

todo = miss + diff
open('/tmp/_to_upload.txt', 'w').write('\n'.join(todo))
open('/tmp/_upload_manifest.txt', 'w').write('\n'.join('%s/%s|%s/%s' % (LOCAL_BASE, p, REMOTE_BASE, p) for p in todo))
print('\nwrote /tmp/_to_upload.txt and /tmp/_upload_manifest.txt (%d paths)' % len(todo))
