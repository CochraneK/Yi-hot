// 爬虫策略：训练型全拒、检索型只放行机器接口、搜索引擎不受影响。
//
// 为什么要测：这份名单同时喂给 robots.txt 和 403 拦截，写错一个字的效果是「静默」的——
// 要么把真搜索引擎挡在门外（收录归零，但页面看着一切正常），要么把本该拒绝的训练爬虫放进来
// （没有任何报错，只是内容被拿去训练了）。两种都只能靠断言发现。
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RETRIEVAL_BOTS,
  RETRIEVAL_BOT_RE,
  SCRAPER_BOTS,
  SCRAPER_BOT_RE,
  TRAINING_BOTS,
  TRAINING_BOT_RE,
  botBlocked,
  classifyBot,
} from "@aihot/contracts/bot-policy";

import { isApiOwned } from "@aihot/contracts/http-policy";

test("检索型放行的正是 isApiOwned 认的机器接口，页面一律不给", () => {
  const ua = "Mozilla/5.0 (compatible; ChatGPT-User/1.0)";
  const open = ["/llms.txt", "/api/v1/items", "/api/mcp", "/feed.xml", "/feed/all.xml", "/openapi-v1.json", "/sitemap.xml", "/items/abc/markdown"];
  for (const pathname of open) {
    assert.equal(isApiOwned(pathname), true, `${pathname} 没被认成机器接口`);
    assert.equal(botBlocked(ua, isApiOwned(pathname)), false, `${pathname} 应该放行给检索型`);
  }
  const pages = ["/", "/all", "/hot", "/about", "/report/daily-2026-11-15"];
  for (const pathname of pages) {
    assert.equal(isApiOwned(pathname), false, `${pathname} 不该被当成机器接口`);
    assert.equal(botBlocked(ua, isApiOwned(pathname)), true, `${pathname} 是页面，应拒绝`);
  }
});

test("训练型爬虫在所有路径上都被拒绝，连 llms.txt 也不给", () => {
  for (const ua of ["GPTBot/1.0", "Mozilla/5.0 (compatible; GPTBot/1.1)", "ClaudeBot/1.0", "CCBot/2.0", "Bytespider"]) {
    assert.equal(classifyBot(ua), "training", ua);
    assert.equal(botBlocked(ua, false), true, `${ua} 应被拒（页面）`);
    assert.equal(botBlocked(ua, true), true, `${ua} 应被拒（接口也一样）`);
  }
});

test("检索型爬虫只拿机器接口，页面照旧 403", () => {
  for (const ua of ["Mozilla/5.0 (compatible; ChatGPT-User/1.0)", "OAI-SearchBot/1.0", "Claude-User/1.0", "PerplexityBot/1.0"]) {
    assert.equal(classifyBot(ua), "retrieval", ua);
    assert.equal(botBlocked(ua, false), true, `${ua} 不该能读页面`);
    assert.equal(botBlocked(ua, true), false, `${ua} 应该能读接口`);
  }
});

test("脚本库的默认 UA 没有正当用途，一律拒绝", () => {
  for (const ua of ["python-requests/2.31", "Go-http-client/1.1", "Java/17.0", "okhttp/4.12", "Scrapy/2.11"]) {
    assert.equal(classifyBot(ua), "generic", ua);
    assert.equal(botBlocked(ua, true), true, `${ua} 连接口也不该放行`);
  }
});

test("常规搜索引擎不在名单里，页面与接口都照常", () => {
  for (const ua of [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0)",
    "Mozilla/5.0 (compatible; Baiduspider/2.0)",
    "Mozilla/5.0 (compatible; YisouSpider/5.0)",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
    "",
  ]) {
    assert.equal(classifyBot(ua), "human", `不该误伤：${ua || "(空 UA)"}`);
    assert.equal(botBlocked(ua, false), false, ua);
  }
});

test("Applebot 是搜索、Applebot-Extended 才是训练，两者不能混", () => {
  assert.equal(classifyBot("Mozilla/5.0 (compatible; Applebot/0.1)"), "human");
  assert.equal(classifyBot("Mozilla/5.0 (compatible; Applebot-Extended/0.1)"), "training");
});

test("ClaudeBot 归训练、Claude-User 与 Claude-Web 归检索", () => {
  assert.equal(classifyBot("ClaudeBot/1.0"), "training");
  assert.equal(classifyBot("Claude-User/1.0"), "retrieval");
  assert.equal(classifyBot("Claude-Web/1.0"), "retrieval");
  assert.equal(classifyBot("Claude-SearchBot/1.0"), "retrieval");
});

test("同一家不能同时出现在两份名单里", () => {
  const training = new Set(TRAINING_BOTS.map((n) => n.toLowerCase()));
  for (const name of [...RETRIEVAL_BOTS, ...SCRAPER_BOTS]) {
    assert.equal(training.has(name.toLowerCase()), false, `${name} 同时被登记为训练型`);
  }
  const seen = new Set<string>();
  for (const name of [...TRAINING_BOTS, ...RETRIEVAL_BOTS, ...SCRAPER_BOTS]) {
    assert.equal(seen.has(name.toLowerCase()), false, `${name} 重复登记`);
    seen.add(name.toLowerCase());
  }
});

test("正则能吃下每个登记名，且不吃掉相邻的近似名", () => {
  for (const name of TRAINING_BOTS) {
    assert.equal(TRAINING_BOT_RE.test(`${name}/1.0`), true, `训练型漏掉 ${name}`);
    assert.equal(SCRAPER_BOT_RE.test(name), false, `训练型 ${name} 被脚本库正则误吞`);
    assert.equal(RETRIEVAL_BOT_RE.test(name), false, `训练型 ${name} 被检索正则误吞`);
  }
  for (const name of SCRAPER_BOTS) {
    assert.equal(SCRAPER_BOT_RE.test(`${name}1.0`), true, `脚本库漏掉 ${name}`);
  }
});
