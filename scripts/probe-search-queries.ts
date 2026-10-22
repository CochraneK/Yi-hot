// 只读探测：对指定查询词各跑一次 DeepSeek 网页搜索，打印标题/日期/权威度，供人工逐条判定是否对口。
// 不写库（只会产生 4 条 search 计费收据），不影响任何源。
import { deepseekSearch } from "@aihot/backend/providers/deepseek-tools";

const QUERIES = [
  "儿童 营养 健康 膳食 改善 贫血",
  "教育公平 义务教育 资源 均衡 乡村 薄弱校",
  "婴幼儿 照护 托育 普惠 服务 托位",
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
        console.log(
          `${String(i + 1).padStart(2)}. [a=${h.authority ?? "?"}] ${h.title}\n     ${h.date ?? "?"} | ${h.siteName ?? ""} | ${h.url}`,
        );
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
