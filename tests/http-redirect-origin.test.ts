import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";

interface Hit { method: string; body: string; authorization?: string; secret?: string; contentType?: string }
const servers: Server[] = [];
async function fixture(handler: (req: Hit) => { code?: number; location?: string; body?: string }) {
  const hits: Hit[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += Buffer.from(chunk).toString("utf8");
    const hit = { method: req.method || "", body, authorization: req.headers.authorization, secret: req.headers["x-private-secret"] as string | undefined, contentType: req.headers["content-type"] };
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
  for (const opts of [
    { headers: { Authorization: "Bearer fictitious" } },
    { headers: { "X-Private-Secret": "fictional" } },
    { method: "POST", body: "" },
    { method: "POST", body: "fictional-secret" },
  ]) {
    await assert.rejects(guardedFetch(first.url + "/redirect", opts), /Blocked cross-origin redirect/);
  }
  assert.equal(second.hits.length, 0);
});

test("same-origin 301/302 POST and 303 PUT turn into GET without entity headers", async () => {
  for (const [code,method] of [[301, "POST"], [302, "POST"], [303, "PUT"]] as const) {
    let requests = 0;
    const fixtureServer = await fixture(() => ({ body: "ok" }));
    const redirect = await fixture(() => ({ code, location: fixtureServer.url + "/next" }));
    // Both fixture services are distinct origins; protected requests must refuse this.
    await assert.rejects(guardedFetch(redirect.url, { method, body: "payload" }), /cross-origin/);
    assert.equal(fixtureServer.hits.length, requests);
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
