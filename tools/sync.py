# -*- coding: utf-8 -*-
# Incremental sync of changed files to github.com/CochraneK/Yi-hot (main).
# Reuses the Git Data API approach proved out in legacy/finish_push.py: upload the
# changed blobs, rebuild only the affected tree chain (dirs) bottom-up, commit on
# top of the current main, fast-forward the ref, verify (dynamic blob count).
#
# 用法（ADD/UPDATE-only：只能新增/覆盖，**不能删除**；删文件用 delete.py）：
#
#   python tools/sync.py -m "提交信息" <路径1> <路径2> ...
#   python tools/sync.py -m "…" --changed-from <清单文件>     # 每行一个仓库相对路径
#
# 路径一律是**仓库相对路径**（如 `docs/PROJECT_CONTEXT.md`），必须已存在且是文件。
# 清单从哪来？跑 `python tools/compare.py`，它会打印「本地独有 + 内容不同」两组，
# 把这两组拼起来写成清单文件即可（compare.py 也会把完整对照存进 `_yihot_cmp.json`）。
import urllib.request, urllib.error, json, re, os, sys, base64, time, subprocess, hashlib

OWNER, REPO = 'CochraneK', 'Yi-hot'
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from yihot_common import BASE, get_token, work_dir, work_file  # noqa: E402


def parse_args(argv):
    """没给路径就直接退出，绝不「猜」要传什么——误传会让远端偏离本地。"""
    msg, changed, from_file = None, [], None
    i = 0
    while i < len(argv):
        a = argv[i]
        if a in ('-m', '--message'):
            i += 1
            msg = argv[i]
        elif a == '--changed-from':
            i += 1
            from_file = argv[i]
        elif a.startswith('-'):
            raise SystemExit('unknown option: ' + a)
        else:
            changed.append(a.replace('\\', '/'))
        i += 1
    if from_file:
        with open(from_file, encoding='utf-8') as f:
            changed += [ln.strip().replace('\\', '/') for ln in f if ln.strip()]
    return msg, changed


MSG, CHANGED = parse_args(sys.argv[1:])
assert MSG and CHANGED, (
    'usage: python tools/sync.py -m "<commit message>" <repo-relative paths...>\n'
    '   or: python tools/sync.py -m "<commit message>" --changed-from <manifest>\n'
    '(at least one existing file path is required — this tool never guesses)')
CHANGED = sorted(set(CHANGED))
missing_local = [p for p in CHANGED if not os.path.isfile(os.path.join(BASE, p.replace('/', os.sep)))]
assert not missing_local, ('these paths are not files in the working tree', missing_local)

def dir_chain(paths):
    """Every directory that must be rebuilt to place these files, deepest first,
    root ('') last. Derived from CHANGED so any path can be synced. Depth counts
    path segments (not slashes) so it stays correct for any layout."""
    s = set()
    for p in paths:
        parts = p.split('/')[:-1]
        for i in range(len(parts)):
            s.add('/'.join(parts[:i + 1]))
    return sorted([d for d in s if d], key=lambda d: -len(d.split('/'))) + ['']

token = get_token()

def req(method, path, body=None, retries=4):
    url = 'https://api.github.com' + path
    data = json.dumps(body).encode() if body is not None else None
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

st, ref = req('GET', '/repos/%s/%s/git/ref/heads/main' % (OWNER, REPO))
assert st == 200, 'main ref missing: %s' % ref
cur_sha = ref['object']['sha']
st, cur_commit = req('GET', '/repos/%s/%s/git/commits/%s' % (OWNER, REPO, cur_sha))
assert st == 200, ('commit fetch fail', st)
cur_tree = cur_commit['tree']['sha']
print('current main:', cur_sha[:10], 'tree:', cur_tree[:10], file=sys.stderr, flush=True)

def git_tree(path):
    """Fetch the tree at a repo path, walking from the root of the current commit.

    A directory that does not exist yet (we are creating it) yields an empty entry
    list, so new folders like apps/web/public/ can be introduced by a sync.
    """
    sha, prefix = cur_tree, ''
    parts = [p for p in path.split('/') if p]
    for i, p in enumerate(parts):
        st, t = req('GET', '/repos/%s/%s/git/trees/%s' % (OWNER, REPO, sha))
        assert st == 200 and not t.get('truncated'), ('tree fetch fail', st, prefix + p)
        found = [e for e in t['tree'] if e['path'] == p]
        if not found:
            # Missing intermediate directory: everything below it starts empty.
            return []
        assert found[0]['type'] == 'tree', ('not a tree', prefix + p)
        sha = found[0]['sha']
        prefix = prefix + '/' + p
    st, t = req('GET', '/repos/%s/%s/git/trees/%s' % (OWNER, REPO, sha))
    assert st == 200 and not t.get('truncated'), ('tree fetch fail', st, path)
    return t['tree']

def post_tree(entries):
    entries = sorted(entries, key=lambda e: e['path'] + ('/' if e['type'] == 'tree' else ''))
    st, res = req('POST', '/repos/%s/%s/git/trees' % (OWNER, REPO), {'tree': entries})
    assert st == 201, ('tree post fail', st, res)
    return res['sha']

# Upload the changed blobs.
new_shas = {}
for rel in CHANGED:
    lp = os.path.join(BASE, rel.replace('/', os.sep))
    with open(lp, 'rb') as f:
        content = f.read()
    b64 = base64.b64encode(content).decode()
    st, res = req('POST', '/repos/%s/%s/git/blobs' % (OWNER, REPO),
                  {'content': b64, 'encoding': 'base64'})
    assert st == 201, ('blob fail', st, rel, res)
    new_shas[rel] = res['sha']
    local = hashlib.sha1(b'blob %d\x00' % len(content) + content).hexdigest()
    assert res['sha'] == local, ('blob sha mismatch', rel)
    print('blob ok:', rel, res['sha'][:10], file=sys.stderr, flush=True)

# Rebuild the tree chain bottom-up (deepest dirs first).
dirs = dir_chain(CHANGED)
new_dir = {}
for d in dirs:
    entries = git_tree(d)
    # replace any blob entry whose full path (relative to d) matches a changed file
    for rel in CHANGED:
        if d:
            match = rel.startswith(d + '/') and '/' not in rel[len(d) + 1:]
        else:
            match = '/' not in rel
        if match:
            entries = [e for e in entries if e['path'] != os.path.basename(rel)]
            entries.append({'path': os.path.basename(rel), 'mode': '100644', 'type': 'blob', 'sha': new_shas[rel]})
    # replace child-tree entries that were just rebuilt
    for sd, sha in new_dir.items():
        if d:
            under = sd.startswith(d + '/') and '/' not in sd[len(d) + 1:]
            child = sd[len(d) + 1:]
        else:
            under = '/' not in sd
            child = sd
        if under:
            entries = [e for e in entries if e['path'] != child]
            entries.append({'path': child, 'mode': '040000', 'type': 'tree', 'sha': sha})
    new_dir[d] = post_tree(entries)
    print('tree rebuilt:', (d or '<root>'), new_dir[d][:10], file=sys.stderr, flush=True)

# Commit identity from local HEAD (offset gets its colon back for the API).
ident = {}
raw = subprocess.run(['git', 'cat-file', 'commit', 'HEAD'], cwd=BASE,
                     capture_output=True, text=True, check=True).stdout
# Keep the local git identity (name/email) but stamp the real current wall clock.
# Never use time.gmtime() here: that is UTC, and mislabelling it +08:00 would put
# the commit 8 hours in the future.
import datetime
_off = datetime.datetime.now().astimezone().strftime('%z')
now_iso = datetime.datetime.now().strftime('%Y-%m-%dT%H:%M:%S') + _off[:3] + ':' + _off[3:]
for role in ('author', 'committer'):
    m = re.search(r'^%s (.+?) <(.+?)> (\d+) ([+-]\d{4})' % role, raw, re.M)
    if m:
        ident[role] = {'name': m.group(1), 'email': m.group(2), 'date': now_iso}

body = {'message': MSG, 'tree': new_dir[''], 'parents': [cur_sha]}
body.update(ident)
st, commit = req('POST', '/repos/%s/%s/git/commits' % (OWNER, REPO), body)
assert st == 201, ('commit fail', st, commit)
print('new commit:', commit['sha'][:10], file=sys.stderr, flush=True)

st, refres = req('PATCH', '/repos/%s/%s/git/refs/heads/main' % (OWNER, REPO),
                 {'sha': commit['sha']})
assert st == 200, ('ref fail (not fast-forward?)', st, refres)
print('ref fast-forwarded to', refres['ref'][:10] if 'ref' in str(refres) else commit['sha'][:10], file=sys.stderr, flush=True)

# Verify: the blob count changes only by the number of genuinely new paths, and
# every changed file's remote blob sha equals the local file sha1 (stronger than
# spot-checking one file). A new file legitimately adds one blob; anything else
# would mean the tree rebuild dropped or duplicated something.
st, ot = req('GET', '/repos/%s/%s/git/trees/%s?recursive=1' % (OWNER, REPO, cur_tree))
assert st == 200 and not ot.get('truncated'), ('old tree fetch fail', st)
old_paths = {e['path'] for e in ot['tree'] if e['type'] == 'blob'}
st, nt = req('GET', '/repos/%s/%s/git/trees/%s?recursive=1' % (OWNER, REPO, new_dir['']))
assert st == 200 and not nt.get('truncated'), ('verify tree fail', st)
new_paths = {e['path'] for e in nt['tree'] if e['type'] == 'blob'}
added, removed = new_paths - old_paths, old_paths - new_paths
expect_add = {r for r in CHANGED if r not in old_paths}
assert added == expect_add, ('unexpected paths added', sorted(added ^ expect_add))
assert not removed, ('paths lost', sorted(removed)[:10])
print('verify: blobs %d -> %d (+%d new: %s), none removed' % (
    len(old_paths), len(new_paths), len(added), sorted(added)), file=sys.stderr, flush=True)
local_sha1 = {}
for rel in CHANGED:
    with open(os.path.join(BASE, rel.replace('/', os.sep)), 'rb') as f:
        c = f.read()
    local_sha1[rel] = hashlib.sha1(b'blob %d\x00' % len(c) + c).hexdigest()
by_path = {e['path']: e['sha'] for e in nt['tree']}
for rel, sha in local_sha1.items():
    assert by_path.get(rel) == sha, ('remote blob mismatch', rel)
print('verify: all %d changed files match local sha1' % len(local_sha1), file=sys.stderr, flush=True)
print('SYNC OK', file=sys.stderr, flush=True)
