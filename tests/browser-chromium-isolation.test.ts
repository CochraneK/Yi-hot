// Real Chromium network interception regression. Run inside the isolated Docker CI image.
// Local fixtures only; synthetic policy allows the test's local public-style home page.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import puppeteer from "puppeteer-core";
import { installBrowserRequestGuard, renderBrowser } from "@aihot/backend/lib/browser-render";

test("Chromium refuses loopback before opening the browser", async () => {
  await assert.rejects(renderBrowser("http://127.0.0.1:10081/"), /Blocked/);
});

test("real Chromium aborts a disallowed redirect and subresource before the target receives bytes", async () => {
  const hits: string[] = [];
  const server = createServer((req, res) => {
    const path = new URL(req.url || "/", "http://fixture").pathname;
    hits.push(path);
    if (path === "/start") {
      res.writeHead(302, { location: "/private" });
      res.end();
    } else if (path === "/index") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end('<!doctype html><img src="/private"><main>public fixture</main>');
    } else {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("SECRET_SHOULD_NEVER_REACH");
    }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--no-zygote"],
    protocolTimeout: 30_000,
  });
  try {
    const guard = async (url: string) => {
      const parsed = new URL(url);
      assert.equal(parsed.origin, base, "offline fixture must not leave local isolated server");
      if (parsed.pathname === "/private") throw new Error("synthetic private destination");
    };
    const first = await browser.newPage();
    const verifyFirst = await installBrowserRequestGuard(first, guard);
    await assert.rejects(first.goto(base + "/start", { waitUntil: "domcontentloaded", timeout: 10_000 }));
    await assert.rejects(verifyFirst(), /Blocked outbound browser request/);
    await first.close();
    const second = await browser.newPage();
    const verifySecond = await installBrowserRequestGuard(second, guard);
    await second.goto(base + "/index", { waitUntil: "networkidle2", timeout: 10_000 });
    await assert.rejects(verifySecond(), /Blocked outbound browser request/);
    await second.close();
    assert.deepEqual(hits.filter(p => p === "/private"), [], "forbidden private endpoint must see zero requests");
    assert.ok(hits.includes("/index"));
    assert.ok(hits.includes("/start"));
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
