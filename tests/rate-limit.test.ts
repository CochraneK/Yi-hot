// 公开机器接口限流：按地址记账、窗口滑动、内网来源（页面 SSR）不占额度。
//
// 为什么要测：限流写错的两种方式都不报错。额度算错会把正常读者一起挡在门外（页面看着正常，
// API 用户全 429）；跳过内网的条件写反，则页面每次刷新都在消耗访客配额，直到某个时刻整站
// 500/503，却查不出原因。只能靠断言固定住。
import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { isPrivateAddress, lastForwardedAddress } from "@aihot/contracts/net";
import {
  consume,
  rateLimitKeyCount,
  rateRuleFor,
  registerRateLimit,
  resetRateLimit,
} from "../apps/api/src/http/rate-limit.ts";

test("纳入限流的路径：机器接口在内，页面与站点内部接口在外", () => {
  assert.equal(rateRuleFor("/api/v1")?.scope, "API");
  assert.equal(rateRuleFor("/api/v1/items")?.scope, "API");
  assert.equal(rateRuleFor("/api/v1/selected/snapshot")?.scope, "API");
  assert.equal(rateRuleFor("/api/mcp")?.scope, "MCP");
  assert.equal(rateRuleFor("/feed.xml")?.scope, "feed");
  assert.equal(rateRuleFor("/feed/daily.xml")?.scope, "feed");
  assert.equal(rateRuleFor("/sitemap.xml")?.scope, "feed");
  assert.equal(rateRuleFor("/items/pub123/markdown")?.scope, "markdown");
  // 页面渲染用的内部接口不限：一次渲染要连打几个，按访客记账等于让刷新消耗配额。
  assert.equal(rateRuleFor("/api/site/meta"), null);
  assert.equal(rateRuleFor("/api/site/items/abc"), null);
  assert.equal(rateRuleFor("/api/admin/runs"), null);
  assert.equal(rateRuleFor("/api/health"), null);
  assert.equal(rateRuleFor("/yihot/all"), null);
  // 前缀相同的其它路径不能被误收。
  assert.equal(rateRuleFor("/api/v1extra"), null);
  assert.equal(rateRuleFor("/feeds"), null);
});

test("滑动窗口：额度逐条滑出，不是每分钟整点清零", () => {
  resetRateLimit();
  const rule = { scope: "t", limit: 2, windowMs: 60_000 };
  const t0 = 1_000_000;
  assert.equal(consume("k", rule, t0).ok, true);
  assert.equal(consume("k", rule, t0 + 10_000).ok, true);
  const third = consume("k", rule, t0 + 20_000);
  assert.equal(third.ok, false);
  assert.equal(third.retryAfter, 40, "窗口要等最早那条滑出，即 t0+60s");
  // 到 t0+60.001s，第一条过期，重新有额度。
  assert.equal(consume("k", rule, t0 + 60_001).ok, true);
});

test("不同键各自记账，互不牵连", () => {
  resetRateLimit();
  const rule = { scope: "t", limit: 1, windowMs: 60_000 };
  assert.equal(consume("a", rule, 5_000).ok, true);
  assert.equal(consume("b", rule, 5_000).ok, true, "另一来源仍有额度");
  assert.equal(consume("a", rule, 5_000).ok, false);
});

test("键数量有上限，被打散成海量来源时不会无限增长", () => {
  resetRateLimit();
  const rule = { scope: "t", limit: 5, windowMs: 60_000 };
  for (let i = 0; i < 20_050; i++) consume(`ip-${i}`, rule, 1_000_000);
  assert.ok(rateLimitKeyCount() <= 20_000, `键数量应受控，实际 ${rateLimitKeyCount()}`);
});

test("内网来源不消耗额度：页面 SSR 打几百次也照常", async () => {
  resetRateLimit();
  const app = Fastify({ trustProxy: true, logger: false });
  registerRateLimit(app);
  app.post("/api/mcp", async () => ({ ok: true }));
  // inject 的 TCP 对端是 127.0.0.1，且不带 X-Forwarded-For——正是 web 进程 SSR 的形态。
  for (let i = 0; i < 120; i++) {
    const res = await app.inject({ method: "POST", url: "/api/mcp" });
    assert.equal(res.statusCode, 200, `内网第 ${i + 1} 次不该被拦`);
  }
  await app.close();
});

test("公网来源超限后 429，响应是 problem+json 并带 Retry-After", async () => {
  resetRateLimit();
  const app = Fastify({ trustProxy: true, logger: false });
  registerRateLimit(app);
  app.post("/api/mcp", async () => ({ ok: true }));
  const headers = { "x-forwarded-for": "203.0.113.9" };
  const limit = rateRuleFor("/api/mcp")!.limit;
  for (let i = 0; i < limit; i++) {
    const res = await app.inject({ method: "POST", url: "/api/mcp", headers });
    assert.equal(res.statusCode, 200, `第 ${i + 1}/${limit} 次应放行`);
    assert.equal(res.headers["ratelimit-remaining"], String(limit - i - 1));
  }
  const blocked = await app.inject({ method: "POST", url: "/api/mcp", headers });
  assert.equal(blocked.statusCode, 429);
  assert.match(String(blocked.headers["content-type"]), /application\/problem\+json/);
  assert.ok(Number(blocked.headers["retry-after"]) >= 1);
  const body = blocked.json() as { code: string; status: number; retryAfter: number };
  assert.equal(body.code, "rate_limited");
  assert.equal(body.status, 429);
  assert.ok(body.retryAfter >= 1);
  // 同一次里另一个来源不受影响。
  const other = await app.inject({ method: "POST", url: "/api/mcp", headers: { "x-forwarded-for": "198.51.100.7" } });
  assert.equal(other.statusCode, 200);
  await app.close();
});

test("不在名单上的路径连打也不限", async () => {
  resetRateLimit();
  const app = Fastify({ trustProxy: true, logger: false });
  registerRateLimit(app);
  app.get("/api/site/meta", async () => ({ ok: true }));
  const headers = { "x-forwarded-for": "203.0.113.9" };
  for (let i = 0; i < 300; i++) {
    const res = await app.inject({ method: "GET", url: "/api/site/meta", headers });
    assert.equal(res.statusCode, 200);
  }
  await app.close();
});

test("内网判定覆盖容器网段、链路本地与 IPv4-mapped 写法", () => {
  for (const ip of ["127.0.0.1", "::1", "::", "10.1.2.3", "172.17.0.1", "172.31.255.1", "192.168.1.5", "169.254.1.1", "::ffff:172.18.0.2", "fe80::1%eth0", "fd00::1", "fc00::1"]) {
    assert.equal(isPrivateAddress(ip), true, `${ip} 应判为内网`);
  }
  for (const ip of ["203.0.113.9", "8.8.8.8", "172.32.0.1", "172.15.0.1", "2400:3200::1", "", "not-an-ip"]) {
    assert.equal(isPrivateAddress(ip), false, `${ip} 应判为公网`);
  }
});

test("X-Forwarded-For 只认最后一跳：前面写什么都与我们无关", () => {
  assert.equal(lastForwardedAddress("1.2.3.4"), "1.2.3.4");
  assert.equal(lastForwardedAddress("9.9.9.9, 203.0.113.9"), "203.0.113.9");
  assert.equal(lastForwardedAddress("9.9.9.9,::ffff:203.0.113.9"), "203.0.113.9");
  assert.equal(lastForwardedAddress("  1.1.1.1 ,  2.2.2.2 "), "2.2.2.2");
  assert.equal(lastForwardedAddress(undefined), null);
  assert.equal(lastForwardedAddress(""), null);
  assert.equal(lastForwardedAddress(" , "), null);
});
