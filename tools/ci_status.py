#!/usr/bin/env python3
"""Query GitHub Actions check runs for CochraneK/yihot over api.github.com (proxy allows it)."""
import json, os, re, sys, urllib.request
import urllib.error


class _Drop401Redirect(urllib.request.HTTPRedirectHandler):
    """GitHub redirects log downloads to SAS-signed storage; forwarding the
    Authorization header makes storage reject with 401. Strip it on redirect."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        new = super().redirect_request(req, fp, code, msg, headers, newurl)
        if new is not None:
            new.headers.pop("Authorization", None)
            new.unredirected_hdrs.pop("Authorization", None)
        return new


_OPENER = urllib.request.build_opener(_Drop401Redirect)

CFG = os.environ.get("GITHUB_TOKEN_CONFIG") or r"D:\Software\DSH\Novel2game\.git\config"
REPO = "CochraneK/Yi-hot"


def token():
    env = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if env:
        return env.strip()
    txt = open(CFG, encoding="utf-8", errors="replace").read()
    m = re.search(r"://(?:[^@/]+:)?(gho_[A-Za-z0-9]+)@", txt)
    if not m:
        sys.exit("no token found in " + CFG)
    return m.group(1)


def api(path):
    req = urllib.request.Request(
        "https://api.github.com" + path,
        headers={
            "Authorization": "Bearer " + token(),
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "yihot-ci-probe",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def main():
    sha = api(f"/repos/{REPO}/commits/main")["sha"]
    print(f"main HEAD = {sha[:10]}")
    if "--log" in sys.argv:
        runs = api(f"/repos/{REPO}/actions/runs?head_sha={sha}&per_page=100")["workflow_runs"]
        print("runs for head:", len(runs))
        for run in runs:
            js = api(f"/repos/{REPO}/actions/runs/{run['id']}/jobs")["jobs"]
            for j in js:
                print(f"job {j['name']} -> {j['conclusion']} (id {j['id']})")
                if j["conclusion"] in ("failure", "timed_out", "cancelled"):
                    try:
                        req = urllib.request.Request(
                            "https://api.github.com" + f"/repos/{REPO}/actions/jobs/{j['id']}/logs",
                            headers={"Authorization": "Bearer " + token(), "User-Agent": "yihot-ci-probe"},
                        )
                        with _OPENER.open(req, timeout=90) as r:
                            body = r.read().decode("utf-8", "replace")
                        lines = body.splitlines()
                        print(f"  --- {j['name']} log: {len(lines)} lines, tail 160 ---")
                        for ln in lines[-160:]:
                            print("   " + ln)
                    except Exception as e:
                        print(f"  log fetch failed: {type(e).__name__}: {e}")
        return
    if "--steps" in sys.argv:
        runs = api(f"/repos/{REPO}/actions/runs?head_sha={sha}&per_page=100")["workflow_runs"]
        for run in runs:
            print(f"run {run['id']} | {run['name']} | {run['status']}/{run['conclusion']} | {run['created_at']}")
            js = api(f"/repos/{REPO}/actions/runs/{run['id']}/jobs")["jobs"]
            for j in js:
                print(f"  job {j['name']}: {j['status']}/{j['conclusion']}")
                for s in j.get("steps", []):
                    mark = "  " if s["conclusion"] == "success" else ">>"
                    print(f"   {mark} {s['number']:>2}. {s['name']:<52} {s['status']}/{s['conclusion']}")
        return
    runs = api(f"/repos/{REPO}/commits/{sha}/check-runs?per_page=50")["check_runs"]
    print(f"check-runs: {len(runs)}")
    for r in runs:
        print(f"  - {r['name']:<28} status={r['status']:<12} conclusion={r['conclusion']}")
        out = r.get("output") or {}
        if out.get("title"):
            print(f"      title: {out['title']}")
    if "--annots" in sys.argv:
        for r in runs:
            if r.get("conclusion") in ("failure", "timed_out", "cancelled"):
                try:
                    ann = api(f"/repos/{REPO}/check-runs/{r['id']}/annotations")["annotations"]
                except Exception as e:
                    print(f"  [annots {r['name']}] error: {e}")
                    continue
                print(f"--- annotations for {r['name']} ({len(ann)}) ---")
                for a in ann[:12]:
                    print(f"  {a.get('annotation_level')} {a.get('path')}:{a.get('start_line')} :: {(a.get('message') or '')[:220]}")


if __name__ == "__main__":
    main()
