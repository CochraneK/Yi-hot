import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { guardedFetch, type GuardedFetchOptions } from "@aihot/backend/lib/http-fetch";

interface Hit { url: string; method: string; body: string; authorization?: string; secret?: string; contentType?: string }
const servers: Server[] = [];
async function fixture(handler: (req: Hit) => { code?: number; location?: string; body?: string }) {
  const hits: Hit[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += Buffer.from(chunk).toString("utf8");
    const hit = { url: req.url || "/", method: req.method || "", body, authorization: req.headers.authorization, secret: req.headers["x-private-secret"] as string | undefined, contentType: req.headers["content-type"] };
    hits.push(hit);
    const result = handler(hit);
    res.writeHead(result.code || 200, result.location ? { location: result.location } : { "content-type": "text/plain" });
    res.end(result.body ?? "ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return { url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, hits };
}
const originalPrivate = config.allowPrivateNetworkFetch;
config.allowPrivateNetworkFetch = true;
after(async () => {
  config.allowPrivateNetworkFetch = originalPrivate;
  await Promise.all(servers.map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); })));
});

test("protected headers and even empty bodies never redirect across origins", async () => {
  const second = await fixture(() => ({ body: "should not arrive" }));
  const first = await fixture(() => ({ code: 307, location: second.url + "/capture" }));
  for (const opts of ([
    { headers: { Authorization: "Bearer fictitious" } },
    { headers: { "X-Private-Secret": "fictional" } },
    { method: "POST", body: "" },
    { method: "POST", body: "fictional-secret" },
  ] as GuardedFetchOptions[])) {
    await assert.rejects(guardedFetch(first.url + "/redirect", opts), /Blocked cross-origin redirect/);
  }
  assert.equal(second.hits.length, 0);
});

test("same-origin redirects preserve or transform method, body and entity headers", async () => {
  for (const code of [301, 302, 303, 307, 308]) {
    const origin = await fixture(hit => hit.url === "/start" ? { code, location: "/finish" } : { body: "ok" });
    const result = await guardedFetch(origin.url + "/start", {
      method: "POST", body: "payload", headers: { Authorization: "Bearer fictitious", "Content-Type": "text/plain" },
    });
    assert.equal(result.status, 200);
    const hit = origin.hits.at(-1)!;
    const converted = [301, 302, 303].includes(code);
    assert.equal(hit.method, converted ? "GET" : "POST");
    assert.equal(hit.body, converted ? "" : "payload");
    assert.equal(hit.authorization, "Bearer fictitious");
    assert.equal(hit.contentType, converted ? undefined : "text/plain");
  }
});
test("PUT on 301 keeps the method but 303 turns into GET", async () => {
  for (const code of [301, 303]) {
    const origin = await fixture(hit => hit.url === "/start" ? { code, location: "/finish" } : { body: "ok" });
    await guardedFetch(origin.url + "/start", { method: "PUT", body: "payload", headers: { "Content-Type": "text/plain" } });
    assert.equal(origin.hits.at(-1)!.method, code === 303 ? "GET" : "PUT");
  }
});

test("a public GET can follow cross-origin redirects; secrets embedded in URL parameters cannot", async () => {
  const target = await fixture(() => ({ body: "done" }));
  const source = await fixture(() => ({ code: 302, location: target.url + "/public" }));
  const publicResult = await guardedFetch(source.url + "/public", { headers: { Accept: "text/plain" } });
  assert.equal(publicResult.status, 200);
  assert.equal(target.hits.length, 1);
  await assert.rejects(guardedFetch(source.url + "/private?api_key=fictitious"), /cross-origin/);
  assert.equal(target.hits.length, 1);
});

test("cross-origin redirects never expose secret query text in errors", async () => {
  const target = await fixture(() => ({ body: "never" }));
  const source = await fixture(() => ({ code: 307, location: target.url + "/secret" }));
  const key = "fictional-sensitive-1234";
  await assert.rejects(guardedFetch(source.url + "/private?token=" + key), (err: Error) => {
    assert.match(err.message, /redirect/); assert.ok(!err.message.includes(key)); return true;
  });
  assert.equal(target.hits.length, 0);
});
