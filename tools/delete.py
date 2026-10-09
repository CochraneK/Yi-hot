# -*- coding: utf-8 -*-
# Delete a list of paths from CochraneK/Yi-hot@main in ONE commit.
#
# Reuses the bottom-up tree rebuild that sync.py proved out, but filters
# (removes) instead of adding. Directories that become empty are pruned.
#
# SAFETY (this is what the earlier tree-rewrite incident lacked): the verify step
# compares the FULL path -> blob-sha map before and after and asserts that the
# ONLY differences are the intended deletions — no additions, and every surviving
# path keeps its original blob sha.
#
# 用法：
#   python tools/delete.py -m "提交信息" <要删的仓库相对路径1> <路径2> ...
#   python tools/delete.py -m "…" --deleted-from <清单文件>     # 每行一个路径
import urllib.request, urllib.error, json, re, os, sys, base64, time, subprocess, hashlib, datetime

OWNER, REPO = 'CochraneK', 'Yi-hot'
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from yihot_common import BASE, get_token, work_dir, work_file  # noqa: E402


def parse_args(argv):
    """必须显式给路径——本工具会真删远端文件，绝不允许"猜"。"""
    msg, paths, from_file = None, [], None
    i = 0
    while i < len(argv):
        a = argv[i]
        if a in ('-m', '--message'):
            i += 1
            msg = argv[i]
        elif a == '--deleted-from':
            i += 1
            from_file = argv[i]
        elif a.startswith('-'):
            raise SystemExit('unknown option: ' + a)
        else:
            paths.append(a.replace('\\', '/'))
        i += 1
    if from_file:
        with open(from_file, encoding='utf-8') as f:
            paths += [ln.strip().replace('\\', '/') for ln in f if ln.strip()]
    return msg, sorted(set(paths))


MSG, DELETED = parse_args(sys.argv[1:])
assert MSG and DELETED, (
    'usage: python tools/delete.py -m "<commit message>" <repo-relative paths...>\n'
    '   or: python tools/delete.py -m "<commit message>" --deleted-from <manifest>')

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
            if code in (403, 429, 502, 503) and attempt < retries - 1:
                time.sleep(8 * (attempt + 1))
                continue
            return code, {'raw': raw}
    return 500, {'raw': 'retries exhausted'}

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

# Full before-map (path -> blob sha). Must contain every DELETED path.
st, ot = req('GET', '/repos/%s/%s/git/trees/%s?recursive=1' % (OWNER, REPO, cur_tree))
assert st == 200 and not ot.get('truncated'), ('old tree fetch fail', st)
old_map = {e['path']: e['sha'] for e in ot['tree'] if e['type'] == 'blob'}
missing = [p for p in DELETED if p not in old_map]
assert not missing, ('DELETED paths not on remote', missing)
print('before: %d blobs; all %d targets present' % (len(old_map), len(DELETED)), file=sys.stderr, flush=True)

def dir_chain(paths):
    """Dirs that must be rebuilt, deepest first, root ('') last."""
    s = set()
    for p in paths:
        parts = p.split('/')[:-1]
        for i in range(len(parts)):
            s.add('/'.join(parts[:i + 1]))
    return sorted(s, key=lambda d: -len(d.split('/'))) + ['']

def git_tree(path):
    sha, prefix = cur_tree, ''
    parts = [p for p in path.split('/') if p]
    for p in parts:
        st, t = req('GET', '/repos/%s/%s/git/trees/%s' % (OWNER, REPO, sha))
        assert st == 200 and not t.get('truncated'), ('tree fetch fail', st, prefix + p)
        found = [e for e in t['tree'] if e['path'] == p]
        if not found:
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

dirs = dir_chain(DELETED)
new_dir = {}   # dir -> new tree sha, or None meaning "now empty, pruned"
for d in dirs:
    entries = git_tree(d)
    # 1) drop the deleted blobs that sit directly in this dir
    for rel in DELETED:
        if d:
            here = rel.startswith(d + '/') and '/' not in rel[len(d) + 1:]
        else:
            here = '/' not in rel
        if here:
            entries = [e for e in entries if e['path'] != os.path.basename(rel)]
    # 2) swap in rebuilt child dirs; a pruned (None) child is removed entirely
    for sd, sha in new_dir.items():
        if d:
            under = sd.startswith(d + '/') and '/' not in sd[len(d) + 1:]
            child = sd[len(d) + 1:]
        else:
            under = '/' not in sd
            child = sd
        if under:
            entries = [e for e in entries if e['path'] != child]
            if sha is not None:
                entries.append({'path': child, 'mode': '040000', 'type': 'tree', 'sha': sha})
    if d and not entries:
        new_dir[d] = None
        print('prune empty dir:', d, file=sys.stderr, flush=True)
    else:
        new_dir[d] = post_tree(entries)
        print('tree rebuilt:', (d or '<root>'), new_dir[d][:10], file=sys.stderr, flush=True)

ident = {}
raw = subprocess.run(['git', 'cat-file', 'commit', 'HEAD'], cwd=BASE,
                     capture_output=True, text=True, check=True).stdout
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
print('ref fast-forwarded', file=sys.stderr, flush=True)

# Verify against the freshly committed tree.
st, nt = req('GET', '/repos/%s/%s/git/trees/%s?recursive=1' % (OWNER, REPO, new_dir['']))
assert st == 200 and not nt.get('truncated'), ('verify tree fail', st)
new_map = {e['path']: e['sha'] for e in nt['tree'] if e['type'] == 'blob'}
removed = set(old_map) - set(new_map)
added = set(new_map) - set(old_map)
assert removed == set(DELETED), ('unexpected removals', sorted(removed ^ set(DELETED)))
assert not added, ('unexpected additions', sorted(added))
changed = [p for p in new_map if old_map.get(p) != new_map[p]]
assert not changed, ('surviving paths changed content', changed[:10])
print('verify: blobs %d -> %d, removed exactly %s, nothing else touched' % (
    len(old_map), len(new_map), sorted(removed)), file=sys.stderr, flush=True)
assert not any(re.search(r'pipeline|PipelineFlow', p, re.I) for p in new_map), 'pipeline paths linger'
print('DELETE OK', file=sys.stderr, flush=True)
