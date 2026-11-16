// Real headless Chromium regression against the built site and synthetic HTTP data.
// Requests outside the fixture are aborted, so no live news, IP lookup or external tiles.
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

test("the 动态 header picks a city and marks its events", { skip: process.env.CITY_BROWSER_TEST !== "1", timeout: 60000 }, async () => {
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
    // The feed resolves the stored city against this list; the picker uses the catalogue.
    if(u.pathname==="/api/site/geo/places") return res.end(JSON.stringify({places: places.map(p=>({...p, count:1})), generatedAt: "test"}));
    if(u.pathname==="/api/site/geo/catalog") return res.end(JSON.stringify({
      places: places.map(p=>({...p, count: 1})),
      regions: [{ key: "CN:北京", label: "北京", cities: 1 }, { key: "CN:四川", label: "四川", cities: 1 }],
      generatedAt: "test",
    }));
    // The pool DTO is not just `items`: the page reads its filters, today count and
    // freshness straight off it. A fixture that omits them tests a shape the API
    // never sends — and would pass only while the page keeps a fallback for it.
    if(u.pathname==="/api/site/pool") return res.end(JSON.stringify({
      items, total:3, page:1, pageCount:1, todayCount:3,
      freshness:"2026-11-16T00:00:00Z", generatedAt:"test",
      filters:{channel:"all",category:null,tag:null,topic:null,q:null,tab:"time"},
    }));
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
      void request.abort();
    });
    await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
    const initialResponse = await page.goto(origin+"/yihot/all",{waitUntil:"networkidle0"});
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
    assert.equal(outside.length,0,"opening the feed must not load maps or resolve the visitor IP");
    assert.ok(await page.$('[data-item-id="synthetic-0"]'), "fixture article should be SSR-rendered before choosing a city");

    // The picker in the filter row is the only city entry left: choosing one must
    // put `place=` in the URL and hand the feed to the server.
    await page.evaluate(() => {
      const trigger = [...document.querySelectorAll<HTMLElement>('button[aria-haspopup="dialog"]')].find(b => b.offsetParent !== null);
      trigger?.click();
    });
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
    // The institution-name trap: 北京 inside the project's name ("北京大学在外地的
    // 项目") must not make an article local to 北京 — only a resolved event place may.
    assert.ok(!(await page.$eval('[data-item-id="synthetic-2"]',e=>e.textContent)).includes("当地"));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),"mobile must not scroll sideways");
    assert.equal(
      await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('button[aria-haspopup="dialog"]')].find(b => b.offsetParent !== null)?.textContent?.trim()),
      "北京",
      "the trigger keeps showing the chosen city",
    );

    // Same page at desktop width: the picker moves up into the title row and the
    // layout must stay inside the viewport.
    await page.setViewport({width:1440,height:960});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
    assert.ok(await page.evaluate(() => {
      const trigger = [...document.querySelectorAll<HTMLElement>('button[aria-haspopup="dialog"]')].find(b => b.offsetParent !== null);
      const heading = document.querySelector("h1");
      return !!trigger && !!heading && Math.abs(trigger.getBoundingClientRect().top - heading.getBoundingClientRect().top) < 40;
    }), "desktop keeps the city trigger in the title row");
    assert.deepEqual(errors,[],"no client hydration errors");
  } finally {
    await browser?.close();
    if(web.exitCode===null){web.kill();await once(web,"exit");}
    api.closeAllConnections(); await new Promise<void>(r=>api.close(()=>r()));
  }
});
