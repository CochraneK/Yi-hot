# -*- coding: utf-8 -*-
"""Repair the yihot main tree: a bad delete script hoisted the whole apps/ subtree
to the repository root (apps/* -> public/*, web/*). Rebuild the root so that the
correct 'apps' tree (taken from the commit before the breakage) is restored, and
drop the mis-hoisted copies.

Strategy: read the last good commit (5b0d4970a5^ = 54172ba9ed), take its 'apps'
subtree sha verbatim, and rebuild only the root entry list.
"""
import urllib.request, urllib.error, json, re, time, datetime

OWNER, REPO = 'CochraneK', 'Yi-hot'
BROKEN = '5b0d4970a56361147c0b319e2893004f689668b8'
GOOD = '54172ba9edc245e7ed5555897aaf0e25a037d74d'

import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))
from yihot_common import BASE, get_token, work_dir, work_file  # noqa: E402
T = get_token()

def req(method, path, body=None, retries=4):
    url = 'https://api.github.com' + path
    data = json.dumps(body).encode() if body is not None else None
    for a in range(retries):
        r = urllib.request.Request(url, data=data, method=method)
        r.add_header('Authorization', 'token ' + T)
        r.add_header('Accept', 'application/vnd.github+json')
        if data:
            r.add_header('Content-Type', 'application/json')
        try:
            resp = urllib.request.urlopen(r, timeout=180)
            return resp.status, json.loads(resp.read().decode() or 'null')
        except urllib.error.HTTPError as e:
            if e.code in (403, 429, 502, 503) and a < retries - 1:
                time.sleep(6 * (a + 1)); continue
            try:
                return e.code, json.loads(e.read().decode()[:300] or '{}')
            except Exception:
                return e.code, {}
    return 0, {}

def root_of(sha):
    st, c = req('GET', '/repos/%s/%s/git/commits/%s' % (OWNER, REPO, sha))
    assert st == 200, (st, c)
    st, t = req('GET', '/repos/%s/%s/git/trees/%s' % (OWNER, REPO, c['tree']['sha']))
    assert st == 200
    return c, {e['path']: e for e in t['tree']}

st, ref = req('GET', '/repos/%s/%s/git/ref/heads/main' % (OWNER, REPO))
cur_sha = ref['object']['sha']
assert cur_sha.startswith(BROKEN), ('tip moved, aborting', cur_sha)
print('broken tip:', cur_sha[:10])

bad_c, bad_root = root_of(cur_sha)
good_c, good_root = root_of(GOOD)

print('\nbroken root entries:', sorted(bad_root))
print('\nhoisted (should not be at root):', sorted(set(bad_root) - set(good_root)))

# Rebuild the root from the GOOD commit, then apply the one intended change
# (drop pipeline-prefilter.png inside apps/web/public).
entries = []
for name, e in sorted(good_root.items()):
    entries.append({'path': name, 'mode': e['type'] == 'tree' and '040000' or '100644',
                    'type': e['type'], 'sha': e['sha']})

# Remove the superseded file: rebuild apps/web/public without it.
st, t = req('GET', '/repos/%s/%s/git/trees/%s' % (OWNER, REPO, good_root['apps']['sha']))
assert st == 200
st, t2 = req('GET', '/repos/%s/%s/git/trees/%s' % (OWNER, REPO, good_root['web']['sha'])) if 'web' in good_root else (0, None)

def find(tree_sha, parts):
    """Walk to a subtree; return its sha."""
    cur = tree_sha
    for p in parts:
        st, tt = req('GET', '/repos/%s/%s/git/trees/%s' % (OWNER, REPO, cur))
        assert st == 200, (st, parts)
        f = [e for e in tt['tree'] if e['path'] == p]
        assert f, ('missing', p)
        cur = f[0]['sha']
    return cur

apps_sha = good_root['apps']['sha']
web_sha = find(apps_sha, ['web'])
public_sha = find(web_sha, ['public'])
st, pub = req('GET', '/repos/%s/%s/git/trees/%s' % (OWNER, REPO, public_sha))
assert st == 200
kept = [e for e in pub['tree'] if e['path'] != 'pipeline-prefilter.png']
print('\npublic/ before:', sorted(e['path'] for e in pub['tree']))
print('public/ after :', sorted(e['path'] for e in kept))
st, new_public = req('POST', '/repos/%s/%s/git/trees' % (OWNER, REPO), {'tree': kept})
assert st == 201, (st, new_public)

st, webt = req('GET', '/repos/%s/%s/git/trees/%s' % (OWNER, REPO, web_sha))
web_kept = [e for e in webt['tree'] if e['path'] != 'public']
web_kept.append({'path': 'public', 'mode': '040000', 'type': 'tree', 'sha': new_public['sha']})
st, new_web = req('POST', '/repos/%s/%s/git/trees' % (OWNER, REPO), {'tree': web_kept})
assert st == 201, (st, new_web)

st, appt = req('GET', '/repos/%s/%s/git/trees/%s' % (OWNER, REPO, apps_sha))
app_kept = [e for e in appt['tree'] if e['path'] != 'web']
app_kept.append({'path': 'web', 'mode': '040000', 'type': 'tree', 'sha': new_web['sha']})
st, new_apps = req('POST', '/repos/%s/%s/git/trees' % (OWNER, REPO), {'tree': app_kept})
assert st == 201, (st, new_apps)

root_entries = []
for e in entries:
    root_entries.append(e if e['path'] != 'apps'
                        else {'path': 'apps', 'mode': '040000', 'type': 'tree', 'sha': new_apps['sha']})
st, new_root = req('POST', '/repos/%s/%s/git/trees' % (OWNER, REPO), {'tree': root_entries})
assert st == 201, (st, new_root)

_off = datetime.datetime.now().astimezone().strftime('%z')
now = datetime.datetime.now().strftime('%Y-%m-%dT%H:%M:%S') + _off[:3] + ':' + _off[3:]
body = {'message': '修复上一次提交误将 apps/ 子树提升到仓库根的问题，并移除已被 light/dark 双图取代的 pipeline-prefilter.png',
        'tree': new_root['sha'], 'parents': [cur_sha],
        'author': {'name': bad_c['author']['name'], 'email': bad_c['author']['email'], 'date': now},
        'committer': {'name': bad_c['committer']['name'], 'email': bad_c['committer']['email'], 'date': now}}
st, commit = req('POST', '/repos/%s/%s/git/commits' % (OWNER, REPO), body)
assert st == 201, (st, commit)
st, r = req('PATCH', '/repos/%s/%s/git/refs/heads/main' % (OWNER, REPO), {'sha': commit['sha']})
assert st == 200, (st, r)

st, nt = req('GET', '/repos/%s/%s/git/trees/%s?recursive=1' % (OWNER, REPO, new_root['sha']))
paths = {e['path'] for e in nt['tree'] if e['type'] == 'blob'}
assert not [p for p in paths if p.startswith('public/')], 'hoisted copies still present'
assert not [p for p in paths if p.startswith('web/')], 'hoisted web still present'
for must in ('apps/web/public/pipeline-light.png', 'apps/web/public/pipeline-dark.png',
             'apps/api/package.json', 'apps/web/server.ts', 'assets/pipeline-prefilter.svg',
             'industry/sources.json', '.github/workflows/check.yml'):
    assert must in paths, ('missing after repair', must)
assert 'apps/web/public/pipeline-prefilter.png' not in paths
print('\nverify: %d blobs, apps/ restored, hoisted copies gone' % len(paths))
print('REPAIR OK ->', commit['sha'][:10])