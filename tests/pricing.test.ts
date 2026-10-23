// 计价：一分钱算错就是整站的成本数错，所以这里把几条最容易错的规则钉住。
// 这些是纯函数，不需要数据库 —— 价格表的读取在 providers/pricing.ts 里是另一个入口。
import assert from "node:assert/strict";
import test from "node:test";
import { costOf, isPeakBeijing, priceFor, tokenCostOf, type PriceRow } from "@aihot/backend/providers/pricing";

const row = (over: Partial<PriceRow> = {}): PriceRow => ({
  service: "llm", model: "deepseek-flash", currency: "CNY",
  input_per_mtok: "1", cached_per_mtok: "0.02", output_per_mtok: "4", per_request: null, ...over,
});
const prices = [row(), row({ model: "deepseek-flash@peak", input_per_mtok: "2", cached_per_mtok: "0.04", output_per_mtok: "8" }), row({ model: "", service: "llm" })];

test("高峰价走 @peak 行，没有这一行就退回主行（等于该服务不分时段）", () => {
  const peak = priceFor("llm", "deepseek-flash", true, prices);
  const off = priceFor("llm", "deepseek-flash", false, prices);
  assert.equal(peak?.input_per_mtok, "2");
  assert.equal(off?.input_per_mtok, "1");
  // 只配了主行的服务，高峰也按主行算 —— 不能因为没配就当成 0 元。
  assert.equal(priceFor("llm", "some-new-model", true, prices)?.model, "");
  assert.equal(priceFor("other", "x", false, prices), null);
});

test("命中与未命中分开计价：输入部分一刀切会高估两倍以上", () => {
  const t = { hit: 600_000, miss: 400_000, out: 100_000 };
  const right = costOf(t, 1, row())!;
  assert.equal(Number(right.amount.toFixed(6)), 0.6 * 0.02 + 0.4 * 1 + 0.1 * 4);
  // 把命中的 60 万 token 也按未命中价算，光输入一项就从 ¥0.412 涨到 ¥1 —— 站点命中率约六成，
  // 这正是「只按未命中价算会高估两倍以上」的出处。
  const missOnly = costOf({ hit: 0, miss: 1_000_000, out: 0 }, 1, row())!;
  const split = costOf({ hit: 600_000, miss: 400_000, out: 0 }, 1, row())!;
  assert.ok(missOnly.amount > split.amount * 2, `missOnly ${missOnly.amount} vs ${split.amount}`);
});

test("价格行缺字段：没有 token 单价也没有按次价就是「不知道多少钱」，不是 0 元", () => {
  assert.equal(costOf({ hit: 1, miss: 1, out: 1 }, 1, null), null);
  assert.equal(costOf({ hit: 1, miss: 1, out: 1 }, 1, row({ input_per_mtok: null, cached_per_mtok: null, output_per_mtok: null })), null);
  // 没有缓存命中单价时，命中部分按未命中价算 —— 那才是实际付的钱。
  const noCacheRate = costOf({ hit: 1_000_000, miss: 0, out: 0 }, 1, row({ cached_per_mtok: null }))!;
  assert.equal(noCacheRate.amount, 1);
  // 按次计费的服务（搜索）不看 token。
  assert.equal(costOf({ hit: 0, miss: 0, out: 0 }, 3, row({ input_per_mtok: null, cached_per_mtok: null, output_per_mtok: null, per_request: "0.005" }))!.amount, 0.015);
});

test("usage 的三分：缺缓存字段时整段输入算未命中；只报命中时用 prompt − hit", () => {
  assert.deepEqual(tokenCostOf({ prompt_tokens: 1000, completion_tokens: 10 }), { hit: 0, miss: 1000, out: 10 });
  assert.deepEqual(tokenCostOf({ prompt_tokens: 1000, prompt_cache_hit_tokens: 640, completion_tokens: 10 }), { hit: 640, miss: 360, out: 10 });
  assert.deepEqual(tokenCostOf({ prompt_tokens: 1000, prompt_cache_hit_tokens: 640, prompt_cache_miss_tokens: 360, completion_tokens: 10 }), { hit: 640, miss: 360, out: 10 });
  assert.deepEqual(tokenCostOf(null), { hit: 0, miss: 0, out: 0 });
});

test("高峰时段是北京工作日 9–12、14–18，其余（含周末）为半价", () => {
  const at = (iso: string) => new Date(iso);
  // 2026-10-22 是周四。
  assert.equal(isPeakBeijing(at("2026-10-22T01:00:00Z")), true); // 北京 09:00
  assert.equal(isPeakBeijing(at("2026-10-22T03:59:00Z")), true); // 北京 11:59
  assert.equal(isPeakBeijing(at("2026-10-22T04:00:00Z")), false); // 北京 12:00
  assert.equal(isPeakBeijing(at("2026-10-22T06:00:00Z")), true); // 北京 14:00
  assert.equal(isPeakBeijing(at("2026-10-22T09:59:00Z")), true); // 北京 17:59
  assert.equal(isPeakBeijing(at("2026-10-22T10:00:00Z")), false); // 北京 18:00
  assert.equal(isPeakBeijing(at("2026-10-24T01:00:00Z")), false); // 周六
  assert.equal(isPeakBeijing(at("2026-10-25T01:00:00Z")), false); // 周日
});
