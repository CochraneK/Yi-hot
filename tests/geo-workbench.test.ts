import { tag } from "./setup.ts";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { sql, closeDb } from "@aihot/backend/db";
import { config } from "@aihot/backend/config";
import { SESSION_COOKIE } from "@aihot/backend/admin/auth";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import { buildApp } from "../apps/api/src/app.ts";
const T=tag(),SOURCE=`test-geo-ui-${T}`,PLACE=`geo-ui-${T}`;
const token=randomBytes(24).toString("hex"),csrf=`csrf-${T}`,cookie=`${SESSION_COOKIE}=${token}`;
const app=await buildApp();let userId=0, candidateId=0, articleId="";
const headers={cookie,"x-csrf-token":csrf};
before(async()=>{
  config.devAdmin=null;
  const [u]=await sql<{id:number}[]>`INSERT INTO admin_users(email,display_name) VALUES (${`geo-${T}@example.org`},'Geo reviewer fixture') RETURNING id`;
  userId=u!.id;
  await sql`INSERT INTO admin_sessions(id_hash,user_id,csrf_token,expires_at) VALUES (${createHash('sha256').update(token).digest('hex')},${userId},${csrf},${new Date(Date.now()+3600000)})`;
  await sql`INSERT INTO sources(id,name,kind,tier,participation_mode,next_fetch_at) VALUES (${SOURCE},'Geo review UI','rss','T1','editorial','2100-01-01')`;
  const a=await upsertMaterial({sourceId:SOURCE,url:`https://example.org/geo-ui/${T}`,title:`在测试城市开展儿童服务-${T}`,bodyText:'在测试城市开展儿童服务，志愿者参与。',bodyStatus:'ok',via:'fetch',publishedAt:new Date()});articleId=a.articleId;
  const [an]=await sql<{id:number}[]>`INSERT INTO analyses(article_id,input_revision,origin,relevance,category,title_zh,summary_zh,score,selected)
    VALUES (${articleId},1,'rule','pass','project',${`测试城市公益-${T}`},'在测试城市开展儿童服务',70,false) RETURNING id`;
  await publishArticle(articleId);
  const [c]=await sql<{id:number}[]>`INSERT INTO geo_candidates(article_id,analysis_id,place_text,role,evidence)
    VALUES (${articleId},${an!.id},'测试城市','event','在测试城市开展儿童服务') RETURNING id`;
  candidateId=c!.id;
});
after(async()=>{await app.close();await stopBoss();await closeDb();});
test("admin geography read/write routes require a session and CSRF and never cache",async()=>{
  assert.equal((await app.inject({method:'GET',url:'/api/admin/geo'})).statusCode,401);
  const r=await app.inject({method:'GET',url:`/api/admin/geo?q=${T}`,headers:{cookie}});
  assert.equal(r.statusCode,200);assert.equal(r.headers['cache-control'],'no-store');
  assert.ok(r.json().rows.some((x:{id:number})=>x.id===candidateId));
  assert.equal((await app.inject({method:'POST',url:`/api/admin/geo/${candidateId}/review`,headers:{cookie},payload:{action:'reject',reason:'未核实原文'}})).statusCode,403);
});
test("place creation is authenticated, non-overwriting and atomically audited",async()=>{
  const payload={id:PLACE,name:'测试城市',countryCode:'CN',lat:30.65,lon:104.07,precision:'city',sourceUrl:'https://example.org/verified-place',reason:'核查行政实体和代表坐标'};
  assert.equal((await app.inject({method:'POST',url:'/api/admin/geo/places',headers,payload})).statusCode,204);
  assert.equal((await app.inject({method:'POST',url:'/api/admin/geo/places',headers,payload})).statusCode,409);
  const log=await sql<{actor:string}[]>`SELECT actor FROM audit_log WHERE subject=${`geo-place:${PLACE}`} AND action='geo.place.create'`;
  assert.deepEqual(log.map(x=>x.actor),[`admin:${userId}`]);
});
test("web review derives actor from session, preserves logs and rejects repeated approval",async()=>{
  const url=`/api/admin/geo/${candidateId}/review`;
  const payload={action:'approve',placeId:PLACE,reason:'逐字核查原文、角色与地点来源'};
  assert.equal((await app.inject({method:'POST',url,headers,payload:{...payload,reviewer:'spoofed'}})).statusCode,400);
  assert.equal((await app.inject({method:'POST',url,headers,payload})).statusCode,204);
  assert.equal((await app.inject({method:'POST',url,headers,payload})).statusCode,409);
  const [g]=await sql<{reviewed_by:string}[]>`SELECT reviewed_by FROM geo_candidates WHERE id=${candidateId}`;
  assert.equal(g!.reviewed_by,`admin:${userId}`);
  assert.equal((await app.inject({method:'GET',url:`/api/site/geo?place=${PLACE}`})).json().total,1);
  assert.equal((await app.inject({method:'POST',url,headers,payload:{action:'reopen',reason:'需重新检查角色与证据'}})).statusCode,204);
  assert.equal((await app.inject({method:'GET',url:`/api/site/geo?place=${PLACE}`})).json().total,0);
  const log=await sql<{action:string}[]>`SELECT action FROM geo_review_audit WHERE candidate_id=${candidateId} ORDER BY id`;
  assert.deepEqual(log.map(x=>x.action),['approve','reopen']);
});
test("obsolete evidence can be rejected but never approved through the web endpoint",async()=>{
  await sql`UPDATE articles SET revision=revision+1 WHERE id=${articleId}`;
  const url=`/api/admin/geo/${candidateId}/review`;
  assert.equal((await app.inject({method:'POST',url,headers,payload:{action:'approve',placeId:PLACE,reason:'试图批准旧版候选'}})).statusCode,409);
  assert.equal((await app.inject({method:'POST',url,headers,payload:{action:'reject',reason:'原文版本已经发生变化'}})).statusCode,204);
  const r=await app.inject({method:'GET',url:`/api/admin/geo?status=rejected&stale=1&q=${T}`,headers:{cookie}});
  assert.ok(r.json().rows.some((x:{id:number})=>x.id===candidateId));
});
