# -*- coding: utf-8 -*-
# Finish the yihot push. _push_yihot.py uploaded all blobs (490 unique) and trees
# successfully, then failed at the commit stage: it emitted the commit date offset
# as "+0800" but the Git Data API requires an ISO 8601 offset with a colon "+08:00".
# This script rebuilds the tree (idempotent, content-addressed), creates the commit
# with a valid date, sets refs/heads/main, and verifies. Blob shas are computed
# locally (deterministic) so the 490-blob upload is NOT repeated.
import urllib.request, urllib.error, json, re, os, sys, subprocess, time, hashlib

OWNER, REPO = 'CochraneK', 'Yi-hot'
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))
from yihot_common import BASE, get_token, work_dir, work_file  # noqa: E402

MSG = 'Yi-Hot: AIHOT 公益领域定制版（腾讯云 49.233.72.222 部署快照 2026-10-08）'

token = get_token()

def req(method, path, body=None, retries=4):
    url = 'https://api.github.com' + path
    data = json.dumps(body).encode() if body is not None else None
    code, detail = 0, {}
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
            raw = e.read().decode()[:400]
            try:
                detail = json.loads(raw or '{}')
            except Exception:
                detail = {'raw': raw}
            if code in (403, 429, 502, 503) and attempt < retries - 1:
                time.sleep(8 * (attempt + 1))
                continue
            return code, detail
    return code, {'raw': 'retries exhausted'}

st, me = req('GET', '/user')
assert me.get('login'), 'auth failed: %s' % me
print('account:', me.get('login'), file=sys.stderr, flush=True)

# If a main ref already exists, a previous finish succeeded - do not clobber it.
st2, ref = req('GET', '/repos/%s/%s/git/ref/heads/main' % (OWNER, REPO))
if st2 == 200:
    print('main ref already exists at', ref.get('object', {}).get('sha', '?')[:10], '- nothing to do', file=sys.stderr, flush=True)
    sys.exit(0)
assert st2 == 404, ('unexpected ref state', st2, ref)

out = subprocess.run(['git', 'ls-files'], cwd=BASE, capture_output=True, text=True, check=True)
files = [l for l in out.stdout.splitlines() if l.strip()]
print('local files:', len(files), file=sys.stderr, flush=True)
assert files

def git_blob_sha(content):
    h = hashlib.sha1()
    h.update(b'blob ' + str(len(content)).encode() + b'\x00' + content)
    return h.hexdigest()

# Blobs were already uploaded (each returned 201 in the previous run). Their remote
# sha is exactly the deterministic git blob sha, so compute locally - no re-upload.
fmap = {}
for rel in files:
    lp = os.path.join(BASE, rel.replace('/', os.sep))
    with open(lp, 'rb') as f:
        content = f.read()
    fmap[rel] = ('100644', git_blob_sha(content))

tree_cache = {}
def build(prefix):
    if prefix in tree_cache:
        return tree_cache[prefix]
    entries = []
    subdirs = set()
    for rel in fmap:
        if prefix:
            if not rel.startswith(prefix + '/'):
                continue
            rel2 = rel[len(prefix) + 1:]
        else:
            rel2 = rel
        if '/' in rel2:
            subdirs.add(rel2.split('/')[0])
        else:
            mode, sha = fmap[rel]
            entries.append({'path': rel2, 'mode': mode, 'type': 'blob', 'sha': sha})
    for sd in subdirs:
        sp = prefix + '/' + sd if prefix else sd
        entries.append({'path': sd, 'mode': '040000', 'type': 'tree', 'sha': build(sp)})
    entries.sort(key=lambda e: e['path'] + ('/' if e['type'] == 'tree' else ''))
    st, res = req('POST', '/repos/%s/%s/git/trees' % (OWNER, REPO), {'tree': entries})
    assert st == 201, ('tree fail', st, prefix, res)
    tree_cache[prefix] = res['sha']
    return res['sha']
root_tree = build('')
print('root tree:', root_tree[:10], 'dirs:', len(tree_cache), file=sys.stderr, flush=True)

# Commit identity from the local HEAD. The date offset MUST carry a colon for GitHub
# (git stores "+0800"; the API wants "+08:00").
ident = {}
raw = subprocess.run(['git', 'cat-file', 'commit', 'HEAD'], cwd=BASE,
                     capture_output=True, text=True, check=True).stdout
for role in ('author', 'committer'):
    m = re.search(r'^%s (.+?) <(.+?)> (\d+) ([+-]\d{4})' % role, raw, re.M)
    if m:
        off = m.group(4)
        iso = time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime(int(m.group(3)))) + off[:3] + ':' + off[3:]
        ident[role] = {'name': m.group(1), 'email': m.group(2), 'date': iso}
print('committer date:', ident.get('committer', {}).get('date'), file=sys.stderr, flush=True)

body = {'message': MSG, 'tree': root_tree, 'parents': []}
if ident:
    body.update(ident)
st, commit = req('POST', '/repos/%s/%s/git/commits' % (OWNER, REPO), body)
assert st == 201, ('commit fail', st, commit)
local_sha = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=BASE,
                           capture_output=True, text=True, check=True).stdout.strip()
print('remote commit:', commit['sha'][:10], 'local commit:', local_sha[:10],
      'MATCH' if commit['sha'] == local_sha else '(differs - ok for backup)', file=sys.stderr, flush=True)

st, refres = req('POST', '/repos/%s/%s/git/refs' % (OWNER, REPO),
                 {'ref': 'refs/heads/main', 'sha': commit['sha']})
assert st == 201, ('ref fail', st, refres)
print('ref refs/heads/main set', file=sys.stderr, flush=True)

st, nt = req('GET', '/repos/%s/%s/git/trees/%s?recursive=1' % (OWNER, REPO, root_tree))
assert st == 200 and not nt.get('truncated'), ('verify fail', st)
n = sum(1 for e in nt['tree'] if e['type'] == 'blob')
print('verify: remote blobs=%d expect=%d' % (n, len(files)), file=sys.stderr, flush=True)
assert n == len(files)
print('PUSH OK', file=sys.stderr, flush=True)
