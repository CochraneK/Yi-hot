"""Render the migrated report end-to-end with *only synthetic article text*.

Requires tools/wechat-analysis/requirements.txt (separate CI job).
"""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / "tools" / "wechat-analysis" / "text_mining.py"

TOPICS = (
    "红树林 湿地修复 鸟类迁徙 海洋保护 自然教育 生态调查",
    "城市助老 医疗救助 社区互助 居家照护 失能家庭 健康支持",
    "乡村教育 教师培训 儿童发展 学习机会 教育公平 阅读推广",
    "资金透明 社会捐赠 年度审计 财务公开 披露制度 透明治理",
    "公益数字化 数据可视化 志愿管理 数字能力 公益平台 技术创新",
    "灾害应对 应急救援 物资分发 人道救助 医疗援助 社区恢复",
)


class WeChatFullRenderTests(unittest.TestCase):
    def test_report_and_12_to_14_charts(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            corpus = root / "input"
            output = root / "report"
            corpus.mkdir()
            for year in range(2018, 2024):
                for month in range(1, 13):
                    topic = TOPICS[(month + year) % len(TOPICS)]
                    title = f"合成测试_{year}_{month}研究项目"
                    body = ((topic + " 经验总结 证据核验 现场记录\n") * 10) + topic
                    (corpus / f"{year}-{month:02d}-01_{title}.txt").write_text(body, encoding="utf-8")
            p = subprocess.run(
                [sys.executable, str(ENGINE), "--input", str(corpus), "--output", str(output),
                 "--config", str(ROOT / "tools" / "wechat-analysis" / "config.example.json")],
                capture_output=True, text=True, timeout=330,
            )
            self.assertEqual(p.returncode, 0, p.stdout[-1500:] + "\n" + p.stderr[-2500:])
            report = output / "report.html"
            self.assertTrue(report.exists())
            self.assertIn("公众号", report.read_text(encoding="utf-8"))
            self.assertGreaterEqual(len(list(output.glob("*.png"))), 12)
            summary = json.loads((output / "summary.json").read_text(encoding="utf-8"))
            self.assertEqual(summary["total_articles"], 72)
            self.assertEqual(summary["years"], [2018, 2019, 2020, 2021, 2022, 2023])


if __name__ == "__main__":
    unittest.main()
