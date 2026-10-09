# -*- coding: utf-8 -*-
# Push the local repo (tools/yihot_common.py 的 BASE) to GitHub (CochraneK/Yi-hot, private)
# via REST/Git Data API. git smart-HTTP is blocked by the egress proxy; api.github.com is allowed.
# 历史脚本：全量首推版本，日常增量同步请用 tools/sync.py。
import urllib.request, urllib.error, json, re, base64, os, sys, subprocess, time, hashlib

OWNER, REPO = 'CochraneK', 'Yi-hot'
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))
from yihot_common import BASE, get_token, work_dir, work_file  # noqa: E402


token = get_token()

def req(method, path, body=None, retries=3):
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
            raw = e.read().decode()[:300]
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
print('account:', me.get('login'), file=sys.stderr, flush=True)
assert me.get('login'), 'auth failed: %s' % me

st, repo = req('GET', '/repos/%s/%s' % (OWNER, REPO))
if st == 404:
    st, repo = req('POST', '/user/repos', {
        'name': REPO, 'private': True, 'auto_init': False,
        'description': 'Yi-Hot: AIHOT 公益领域定制版（腾讯云 49.233.72.222 部署）'})
    assert st in (200, 201), ('repo create fail', st, repo)
    print('repo created:', repo.get('html_url'), file=sys.stderr, flush=True)
else:
    assert st == 200, ('repo get fail', st, repo)
    print('repo exists:', repo.get('html_url'), 'private=', repo.get('private'), file=sys.stderr, flush=True)
    st2, ref = req('GET', '/repos/%s/%s/git/ref/heads/main' % (OWNER, REPO))
    if st2 == 200:
        print('main already exists - aborting (first push only)', file=sys.stderr)
        sys.exit(1)

out = subprocess.run(['git', 'ls-files'], cwd=BASE, capture_output=True, text=True, check=True)
files = [l for l in out.stdout.splitlines() if l.strip()]
print('local files:', len(files), file=sys.stderr, flush=True)
assert files

def git_blob_sha(content):
    h = hashlib.sha1()
    h.update(b'blob ' + str(len(content)).encode() + b'\x00' + content)
    return h.hexdigest()

blob_cache = {}
fmap = {}
t0 = time.time()
for i, rel in enumerate(files, 1):
    lp = os.path.join(BASE, rel.replace('/', os.sep))
    with open(lp, 'rb') as f:
        content = f.read()
    gsha = git_blob_sha(content)
    if gsha in blob_cache:
        fmap[rel] = ('100644', blob_cache[gsha])
        continue
    st, blob = req('POST', '/repos/%s/%s/git/blobs' % (OWNER, REPO),
                   {'content': base64.b64encode(content).decode(), 'encoding': 'base64'})
    assert st == 201, ('blob fail', st, rel, blob)
    blob_cache[gsha] = blob['sha']
    fmap[rel] = ('100644', blob['sha'])
    if i % 50 == 0:
        print('blobs %d/%d %.0fs' % (i, len(files), time.time() - t0), file=sys.stderr, flush=True)
print('blobs done %.0fs unique=%d' % (time.time() - t0, len(blob_cache)), file=sys.stderr, flush=True)

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

# Match local commit identity so remote commit sha can align with local git history.
ident = {}
try:
    raw = subprocess.run(['git', 'cat-file', 'commit', 'HEAD'], cwd=BASE,
                         capture_output=True, text=True, check=True).stdout
    for role in ('author', 'committer'):
        m = re.search(r'^%s (.+?) <(.+?)> (\d+) ([+-]\d{4})' % role, raw, re.M)
        if m:
            ident[role] = {'name': m.group(1), 'email': m.group(2),
                           'date': '%s%s' % (time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime(int(m.group(3)))), m.group(4))}
except Exception as e:
    print('ident parse failed, using API defaults:', e, file=sys.stderr)

body = {'message': 'Yi-Hot: AIHOT 公益领域定制版（腾讯云 49.233.72.222 部署快照 2026-10-08）',
        'tree': root_tree, 'parents': []}
if ident:
    body.update(ident)
st, commit = req('POST', '/repos/%s/%s/git/commits' % (OWNER, REPO), body)
assert st == 201, ('commit fail', st, commit)
local_sha = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=BASE,
                           capture_output=True, text=True, check=True).stdout.strip()
print('remote commit:', commit['sha'][:10], 'local commit:', local_sha[:10],
      'match' if commit['sha'] == local_sha else '(differs - ok for backup)', file=sys.stderr, flush=True)

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
