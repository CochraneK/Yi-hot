# -*- coding: utf-8 -*-
# Three-way consistency check for CochraneK/yihot:
#   GitHub main  vs  本地仓库根（tools/yihot_common.py 的 BASE）  vs  腾讯云 /opt/yihot
# Compares by git blob sha (sha1("blob <len>\0"+content)) because the local git
# history is NOT the same lineage as the remote (see project memory).
# This script does GitHub + local and writes two maps for the server-side step:
#   _gh_map.json    : path -> blob sha   (authoritative, from GitHub)
#   _local_map.json : path -> blob sha   (every non-ignored local source file)
import urllib.request, json, re, os, hashlib, sys

OWNER, REPO = 'CochraneK', 'Yi-hot'
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from yihot_common import BASE, get_token, work_dir, work_file  # noqa: E402


def req(path):
    r = urllib.request.Request('https://api.github.com' + path)
    r.add_header('Authorization', 'token ' + get_token())
    r.add_header('Accept', 'application/vnd.github+json')
    return json.loads(urllib.request.urlopen(r, timeout=120).read())

ref = req('/repos/%s/%s/git/ref/heads/main' % (OWNER, REPO))
commit = req('/repos/%s/%s/git/commits/%s' % (OWNER, REPO, ref['object']['sha']))
tree = req('/repos/%s/%s/git/trees/%s?recursive=1' % (OWNER, REPO, commit['tree']['sha']))
gh = {e['path']: e['sha'] for e in tree['tree'] if e['type'] == 'blob'}
print('GitHub main :', ref['object']['sha'][:10], '| blobs:', len(gh))

EXCL_DIRS = {'node_modules', 'dist', '.cache', '.data', '.git', '.workbuddy', '.claude',
             '.react-router', 'package', 'build', '__pycache__'}

def blob_sha(fp):
    with open(fp, 'rb') as f:
        c = f.read()
    return hashlib.sha1(b'blob %d\x00' % len(c) + c).hexdigest()

# Local manifest (non-ignored source files).
local = {}
for root, dirs, files in os.walk(BASE):
    dirs[:] = [d for d in dirs if d not in EXCL_DIRS]
    for fn in files:
        if fn == '.env' or (fn.startswith('.env.') and fn != '.env.example'):
            continue
        fp = os.path.join(root, fn)
        rel = os.path.relpath(fp, BASE).replace(os.sep, '/')
        # secrets/ 只认「密的 + 说明」；明文与本地小工具被 .gitignore 挡住，不可能出现在远端/服务器
        if rel.startswith('secrets/') and rel not in ('secrets/credentials.env.enc', 'secrets/README.md'):
            continue
        local[rel] = blob_sha(fp)
print('Local       :', len(local), 'source files')

# A) GitHub -> local
miss_l = [p for p in gh if p not in local]
diff_l = [p for p in gh if p in local and local[p] != gh[p]]
print('\n[A] GitHub -> Local : missing=%d diff=%d' % (len(miss_l), len(diff_l)))
for p in miss_l[:25]:
    print('    MISSING', p)
for p in diff_l[:25]:
    print('    DIFF   ', p)

# B) Local -> GitHub : files present locally that are NOT on GitHub (un-pushed).
extra_l = sorted(set(local) - set(gh))
print('\n[B] Local files NOT on GitHub : %d' % len(extra_l))
for p in extra_l[:40]:
    print('    EXTRA  ', p)

print('\nGitHub top-level dirs:', sorted({p.split('/')[0] for p in gh if '/' in p}))
json.dump(gh, open(work_file('_gh_map.json'), 'w'), ensure_ascii=False)
json.dump(local, open(work_file('_local_map.json'), 'w'), ensure_ascii=False)
print('wrote _gh_map.json / _local_map.json')
