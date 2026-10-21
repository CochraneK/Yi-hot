"""Offline regression tests. Never accesses Tencent Cloud, Docker or real API keys."""
import importlib.util
import unittest
from pathlib import Path

file = Path(__file__).resolve().parents[1] / "tools" / "switch_deepseek_flash.py"
spec = importlib.util.spec_from_file_location("switch_deepseek_flash", file)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

BASE = (
    "# existing secret config\n"
    "LLM_BASE_URL=https://api.deepseek.com/v1\n"
    "LLM_API_KEY=sk-NOT-A-REAL-KEY\n"
    "LLM_MODEL=deepseek-chat\n"
    "LLM_EXTRA_JSON={'thinking':{'type':'enabled'}}\n"
    "SESSION_SECRET=DO_NOT_CHANGE\n"
)


class FlashMigrationTests(unittest.TestCase):
    def test_switch_and_preserve_other_settings(self):
        result, overrides = module.migrate_env(BASE)
        self.assertIn("LLM_MODEL=deepseek-flash\n", result)
        self.assertIn('LLM_EXTRA_JSON={"thinking":{"type":"disabled"}}\n', result)
        self.assertIn("LLM_API_KEY=sk-NOT-A-REAL-KEY", result)
        self.assertIn("SESSION_SECRET=DO_NOT_CHANGE", result)
        self.assertEqual(overrides, ())
        self.assertEqual(result.count("LLM_MODEL="), 1)
        self.assertEqual(module.migrate_env(result)[0], result, "idempotent")

    def test_append_missing_thinking_parameter(self):
        raw = BASE.replace("LLM_EXTRA_JSON={'thinking':{'type':'enabled'}}\n", "")
        result, _ = module.migrate_env(raw)
        self.assertIn('LLM_EXTRA_JSON={"thinking":{"type":"disabled"}}', result)
        self.assertNotIn("deepseek-chat", result)

    def test_leave_per_capability_overrides_intact(self):
        result, overrides = module.migrate_env(BASE + "REPORT_MODEL=glm-5.3-flash\n")
        self.assertIn("REPORT_MODEL=glm-5.3-flash", result)
        self.assertEqual(overrides, ("REPORT_MODEL",))

    def test_reject_other_base_url_and_missing_key(self):
        with self.assertRaisesRegex(ValueError, "不是官方 DeepSeek"):
            module.migrate_env(BASE.replace("https://api.deepseek.com/v1", "https://not-deepseek.example/v1"))
        with self.assertRaisesRegex(ValueError, "LLM_API_KEY"):
            module.migrate_env(BASE.replace("LLM_API_KEY=sk-NOT-A-REAL-KEY", "LLM_API_KEY="))

    def test_reject_duplicate_model_variable(self):
        with self.assertRaisesRegex(ValueError, "重复"):
            module.migrate_env(BASE + "LLM_MODEL=another-model\n")

    def test_ignore_commented_keys(self):
        raw = BASE.replace("LLM_MODEL=deepseek-chat", "# LLM_MODEL=ignore\nLLM_MODEL=deepseek-chat")
        result, _ = module.migrate_env(raw)
        self.assertIn("# LLM_MODEL=ignore", result)
        self.assertIn("LLM_MODEL=deepseek-flash", result)

    def test_support_quoted_env_key(self):
        raw = BASE.replace("LLM_API_KEY=sk-NOT-A-REAL-KEY", "LLM_API_KEY='sk-NOT-A-REAL-KEY'")
        result, _ = module.migrate_env(raw)
        self.assertIn("LLM_API_KEY='sk-NOT-A-REAL-KEY'", result)


if __name__ == "__main__":
    unittest.main()
