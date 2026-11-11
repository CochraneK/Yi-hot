// Offline browser egress regression: synthetic Puppeteer requests, no external network.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Page } from "puppeteer-core";
import { installBrowserRequestGuard } from "@aihot/backend/lib/browser-render";

type RequestHandler = (request: {
  url(): string;
  continue(): Promise<void>;
  abort(reason: string): Promise<void>;
}) => void;

function pageFixture() {
  let handler: RequestHandler | undefined;
  const page = {
    async setRequestInterception(enabled: boolean) { assert.equal(enabled, true); },
    on(type: string, callback: RequestHandler) {
      assert.equal(type, "request");
      handler = callback;
    },
  } as unknown as Page;
  const calls: string[] = [];
  const emit = (url: string, label: string) => {
    assert.ok(handler);
    handler!({
      url: () => url,
      continue: async () => { calls.push("continue:" + label); },
      abort: async (reason: string) => { assert.equal(reason, "blockedbyclient"); calls.push("abort:" + label); },
    });
  };
  return { page, calls, emit };
}

test("request interception waits for asynchronous guard before allowing navigation", async () => {
  const fixture = pageFixture();
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  const done = await installBrowserRequestGuard(fixture.page, async () => gate);
  fixture.emit("https://public.example.org/", "navigation");
  await Promise.resolve();
  assert.deepEqual(fixture.calls, [], "must not continue while DNS is pending");
  finish();
  await done();
  assert.deepEqual(fixture.calls, ["continue:navigation"]);
});

test("blocked redirect and subresource prevent a successful render", async () => {
  const fixture = pageFixture();
  const seen: string[] = [];
  const done = await installBrowserRequestGuard(fixture.page, async (url) => {
    seen.push(url);
    if (url.includes("127.0.0.1") || url.includes("metadata")) throw Error("private network");
  });
  fixture.emit("https://public.example.org/", "main");
  fixture.emit("http://127.0.0.1:9000/secret", "redirect");
  fixture.emit("http://metadata.google.internal/latest", "subresource");
  await assert.rejects(done(), /Blocked outbound browser request/);
  assert.deepEqual(fixture.calls.sort(), ["abort:redirect", "abort:subresource", "continue:main"].sort());
  assert.equal(seen.length, 3);
});

test("rejection also fails closed if navigation was otherwise successful", async () => {
  const fixture = pageFixture();
  const done = await installBrowserRequestGuard(fixture.page, async (url) => {
    if (url.includes("private")) throw Error("denied");
  });
  fixture.emit("https://public.example.org/robots.txt", "main");
  fixture.emit("https://private.example.org/script.js", "script");
  await assert.rejects(done(), /Blocked outbound browser request/);
});
