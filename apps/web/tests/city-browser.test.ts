// Real headless Chromium regression against the built site and synthetic HTTP data.
// Requests to map/IP providers are intercepted locally; no live news, IP lookup or external tiles.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import puppeteer from "puppeteer-core";
const executable = process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium";

test("mobile/desktop map, filtering, IP opt-in, local badges and repeated map lifecycle", { skip: process.env.CITY_BROWSER_TEST !== "1", timeout: 60000 }, async () => {
  assert.ok(existsSync(executable), "CITY_BROWSER_TEST requires Chromium in the isolated runner");
  const places = [
    { id: "beijing", name: "北京", countryCode: "CN", region: "北京", city: "北京", lat: 39.904, lon: 116.407, precision: "city", count: 1 },
    { id: "chengdu", name: "成都", countryCode: "CN", region: "四川", city: "成都", lat: 30.572, lon: 104.067, precision: "city", count: 1 },
  ];
  const items = ["北京社区项目", "成都社区项目", "北京大学在外地的项目"].map((title,i)=>({
    id: `synthetic-${i}`, title, summary: "仅用于测试的合成新闻", eventPlaces: i < 2 ? [places[i]] : [],
    source: { name: "合成信源" }, publishedAt: "2026-11-16T00:00:00Z", publishedAtPrecision: "datetime",
    discoveredAt: "2026-11-16T00:00:00Z", timelineAt: "2026-11-16T00:00:00Z", category: "project", tags: [], score: 70, selected: false, channel: "news", x: null,
  }));
  const api = createServer((req,res)=> {
    const u=new URL(req.url!,"http://fixture"); res.setHeader("content-type","application/json");
    if(u.pathname==="/api/site/meta") return res.end(JSON.stringify({changelogVersion:"test"}));
    if(u.pathname==="/api/site/geo") {
      const scoped=places.filter(p=>(!u.searchParams.get("place")||p.id===u.searchParams.get("place"))&&(!u.searchParams.get("region")||p.region===u.searchParams.get("region")));
      return res.end(JSON.stringify({placeId:u.searchParams.get("place")||"",items:items.filter(i=>i.eventPlaces.some(p=>scoped.some(s=>s.id===p!.id))),places:scoped,catalog:places,total:scoped.length,page:1,pageCount:1,placesTruncated:false,catalogTruncated:false,totalCapped:false,generatedAt:"test"}));
    }
    if(u.pathname==="/api/site/pool") return res.end(JSON.stringify({items,total:3,page:1,pageCount:1}));
    res.statusCode=404;res.end("{}");
  });
  api.listen(0,"127.0.0.1"); await once(api,"listening");
  let logs="";
  const web=spawn(process.execPath,[fileURLToPath(new URL("../server.ts",import.meta.url))],{env:{...process.env,WEB_PORT:"0",API_BASE_URL:`http://127.0.0.1:${(api.address() as AddressInfo).port}`},stdio:["ignore","pipe","pipe"]});
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  try {
    const origin=await new Promise<string>((resolve,reject)=> {
      const timer=setTimeout(()=>reject(new Error(logs)),15000);
      web.stderr!.on("data",d=>{logs+=d;});
      web.stdout!.on("data",d=>{logs+=d;const m=logs.match(/"msg":"web started","port":(\d+)/);if(m){clearTimeout(timer);resolve(`http://127.0.0.1:${m[1]}`);}});
      web.on("exit",()=>{clearTimeout(timer);reject(new Error(logs));});
    });
    browser=await puppeteer.launch({executablePath:executable,headless:true,args:["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--no-zygote"]});
    const page=await browser.newPage();
    const errors: string[]=[]; const outside: string[]=[];
    page.on("pageerror",e=>errors.push(String(e)));
    await page.setRequestInterception(true);
    page.on("request",request=>{
      if(request.url().startsWith(origin+"/") || request.url().startsWith("data:")) return void request.continue();
      outside.push(request.url());
      if(request.url().startsWith("https://ipwho.is/")) return void request.respond({status:200,contentType:"application/json",headers:{"access-control-allow-origin":"*"},body:JSON.stringify({success:true,city:"Beijing",region:"Beijing",country_code:"CN"})});
      if(request.url().startsWith("https://tile.openstreetmap.org/")) return void request.respond({status:200,contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e8eff0"/></svg>'});
      void request.abort();
    });
    await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
    await page.goto(origin+"/yihot/cities",{waitUntil:"networkidle0"});
    assert.equal(outside.length,0,"opening the page must not load maps or resolve the visitor IP");
    assert.ok(await page.$('[data-item-id="synthetic-0"]'), "fixture article should be SSR-rendered before selecting a city");
    await page.select("#my-city","beijing");
    try {
      await page.waitForFunction(()=>document.querySelector('[data-item-id="synthetic-0"]')?.textContent?.includes("当地"),{timeout:9000});
    } catch (error) {
      const diagnostics = await page.evaluate(() => ({
        url: location.href,
        select: (document.querySelector("#my-city") as HTMLSelectElement | null)?.value,
        readerLocation: localStorage.getItem("yihot:reader-location:v2"),
        legacyCity: localStorage.getItem("yihot:reader-city:v1"),
        articleText: document.querySelector('[data-item-id="synthetic-0"]')?.textContent?.slice(0,400),
        cards: document.querySelectorAll("article[data-item-id]").length,
        reactScripts: document.querySelectorAll('script[type="module"]').length,
      }));
      throw new Error("City selection failed to update local event badge; " + JSON.stringify({
        diagnostics, pageErrors: errors, upstreamRequests: outside.slice(0,12), webLog: logs.slice(-1500),
      }), { cause: error });
    }
    assert.ok(!(await page.$eval('[data-item-id="synthetic-1"]',e=>e.textContent)).includes("当地"));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),"mobile must not scroll sideways");
    await page.locator('::-p-text(加载交互地图)').click();
    await page.waitForSelector(".leaflet-marker-icon");
    await page.waitForFunction(()=>document.querySelectorAll(".leaflet-tile").length>0);
    assert.ok(outside.some(u=>u.startsWith("https://tile.openstreetmap.org/")));
    assert.equal(await page.$eval(".leaflet-tile",e=>e.getAttribute("referrerpolicy")),"strict-origin-when-cross-origin");
    await page.tap('.leaflet-marker-icon[title="北京：1条新闻"]');
    await page.waitForSelector(".leaflet-popup");
    // On phones the fixed bottom navigation can cover part of a popup when the
    // map is near the fold. Scroll the button into the visible viewport before tapping.
    // A covered control is a real mobile accessibility failure, not a timeout to ignore.
    await page.$eval(".leaflet-popup button", el => el.scrollIntoView({ block: "center", behavior: "instant" }));
    const popupTarget = await page.$eval(".leaflet-popup button", el => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        visible: r.top >= 0 && r.bottom <= window.innerHeight,
        hittable: !!(top === el || (top instanceof Element && top.closest(".leaflet-popup button") === el)),
        covering: top?.closest("a,button,nav")?.outerHTML.slice(0,250) ?? top?.tagName ?? null,
      };
    });
    assert.ok(popupTarget.visible && popupTarget.hittable,
      "map popup action must be uncovered on a 390px phone: " + JSON.stringify(popupTarget));
    await page.locator(".leaflet-popup button").click();
    try {
      await page.waitForFunction(()=>location.search.includes("place=beijing"),{timeout:9000});
    } catch (error) {
      const diagnostics = await page.evaluate(() => ({
        url: location.href,
        popup: document.querySelector(".leaflet-popup")?.textContent,
        popupButtons: [...document.querySelectorAll(".leaflet-popup button")].map(x=>x.textContent),
        articleIds: [...document.querySelectorAll("article[data-item-id]")].map(x=>x.getAttribute("data-item-id")),
      }));
      throw new Error("Map popup click did not navigate to verified place; " +
        JSON.stringify({diagnostics, pageErrors:errors, webLog:logs.slice(-1500)}), {cause:error});
    }
    await page.waitForFunction(()=>document.querySelectorAll("article[data-item-id]").length===1);
    await page.locator('::-p-text(关闭地图)').click();
    await page.waitForFunction(()=>!document.querySelector(".leaflet-container"));
    await page.locator('::-p-text(加载交互地图)').click();
    await page.waitForSelector(".leaflet-container");
    assert.equal(await page.$$eval(".leaflet-container",els=>els.length),1);
    await page.setViewport({width:1440,height:960});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
    await page.goto(origin+"/yihot/cities",{waitUntil:"networkidle0"});
    await page.select('select[name="country"]',"CN"); await page.select('select[name="region"]',"四川");
    await page.locator('::-p-text(筛选新闻)').click();
    await page.waitForFunction(()=>location.search.includes("region="));
    await page.waitForFunction(()=>document.querySelectorAll("article[data-item-id]").length===1);
    assert.ok(await page.$('[data-item-id="synthetic-1"]'));
    await page.locator('::-p-text(按 IP 估计)').click();
    await page.waitForFunction(()=>document.querySelector('[role="status"]')?.textContent?.includes("已估计为北京"));
    assert.equal(outside.filter(u=>u.startsWith("https://ipwho.is/")).length,1);
    await page.locator('::-p-text(看附近新闻)').click();
    await page.waitForFunction(()=>location.search.includes("radius=100"));
    await page.goto(origin+"/yihot/cities?reviewed=0",{waitUntil:"networkidle0"});
    assert.ok(!(await page.$eval('[data-item-id="synthetic-2"]',e=>e.textContent)).includes("当地"),"institution-name text cannot trigger local badge");
    await page.locator('::-p-text(清除我的城市)').click();
    await page.waitForFunction(()=>!(document.querySelector("#my-city") as HTMLSelectElement).value);
    assert.deepEqual(errors,[],"no client hydration or map lifecycle errors");
  } finally {
    await browser?.close();
    if(web.exitCode===null){web.kill();await once(web,"exit");}
    api.closeAllConnections(); await new Promise<void>(r=>api.close(()=>r()));
  }
});
