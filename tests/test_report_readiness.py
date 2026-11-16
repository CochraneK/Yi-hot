"""Read-only rollout and offline preview checks. No Docker, SMTP, IMAP or live HTTP."""
import importlib.util
import io
from contextlib import redirect_stdout
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
ROOT = pathlib.Path(__file__).resolve().parents[1]

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

mail = load("preview_mail", ROOT / "deploy/email-delivery/send_reports.py")
check = load("report_rollout_check", ROOT / "scripts/check_report_deployment.py")
layout = load("mail_layout_fixture", ROOT / "tests/test_report_email_layout.py")

class PreviewTests(unittest.TestCase):
    def test_cli_generates_preview_without_delivery_state_or_any_network(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = pathlib.Path(tmp)
            source = tmp / "dto.json"
            source.write_text(json.dumps({"report": layout.fixture()}, ensure_ascii=False))
            out = tmp / "preview"
            with patch.object(mail, "send", side_effect=AssertionError("SMTP used")), \
                 patch.object(mail, "api", side_effect=AssertionError("outbox used")), \
                 patch.object(mail, "brief_for", side_effect=AssertionError("model used")), \
                 patch.object(mail, "load_state", side_effect=AssertionError("state read")), \
                 patch.object(mail, "urlopen", side_effect=AssertionError("HTTP used")):
                result = mail.preview_from_json(source, out, "https://reports.example.org/yihot")
            self.assertFalse(result["sent"])
            self.assertEqual(result["modelCalls"], 0)
            body = pathlib.Path(result["html"]).read_text()
            self.assertLess(body.index("00 · 本期分析"), body.index("01 · 昨日热榜"))
            self.assertIn("05 · 邻域", body)
            with self.assertRaises(FileExistsError): mail.preview_from_json(source, out, "https://reports.example.org/yihot")
            with patch.object(sys, "argv", ["send_reports.py", "--preview-json", str(source), "--preview-dir", str(tmp / "cli"), "--preview-base", "https://reports.example.org/yihot"]), \
                 patch.object(mail, "load_state", side_effect=AssertionError("CLI read state")), \
                 patch.object(mail, "send", side_effect=AssertionError("CLI sent mail")), \
                 patch.object(mail, "brief_for", side_effect=AssertionError("CLI called model")):
                mail.main()

    def test_real_test_mode_requires_one_explicit_recipient_and_ignores_all_subscription_lists(self):
        for argv in (["--test"], ["--test", "--test-to", "a@example.org,b@example.org"],
                     ["--test", "--test-to", "a@example.org\nBcc:other@example.org"],
                     ["--test", "--test-to", "group:a@example.org"],
                     ["--test", "--test-to", "Name <a@example.org>"],
                     ["--test-to", ""], ["--preview-base", ""], ["--preview-dir", ""],
                     ["--kind", "weekly"], ["--initialize", "--kind", "monthly"],
                     ["--test-to", "a@example.org"]):
            with patch.object(sys, "argv", ["send_reports.py", *argv]), \
                 patch.object(mail, "fetch_latest", side_effect=AssertionError("invalid mode fetched data")), \
                 patch.object(mail, "send", side_effect=AssertionError("invalid mode sent mail")), \
                 patch.object(mail, "load_state", side_effect=AssertionError("invalid mode read production state")), \
                 patch.object(mail, "process_outbox", side_effect=AssertionError("invalid mode claimed subscribers")), \
                 patch.dict(mail.os.environ, {"EMAIL_DELIVERY_ENABLED": "true"}), \
                 redirect_stdout(io.StringIO()), patch("sys.stderr", new_callable=io.StringIO):
                with self.assertRaises(SystemExit) as error: mail.main()
                self.assertEqual(error.exception.code, 2)
        with patch.object(sys, "argv", ["send_reports.py", "--test", "--test-to", "controlled@example.org"]), \
             patch.dict(mail.os.environ, {"EMAIL_TO": "subscriber-a@example.org,subscriber-b@example.org"}), \
             patch.object(mail, "fetch_latest", return_value=layout.fixture(with_insights=False)), \
             patch.object(mail, "load_state", side_effect=AssertionError("test read production state")), \
             patch.object(mail, "process_outbox", side_effect=AssertionError("test touched subscribers")), \
             patch.object(mail, "brief_for", side_effect=AssertionError("test called model")), \
             patch.object(mail, "send") as send, redirect_stdout(io.StringIO()):
            mail.main()
        self.assertEqual(send.call_count, 1)
        self.assertEqual(send.call_args.args[3], "controlled@example.org")

    def test_invalid_kind_key_url_and_conflicting_modes_cannot_write_or_send(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = pathlib.Path(tmp)
            source = tmp / "dto.json"
            for kind, key in [("daily", "../escape"), ("weekly", "2026-W99"), ("monthly", "2026-13"), ("other", "2026-01")]:
                source.write_text(json.dumps({"kind": kind, "key": key}))
                with self.assertRaises(ValueError): mail.preview_from_json(source, tmp / "out", "https://example.org")
                self.assertFalse((tmp / "out").exists())
            source.write_text(json.dumps(layout.fixture()))
            with self.assertRaises(ValueError): mail.preview_from_json(source, tmp / "out", "javascript:bad")
            process = subprocess.run([sys.executable, str(ROOT / "deploy/email-delivery/send_reports.py"), "--test", "--preview-json", str(source), "--preview-dir", str(tmp / "out")], capture_output=True)
            self.assertEqual(process.returncode, 2)
            self.assertFalse((tmp / "out").exists())

class DeploymentTests(unittest.TestCase):
    def test_public_old_reports_are_not_treated_as_proof_of_rollout_or_as_corrupt(self):
        def fixture(url):
            if url.endswith("health"): return {"ok": True, "db": "ok", "release": "old-label"}
            return {"report": {"key": "2026-W46", "generatedAt": "2026-11-16T00:00:00Z"}}
        public = check.public_evidence("http://example.org/yihot", fixture)
        self.assertEqual(public["weekly"]["insights"], 0)
        evidence = check.result(public, None)
        self.assertTrue(evidence["publicReadPathVerified"])
        self.assertFalse(evidence["deploymentVerified"])
        self.assertFalse(evidence["reportQualityVerified"])
        with self.assertRaises(ValueError): check.public_evidence("https://user:secret@example.org", fixture)

    def test_runtime_checks_each_role_web_build_and_loaded_file_freshness(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            for name in check.APP_FILES + [check.MAIL_FILE, "apps/web/build/server/index.js", "apps/web/build/client/assets/main.js"]:
                path = root / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_text("expected source")
            deployed = root / "deployed-mail.py"; deployed.write_text("expected source")
            calls = []
            stale = {}
            def command(args):
                calls.append(args)
                if "inspect" in args:
                    entry = {"api": "apps/api/src/main.ts", "web": "apps/web/server.ts", "worker": "apps/worker/src/main.ts"}[args[-1]]
                    return json.dumps({"image": "sha256:matching-image", "running": True, "startedAt": "2026-11-16T08:00:00Z", "cmd": ["node", entry], "workingDir": "/app"})
                if "exec" in args:
                    container = args[args.index("exec") + 1]
                    hashes = {name: check.digest(root / name) for name in json.loads(args[-1])}
                    if container == stale.get("container") and stale.get("path"): hashes[stale["path"]] = "old-bytes"
                    return json.dumps({"hashes": hashes, "newestCtimeMs": 1794816005000 if container == stale.get("patched") else 1794729600000})
                if "is-active" in args: return "active"
                if "show" in args: return "{ argv[]=/usr/bin/python3 " + str(deployed) + " ; }"
                raise AssertionError(args)
            evidence = check.runtime_evidence(root, deployed, ["api", "web", "worker"], ["docker"], command)
            self.assertEqual(evidence["app"]["status"], "verified")
            self.assertEqual(evidence["mail"]["status"], "verified")
            self.assertEqual([r["role"] for r in evidence["app"]["roles"]], ["api", "web", "worker"])
            for container, path in [("web", "apps/web/app/features/report/ReportPaper.tsx"), ("worker", "packages/backend/src/reports/compose.ts"), ("web", "apps/web/build/server/index.js"), ("web", "apps/web/build/client/assets/main.js")]:
                stale.update(container=container, path=path)
                self.assertEqual(check.runtime_evidence(root, deployed, ["api", "web", "worker"], ["docker"], command)["app"]["status"], "mismatch")
            stale.clear(); stale["patched"] = "web"
            self.assertEqual(check.runtime_evidence(root, deployed, ["api", "web", "worker"], ["docker"], command)["app"]["status"], "mismatch")
            stale.clear(); deployed.write_text("old renderer")
            self.assertEqual(check.runtime_evidence(root, deployed, ["api", "web", "worker"], ["docker"], command)["mail"]["status"], "mismatch")
            (root / "apps/web/build/server/index.js").unlink()
            self.assertEqual(check.runtime_evidence(root, deployed, ["api", "web", "worker"], ["docker"], command)["app"]["status"], "unverified")
            self.assertTrue(all("restart" not in c and "up" not in c and "start" not in c and "psql" not in c for c in calls))
            self.assertFalse(check.result({"health": {"ok": False}}, evidence)["deploymentVerified"])
            def missing(args): raise FileNotFoundError("no runtime")
            unavailable = check.runtime_evidence(root, deployed, ["api", "web", "worker"], ["docker"], missing)
            self.assertEqual(unavailable["app"]["status"], "unverified")
            self.assertEqual(unavailable["mail"]["status"], "unverified")

if __name__ == "__main__": unittest.main()
