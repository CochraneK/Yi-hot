# -*- coding: utf-8 -*-
# FutureMe three-way: GitHub CochraneK/FutureMe vs local _fm_stage vs server /home/ubuntu/futureyou
import urllib.request, json, re, os, hashlib

def req(path):
    r = urllib.request.Request('https://api.github.com' + path)
    r.add_header('Authorization', 'token ' + get_token())
    r.add_header('Accept', 'application/vnd.github+json')
    return json.loads(urllib.request.urlopen(r, timeout=120).read())

BASE = os.environ.get('FM_STAGE') or os.path.join(work_dir(), '_fm_stage')
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from yihot_common import BASE, get_token, work_dir, work_file  # noqa: E402

ref = req('/repos/CochraneK/FutureMe/git/ref/heads/main')
commit = req('/repos/CochraneK/FutureMe/git/commits/%s' % ref['object']['sha'])
tree = req('/repos/CochraneK/FutureMe/git/trees/%s?recursive=1' % commit['tree']['sha'])
gh = {e['path']: e['sha'] for e in tree['tree'] if e['type'] == 'blob'}
print('FutureMe GitHub main:', ref['object']['sha'][:10], '| blobs:', len(gh))

def blob_sha(fp):
    with open(fp, 'rb') as f:
        c = f.read()
    return hashlib.sha1(b'blob %d\x00' % len(c) + c).hexdigest()

EXCL = {'node_modules', 'dist', '.git', '.cache', '__pycache__', 'data'}
loc = {}
for root, dirs, files in os.walk(BASE):
    dirs[:] = [d for d in dirs if d not in EXCL]
    for fn in files:
        fp = os.path.join(root, fn)
        loc[os.path.relpath(fp, BASE).replace(os.sep, '/')] = blob_sha(fp)
print('Local _fm_stage      :', len(loc), 'files')

miss = [p for p in gh if p not in loc]
diff = [p for p in gh if p in loc and loc[p] != gh[p]]
extra = sorted(set(loc) - set(gh))
print('\n[A] GitHub -> Local : missing=%d diff=%d' % (len(miss), len(diff)))
for p in miss[:25]: print('    MISSING', p)
for p in diff[:25]: print('    DIFF   ', p)
print('\n[B] Local NOT on GitHub : %d' % len(extra))
for p in extra[:30]: print('    EXTRA  ', p)
json.dump(gh, open(work_file('_fm_gh_map.json'), 'w'), ensure_ascii=False)
print('\nwrote _fm_gh_map.json')
