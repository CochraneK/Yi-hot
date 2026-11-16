#!/usr/bin/env python3
"""Read-only report rollout evidence. Does not deploy, generate reports or send email."""
import argparse
import concurrent.futures
import datetime as dt
import hashlib
import json
import re
import subprocess
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
APP_FILES = [
    "apps/web/app/features/report/ReportPaper.tsx", "packages/backend/src/publication/reports.ts",
    "packages/backend/src/reports/compose.ts", "packages/backend/src/reports/insights.ts",
    "packages/backend/src/reports/yesterday-hot.ts", "industry/prompts/report-daily-lead.md",
    "industry/prompts/report-period.md", "industry/features.ts", "apps/worker/src/schedules.ts",
]
MAIL_FILE = "deploy/email-delivery/send_reports.py"

def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def run(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=30, check=True)
    return result.stdout.strip()

def request_json(url):
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "YiHot-Report-Readiness/1.0"})
    with urlopen(request, timeout=15) as response:
        raw = response.read(5 * 1024 * 1024 + 1)
    if len(raw) > 5 * 1024 * 1024: raise ValueError("response too large")
    return json.loads(raw)

def public_evidence(base, fetch=request_json):
    parsed = urlsplit(base)
    if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("base must be an HTTP(S) site URL without credentials, query or fragment")
    output = {}
    def get(kind):
        path = "/api/health" if kind == "health" else f"/api/site/reports/{kind}/latest-page"
        try:
            data = fetch(base.rstrip("/") + path)
            if kind == "health":
                return kind, {"reachable": True, "ok": data.get("ok") is True, "db": data.get("db"), "release": data.get("release")}
            report = data.get("report") or {}
            return kind, {"reachable": True, "key": report.get("key"), "generatedAt": report.get("generatedAt"),
                          "insights": len(report.get("insights") or []), "hasYesterdayHot": bool(report.get("yesterdayHot"))}
        except Exception as error:
            # Avoid logging response bodies, URLs with credentials, recipient data or raw subprocess output.
            return kind, {"reachable": False, "error": type(error).__name__}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        for key, value in executor.map(get, ["health", "weekly", "monthly"]): output[key] = value
    return output

def runtime_evidence(root, mail_path, containers, docker, execute=run):
    evidence = {"app": {"status": "unverified"}, "mail": {"status": "unverified"}}
    # Compare immutable running images, not just an editable /opt/yihot source directory or release label.
    try:
        expected = {name: digest(root / name) for name in APP_FILES}
        images = [execute(docker + ["inspect", "--format", "{{.Image}} {{.State.Running}}", name]).split() for name in containers]
        same_running_image = all(len(v) == 2 and v[1] == "true" for v in images) and len({v[0] for v in images}) == 1
        program = "const fs=require('node:fs'),c=require('node:crypto');let o={};for(const p of JSON.parse(process.argv[1]))o[p]=c.createHash('sha256').update(fs.readFileSync('/app/'+p)).digest('hex');console.log(JSON.stringify(o));"
        actual = json.loads(execute(docker + ["exec", containers[0], "node", "-e", program, json.dumps(APP_FILES)]))
        mismatches = [name for name in APP_FILES if actual.get(name) != expected[name]]
        evidence["app"] = {"status": "verified" if same_running_image and not mismatches else "mismatch",
                           "sameRunningImage": same_running_image, "mismatchedFiles": mismatches}
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        evidence["app"]["error"] = type(error).__name__
    try:
        expected_mail, actual_mail = digest(root / MAIL_FILE), digest(mail_path)
        timer = execute(["systemctl", "is-active", "yihot-email-delivery.timer"]) == "active"
        command = execute(["systemctl", "show", "-p", "ExecStart", "--value", "yihot-email-delivery.service"])
        # The shipped unit invokes this exact Python file; never print a whole unit command or its environment.
        points_to_file = bool(re.search(r"argv\[\]=\S*/python3\s+" + re.escape(str(mail_path)) + r"\s*;", command))
        evidence["mail"] = {"status": "verified" if expected_mail == actual_mail and timer and points_to_file else "mismatch",
                            "scriptMatches": expected_mail == actual_mail, "timerActive": timer,
                            "unitPointsToScript": points_to_file, "expectedSha256": expected_mail, "actualSha256": actual_mail}
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        evidence["mail"]["error"] = type(error).__name__
    return evidence

def result(public, runtime):
    runtime_verified = bool(runtime and all(runtime.get(k, {}).get("status") == "verified" for k in ("app", "mail")))
    public_verified = bool(public.get("health", {}).get("ok") and public.get("health", {}).get("db") == "ok"
                           and all(public.get(k, {}).get("reachable") for k in ("weekly", "monthly")))
    verified = runtime_verified and public_verified
    return {"checkedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "public": public,
            "runtime": runtime or {"app": {"status": "unverified"}, "mail": {"status": "unverified"}},
            "deploymentVerified": verified, "runtimeFilesVerified": runtime_verified,
            "publicReadPathVerified": public_verified, "reportQualityVerified": False,
            "note": "Public DTO reachability/release labels do not verify deployment; old issues may lack new optional fields. Source/image/timer checks do not prove scheduler, SMTP delivery or report quality."}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", required=True, help="public or explicit internal site base, e.g. http://host/yihot")
    parser.add_argument("--source-root", type=Path, default=ROOT, help="trusted, already aligned expected source tree")
    parser.add_argument("--runtime", action="store_true", help="read Docker images/files and the separate mail unit on this host")
    parser.add_argument("--sudo-docker", action="store_true", help="use sudo -n docker for read-only operations")
    parser.add_argument("--api-container", default="aihot-api-1")
    parser.add_argument("--web-container", default="aihot-web-1")
    parser.add_argument("--worker-container", default="aihot-worker-1")
    parser.add_argument("--mail-file", type=Path, default=Path("/opt/yihot-email-delivery/send_reports.py"))
    args = parser.parse_args()
    containers = [args.api_container, args.web_container, args.worker_container]
    if not all(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,100}", name) for name in containers): parser.error("invalid container name")
    public = public_evidence(args.base)
    runtime = runtime_evidence(args.source_root, args.mail_file, containers, ["sudo", "-n", "docker"] if args.sudo_docker else ["docker"]) if args.runtime else None
    evidence = result(public, runtime)
    print(json.dumps(evidence, ensure_ascii=False, indent=2))
    return 0 if evidence["deploymentVerified"] else 2

if __name__ == "__main__":
    raise SystemExit(main())
