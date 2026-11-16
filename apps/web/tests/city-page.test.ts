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
const requested: string[] = [];
const place = { id: "reviewed-outside-dictionary", name: "合成审核城市", countryCode: "CN", region: "合成地区", city: "合成审核城市", lat: 30, lon: 104, precision: "city", count: 7 };
const api = createServer((req,res) => {
  const url = new URL(req.url!, "http://fixture.local"); requested.push(url.pathname + url.search);
  res.setHeader("content-type", "application/json");
  if (url.pathname === "/api/site/meta") return res.end(JSON.stringify({ changelogVersion: "test" }));
  if (url.pathname === "/api/site/geo") return res.end(JSON.stringify({ placeId: "", items: [], places: [place], catalog: [place], placesTruncated: false, catalogTruncated: false, totalCapped: false, total: 7, page: 1, pageCount: 1, generatedAt: "test" }));
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
test("city landing defaults to reviewed global index and keeps a usable non-map list", async () => {
  const response = await fetch(`${origin}/yihot/cities`);
  assert.equal(response.status,200);
  const html = await response.text();
  assert.match(html,/合成审核城市/); assert.match(html,/加载交互地图/); assert.match(html,/国家或地区/); assert.match(html,/看附近新闻/);
  assert.ok(requested.some(u=>u.startsWith("/api/site/geo?")));
  assert.ok(!requested.some(u=>u.startsWith("/api/site/pool")));
});
test("country, region, canonical place, radius and pagination reach the server without page-only filtering",async()=> {
  const query = new URLSearchParams({country:"CN",region:"合成地区",place:place.id,lat:"30",lon:"104",radius:"100",page:"2"});
  assert.equal((await fetch(`${origin}/yihot/cities?${query}`)).status,200);
  const seen = new URL(requested.filter(u=>u.startsWith("/api/site/geo")).at(-1)!,"http://fixture.local");
  for(const [k,v] of query) assert.equal(seen.searchParams.get(k),v);
});
test("old city links remain text-clue searches and do not claim confirmed event locations",async()=> {
  const response=await fetch(`${origin}/yihot/cities?city=chengdu`);
  assert.equal(response.status,200); assert.match(await response.text(),/不进入新闻地图/);
  assert.ok(requested.some(u=>u.startsWith("/api/site/pool?")&&new URL(u,"http://fixture.local").searchParams.get("q")==="成都"));
});
