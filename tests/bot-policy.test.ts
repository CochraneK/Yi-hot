// 爬虫策略：训练型与 SEO 全拒，检索型与脚本客户端只丢页面、接口照给，普通工具不受影响。
//
// 为什么要测：这份名单同时喂给 robots.txt 和 403 拦截，写错一个字的效果是「静默」的——
// 要么把真搜索引擎挡在门外（收录归零，页面看着一切正常），要么把 Python 用户挡在 API 外
// （而 llms.txt 正写着「无需 API Key」）。两种都不报错，只能靠断言发现。
import assert from "node:assert/strict";
import { test } from "node:test";
import { isApiOwned } from "@aihot/contracts/http-policy";
import {
  RETRIEVAL_BOTS,
  RETRIEVAL_BOT_RE,
  SCRIPT_CLIENT_BOTS,
  SCRIPT_CLIENT_BOT_RE,
  SEO_BOTS,
  SEO_BOT_RE,
  TRAINING_BOTS,
  TRAINING_BOT_RE,
  botBlocked,
  classifyBot,
} from "@aihot/contracts/bot-policy";

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

test("脚本客户端（Python / Go / Java）接口照给，只丢页面", () => {
  // 这一条是回归线：llms.txt 承诺「所有接口匿名只读、无需 API Key」，一个 Python 用户照做时
  // 不能在 403 上被拦住。它们失去的只是 HTML。
  for (const ua of ["python-requests/2.31.0", "Python-urllib/3.11", "Go-http-client/1.1", "Java/17.0", "Java-http-client/17", "okhttp/4.12", "Scrapy/2.11"]) {
    assert.equal(classifyBot(ua), "script", ua);
    assert.equal(botBlocked(ua, true), false, `${ua} 应该能读接口`);
    assert.equal(botBlocked(ua, false), true, `${ua} 不该能读页面`);
  }
});

test("SEO 审计工具全拒——他们只要 HTML，接口对他们没有意义", () => {
  for (const ua of ["Mozilla/5.0 (compatible; SemrushBot/7~bl)", "Mozilla/5.0 (compatible; AhrefsBot/7.0)", "PetalBot", "MJ12bot/v1.4.8"]) {
    assert.equal(classifyBot(ua), "seo", ua);
    assert.equal(botBlocked(ua, true), true, `${ua} 接口也不该放行`);
    assert.equal(botBlocked(ua, false), true, `${ua} 页面应拒绝`);
  }
});

test("无头浏览器放行——自动化读页面是正当用途", () => {
  // 我们自己截一次图就被这条规则挡过（Access denied），最后只好伪造普通 Chrome 的 UA。
  // 拦住的是诚实的人，改一个字段就绕过。
  for (const ua of [
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Unknown; Linux x86_64) AppleWebKit/538.1 (KHTML, like Gecko) PhantomJS/2.1.1 Safari/538.1",
  ]) {
    assert.equal(classifyBot(ua), "human", ua);
    assert.equal(botBlocked(ua, false), false, ua);
  }
});

test("常规搜索引擎与常用工具不在名单里，页面与接口都照常", () => {
  for (const ua of [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0)",
    "Mozilla/5.0 (compatible; Baiduspider/2.0)",
    "Mozilla/5.0 (compatible; YisouSpider/5.0)",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
    "curl/8.5.0",
    "Wget/1.21.4",
    "PostmanRuntime/7.36.0",
    "node",
    "reqwest/0.12",
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
  const seen = new Set<string>();
  for (const name of [...TRAINING_BOTS, ...RETRIEVAL_BOTS, ...SCRIPT_CLIENT_BOTS, ...SEO_BOTS]) {
    assert.equal(seen.has(name.toLowerCase()), false, `${name} 重复登记`);
    seen.add(name.toLowerCase());
  }
});

test("正则能吃下每个登记名，且不吃掉相邻的近似名", () => {
  for (const name of TRAINING_BOTS) {
    assert.equal(TRAINING_BOT_RE.test(`${name}/1.0`), true, `训练型漏掉 ${name}`);
    assert.equal(SEO_BOT_RE.test(name), false, `训练型 ${name} 被 SEO 正则误吞`);
    assert.equal(RETRIEVAL_BOT_RE.test(name), false, `训练型 ${name} 被检索正则误吞`);
    assert.equal(SCRIPT_CLIENT_BOT_RE.test(name), false, `训练型 ${name} 被脚本正则误吞`);
  }
  for (const name of SEO_BOTS) {
    assert.equal(SEO_BOT_RE.test(`${name}/1.0`), true, `SEO 漏掉 ${name}`);
    assert.equal(TRAINING_BOT_RE.test(name), false, `SEO ${name} 被训练正则误吞`);
  }
  for (const name of SCRIPT_CLIENT_BOTS) {
    assert.equal(SCRIPT_CLIENT_BOT_RE.test(`${name}1.0`), true, `脚本客户端漏掉 ${name}`);
    assert.equal(TRAINING_BOT_RE.test(name), false, `脚本客户端 ${name} 被训练正则误吞`);
  }
});
