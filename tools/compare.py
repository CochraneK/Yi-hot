# -*- coding: utf-8 -*-
# Read-only comparison: GitHub main tree vs local working tree.
# Reports (1) recent remote commits, (2) remote-only paths, (3) local-only paths,
# (4) content-differing paths (potential conflicts).
import urllib.request, urllib.error, json, re, os, sys, hashlib

OWNER, REPO = 'CochraneK', 'Yi-hot'
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from yihot_common import BASE, get_token, work_dir, work_file  # noqa: E402


token = get_token()

def req(method, path, body=None, retries=4):
    url = 'https://api.github.com' + path
    data = json.dumps(body).encode() if body is not None else None
    import time
    for attempt in range(retries):
        r = urllib.request.Request(url, data=data, method=method)
        r.add_header('Authorization', 'token ' + token)
        r.add_header('Accept', 'application/vnd.github+json')
        if data:
            r.add_header('Content-Type', 'application/json')
        try:
            resp = urllib.request.urlopen(r, timeout=120)
            return resp.status, json.loads(resp.read().decode() or 'null')
        except urllib.error.HTTPError as e:
            code = e.code
            raw = e.read().decode()[:300]
            if code in (403, 429, 502, 503) and attempt < retries - 1:
                time.sleep(6 * (attempt + 1))
                continue
            try:
                return code, json.loads(raw or '{}')
            except Exception:
                return code, {'raw': raw}
    return code, {'raw': 'retries exhausted'}

st, ref = req('GET', '/repos/%s/%s/git/ref/heads/main' % (OWNER, REPO))
assert st == 200, ref
main_sha = ref['object']['sha']
print('REMOTE main sha:', main_sha)

st, commits = req('GET', '/repos/%s/%s/commits?sha=main&per_page=12' % (OWNER, REPO))
assert st == 200, commits
print('\n=== remote recent 12 commits (newest first) ===')
for c in commits:
    info = (c.get('commit') or {}).get('author') or {}
    date = (info.get('date') or '')[:19].replace('T', ' ')
    msg = ((c.get('commit') or {}).get('message') or '').splitlines()[0]
    print('%s  %s  %s' % (c['sha'][:10], date, msg[:110]))

st, tree = req('GET', '/repos/%s/%s/git/trees/%s?recursive=1' % (OWNER, REPO, main_sha))
assert st == 200 and not tree.get('truncated'), (st, tree)
remote = {e['path']: e['sha'] for e in tree['tree'] if e['type'] == 'blob'}
print('\nremote blob count:', len(remote))

def blob_sha1(path):
    with open(path, 'rb') as f:
        c = f.read()
    return hashlib.sha1(b'blob %d\x00' % len(c) + c).hexdigest()

# 本地集合：直接遍历工作树。⚠️ 不要用 `git ls-files` —— 开发机这份仓库的
# git 索引是**陈旧/残缺**的（本地与远端历史不同源，见 docs/PROJECT_CONTEXT.md §2），
# 它会漏报一大批本地文件、凭空造出几十个「远端独有」的假差异。
# 排除规则与 verify_threeway.py 保持一致。
EXCL_DIRS = {'node_modules', 'dist', '.cache', '.data', '.git', '.workbuddy', '.claude',
             '.react-router', 'package', 'build', '__pycache__'}
local = {}
for root, dirs, files in os.walk(BASE):
    dirs[:] = [d for d in dirs if d not in EXCL_DIRS]
    for fn in files:
        if fn == '.env' or (fn.startswith('.env.') and fn != '.env.example'):
            continue
        fp = os.path.join(root, fn)
        rel = os.path.relpath(fp, BASE).replace(os.sep, '/')
        # secrets/ 只认「密的 + 说明」，明文与本地小工具不可能在远端
        if rel.startswith('secrets/') and rel not in ('secrets/credentials.env.enc', 'secrets/README.md'):
            continue
        local[rel] = blob_sha1(fp)
print('local source files:', len(local))

remote_only = sorted(set(remote) - set(local))
local_only = sorted(set(local) - set(remote))
differ = sorted(p for p in set(remote) & set(local) if remote[p] != local[p])

print('\n=== remote-only (on GitHub, missing locally) : %d ===' % len(remote_only))
for p in remote_only[:80]:
    print('  ', p)
print('\n=== local-only (locally, missing on GitHub) : %d ===' % len(local_only))
for p in local_only[:80]:
    print('  ', p)
print('\n=== content differs (both sides, different sha) : %d ===' % len(differ))
for p in differ[:120]:
    print('  %-52s remote=%s local=%s' % (p, remote[p][:10], local[p][:10]))

json.dump({'remote': remote, 'local': local, 'main': main_sha},
          open(work_file('_yihot_cmp.json'), 'w', encoding='utf-8'))
print('\nsaved -> ' + work_file('_yihot_cmp.json'))