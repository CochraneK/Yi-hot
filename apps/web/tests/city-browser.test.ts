// Real headless Chromium regression against the built site and synthetic HTTP data.
// Requests to the IP provider are intercepted locally; no live news, IP lookup or external tiles.
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

test("city picker, IP opt-in, local badges and the clues view", { skip: process.env.CITY_BROWSER_TEST !== "1", timeout: 60000 }, async () => {
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
    // The picker loads this once, then filters in the browser.
    if(u.pathname==="/api/site/geo/catalog") return res.end(JSON.stringify({
      places: places.map(p=>({...p, count: 1})),
      regions: [{ key: "CN:北京", label: "北京", cities: 1 }, { key: "CN:四川", label: "四川", cities: 1 }],
      generatedAt: "test",
    }));
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
      void request.abort();
    });
    await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
    const initialResponse = await page.goto(origin+"/yihot/cities",{waitUntil:"networkidle0"});
    if (errors.length && initialResponse) {
      const serverHtml = await initialResponse.text();
      const diffs = await page.evaluate((html) => {
        const server = new DOMParser().parseFromString(html, "text/html");
        return ["#main", 'nav[aria-label="底部导航"]', "aside"].map(selector => {
          const before = server.querySelector(selector)?.textContent ?? "";
          const after = document.querySelector(selector)?.textContent ?? "";
          let i = 0;
          while (i < Math.min(before.length, after.length) && before[i] === after[i]) i++;
          return { selector, beforeLength: before.length, afterLength: after.length, firstDiff: i,
            serverText: before.slice(Math.max(0,i-70), i+160), clientText: after.slice(Math.max(0,i-70), i+160) };
        });
      }, serverHtml);
      console.log("FIRST-HYDRATION-TEXT-DIFF " + JSON.stringify(diffs));
    }
    assert.equal(outside.length,0,"opening the page must not load maps or resolve the visitor IP");
    assert.ok(await page.$('[data-item-id="synthetic-0"]'), "fixture article should be SSR-rendered before selecting a city");

    // Choose a city from the picker: it must land on that city's feed at once.
    await page.locator('button[aria-haspopup="dialog"]').click();
    await page.waitForSelector('[role="dialog"] ul li button');
    await page.evaluate(() => {
      const buttons=[...document.querySelectorAll<HTMLElement>('[role="dialog"] ul li button')];
      buttons.find(b=>b.textContent?.includes("北京"))?.click();
    });
    await page.waitForFunction(()=>location.search.includes("place=beijing"),{timeout:9000});
    try {
      await page.waitForFunction(()=>document.querySelector('[data-item-id="synthetic-0"]')?.textContent?.includes("当地"),{timeout:9000});
    } catch (error) {
      const diagnostics = await page.evaluate(() => ({
        url: location.href,
        readerLocation: localStorage.getItem("yihot:reader-location:v2"),
        articleText: document.querySelector('[data-item-id="synthetic-0"]')?.textContent?.slice(0,400),
        cards: document.querySelectorAll("article[data-item-id]").length,
      }));
      throw new Error("City selection failed to update local event badge; " + JSON.stringify({
        diagnostics, pageErrors: errors, upstreamRequests: outside.slice(0,12), webLog: logs.slice(-1500),
      }), { cause: error });
    }
    assert.ok(!(await page.$eval('[data-item-id="synthetic-1"]',e=>e.textContent)).includes("当地"));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),"mobile must not scroll sideways");
    assert.equal(await page.$eval('button[aria-haspopup="dialog"]',e=>e.textContent?.trim()),"北京","the trigger keeps showing the chosen city");

    await page.locator('::-p-text(按 IP 估计)').click();
    await page.waitForFunction(()=>document.querySelector('[role="status"]')?.textContent?.includes("已估计为北京"));
    assert.equal(outside.filter(u=>u.startsWith("https://ipwho.is/")).length,1);
    await page.locator('::-p-text(看附近新闻)').click();
    await page.waitForFunction(()=>location.search.includes("radius=100"));

    await page.setViewport({width:1440,height:960});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
    assert.ok(await page.$('[aria-label="报道最多的城市"]'),"desktop keeps the quick city chips");

    await page.goto(origin+"/yihot/cities?reviewed=0",{waitUntil:"networkidle0"});
    assert.ok(!(await page.$eval('[data-item-id="synthetic-2"]',e=>e.textContent)).includes("当地"),"institution-name text cannot trigger local badge");
    // The clues view offers a way back to the picker.
    assert.ok(await page.$$eval('a',els=>els.some(a=>a.textContent?.trim()==="回到城市")));
    await page.goto(origin+"/yihot/cities",{waitUntil:"networkidle0"});
    await page.locator('::-p-text(清除我的城市)').click();
    await page.waitForFunction(()=>!localStorage.getItem("yihot:reader-location:v2"));
    assert.deepEqual(errors,[],"no client hydration errors");
  } finally {
    await browser?.close();
    if(web.exitCode===null){web.kill();await once(web,"exit");}
    api.closeAllConnections(); await new Promise<void>(r=>api.close(()=>r()));
  }
});
