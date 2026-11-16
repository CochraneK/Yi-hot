// Exercise the production router with an isolated HTTP fixture; no database or third-party requests.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
let web: ChildProcess;
let origin = "";
let logs = "";
const place = { id: "reviewed-outside-dictionary", name: "合成审核城市", countryCode: "CN", region: "合成地区", city: "合成审核城市", lat: 30, lon: 104, precision: "city", count: 7 };
const api = createServer((req,res) => {
  const url = new URL(req.url!, "http://fixture.local");
  res.setHeader("content-type", "application/json");
  if (url.pathname === "/api/site/meta") return res.end(JSON.stringify({ changelogVersion: "test" }));
  if (url.pathname === "/api/site/geo/places") return res.end(JSON.stringify({ places: [place], generatedAt: "test" }));
  if (url.pathname === "/api/site/pool") return res.end(JSON.stringify({ items: [], total: 0, page: 1, pageCount: 1 }));
  res.statusCode = 404; res.end("{}");
});
before(async () => {
  api.listen(0,"127.0.0.1"); await once(api,"listening");
  web = spawn(process.execPath,[fileURLToPath(new URL("../server.ts",import.meta.url))], {
    env: { ...process.env, WEB_PORT: "0", API_BASE_URL: `http://127.0.0.1:${(api.address() as AddressInfo).port}` }, stdio:["ignore","pipe","pipe"],
  });
  await new Promise<void>((resolve,reject) => {
    const timer = setTimeout(() => reject(new Error(logs)),15000);
    web.stderr!.on("data",d => { logs += d; });
    web.stdout!.on("data",d => { logs += d; const m=logs.match(/"msg":"web started","port":(\d+)/); if(m) { clearTimeout(timer); origin=`http://127.0.0.1:${m[1]}`; resolve(); } });
    web.on("exit",() => { clearTimeout(timer); reject(new Error(logs)); });
  });
});
after(async () => { if(web?.exitCode===null) { web.kill(); await once(web,"exit"); } api.closeAllConnections(); await new Promise<void>(r=>api.close(()=>r())); });

// The city page is retired: its picker now lives in the 动态 header, so the old
// address has to keep working as a redirect rather than start 404-ing in bookmarks.
test("a retired city link with a canonical place lands on the filtered feed", async () => {
  const response = await fetch(`${origin}/yihot/cities?place=${place.id}`, { redirect: "manual" });
  assert.equal(response.status, 302);
  const location = response.headers.get("location")!;
  assert.match(location, /\/all\?place=reviewed-outside-dictionary$/);
});
test("a legacy city short id becomes the summary text search it always was", async () => {
  const response = await fetch(`${origin}/yihot/cities?city=chengdu`, { redirect: "manual" });
  assert.equal(response.status, 302);
  assert.match(decodeURIComponent(response.headers.get("location")!), /\/all\?q=成都$/);
});
test("the bare city address falls back to the feed itself", async () => {
  const response = await fetch(`${origin}/yihot/cities`, { redirect: "manual" });
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location")!, /\/all$/);
});
