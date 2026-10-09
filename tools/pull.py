# -*- coding: utf-8 -*-
# Pull remote main into the local working tree via GitHub API (git protocol is
# proxy-blocked). Downloads every path where remote differs from local or is
# missing locally, then verifies each file's git blob sha1.
import urllib.request, urllib.error, json, re, time, os, hashlib

OWNER, REPO = 'CochraneK', 'Yi-hot'
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from yihot_common import BASE, get_token, work_dir, work_file  # noqa: E402


token = get_token()

def raw(path, retries=5):
    url = 'https://api.github.com/repos/%s/%s/contents/%s?ref=main' % (OWNER, REPO, path)
    for a in range(retries):
        r = urllib.request.Request(url)
        r.add_header('Authorization', 'token ' + token)
        r.add_header('Accept', 'application/vnd.github.raw')
        try:
            return urllib.request.urlopen(r, timeout=180).read()
        except urllib.error.HTTPError as e:
            if e.code in (403, 429, 502, 503) and a < retries - 1:
                time.sleep(6 * (a + 1)); continue
            raise
    raise RuntimeError('retries exhausted')

cmp_ = json.load(open(work_file('_yihot_cmp.json'), encoding='utf-8'))
remote, local = cmp_['remote'], cmp_['local']
todo = sorted(set(remote) - set(local)) + \
       sorted(p for p in set(remote) & set(local) if remote[p] != local[p])
print('files to pull:', len(todo))

ok = bad = 0
for rel in todo:
    content = raw(rel)
    want = remote[rel]
    got = hashlib.sha1(b'blob %d\x00' % len(content) + content).hexdigest()
    if got != want:
        print('  SHA MISMATCH, skipped:', rel); bad += 1; continue
    dst = os.path.join(BASE, rel.replace('/', os.sep))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, 'wb') as f:
        f.write(content)
    ok += 1
    print('  ok  %-58s %s (%d B)' % (rel, want[:10], len(content)))

print('\npulled ok=%d  skipped=%d' % (ok, bad))
assert bad == 0
print('PULL OK')