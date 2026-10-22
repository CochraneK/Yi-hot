// 探针 v2：验证「儿童营养」优化词 + 看全「流动儿童」结果。只读，产生计费收据。
import { deepseekSearch } from "@aihot/backend/providers/deepseek-tools";

const QUERIES = [
  "学生营养改善计划 农村 儿童 营养 改善 项目 政策",
  "困境儿童 营养 改善 项目 政策 公益",
  "流动儿童 随迁子女 入学 城市 公办",
];

const BJ = 8 * 3600_000;
const bjDay = (now = Date.now()) => new Date(now + BJ).toISOString().slice(0, 10);
const minusDays = (ymd: string, days: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

async function main() {
  const window = bjDay();
  const since = minusDays(window, 7);
  for (const q of QUERIES) {
    const query = `${q} after:${since}`;
    console.log(`\n===== QUERY: ${q} =====`);
    try {
      const res = await deepseekSearch({ query, count: 20, window: `${window}:${since}`, subject: "probe" });
      console.log(`raw hits: ${res.hits.length}`);
      res.hits.slice(0, 20).forEach((h, i) => {
        console.log(`${String(i + 1).padStart(2)}. [a=${h.authority ?? "?"}] ${h.title}\n     ${h.date ?? "?"} | ${h.siteName ?? ""} | ${h.url}`);
      });
    } catch (e) {
      console.log(`ERROR: ${String(e).slice(0, 300)}`);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
