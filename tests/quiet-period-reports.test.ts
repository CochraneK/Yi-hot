// YiHot's period reports summarize the whole eligible pool, not merely daily excerpts.
// A zero-candidate window may be skipped only if all its daily issues are provably quiet.
import "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { addDays } from "@aihot/contracts/time";
import { catchUpReports, composeMonthly, composeWeekly, refillPeriod } from "@aihot/backend/reports/compose";

const CREATED = new Set<string>();
async function daily(date: string, withOldItem = false) {
  CREATED.add(date);
  const sections = withOldItem ? [{ label: "公益实践", items: [{ itemId: "withdrawn-old-item" }] }] : [];
  await sql`INSERT INTO reports(kind,key,window_start,window_end,content,generated_at)
    VALUES ('daily',${date},now(),now(),${sql.json({ sections, flashes: [], metrics: { totalEvents: withOldItem ? 1 : 0 } })},now())
    ON CONFLICT(kind,key) DO NOTHING`;
}
async function span(start: string, end: string, except: string | null = null, withOldItem: string | null = null) {
  for (let d=start;d<=end;d=addDays(d,1)) {
    if (d!==except) await daily(d,d===withOldItem);
  }
}
async function absent(kind: string,key: string) {
  const rows=await sql`SELECT 1 FROM reports WHERE kind=${kind} AND key=${key}`;
  assert.equal(rows.length,0);
}
after(async () => {
  await sql`DELETE FROM reports WHERE kind IN ('weekly','monthly') AND key IN ('2011-W45','2011-W46','2011-W48','2011-11','2011-12')`;
  for (const date of CREATED) await sql`DELETE FROM reports WHERE kind='daily' AND key=${date}`;
  await closeDb();
});

test("complete quiet week skips safely, is retryable, and writes no misleading report", async () => {
  await span("2011-11-07","2011-11-13");
  assert.equal(await composeWeekly("2011-W45"),null);
  assert.equal(await composeWeekly("2011-W45","catch-up"),null);
  await absent("weekly","2011-W45");
});

test("a missing daily blocks empty-week classification", async () => {
  await span("2011-11-14","2011-11-20","2011-11-16");
  await assert.rejects(composeWeekly("2011-W46"),/no eligible entries or incomplete daily coverage/);
  await absent("weekly","2011-W46");
  // Even once coverage becomes complete, an originally published-but-now-withdrawn
  // item cannot be mistaken for a genuinely quiet interval.
  await daily("2011-11-16",true);
  await assert.rejects(composeWeekly("2011-W46"),/no eligible entries/);
  await absent("weekly","2011-W46");
});

test("a complete quiet month is not published on repeated scheduled runs", async () => {
  await span("2011-12-01","2011-12-31");
  assert.equal(await composeMonthly("2011-12"),null);
  assert.equal(await composeMonthly("2011-12","catch-up"),null);
  await absent("monthly","2011-12");
});

test("refill of a previously published period cannot erase its content", async () => {
  const key="2011-W48";
  await span("2011-11-28","2011-12-04");
  await sql`INSERT INTO reports(kind,key,window_start,window_end,content,generated_at)
    VALUES ('weekly',${key},now(),now(),${sql.json({ title: "Published historic edition", storyOrder: ["historic"] })},now())`;
  await assert.rejects(refillPeriod("weekly",key),/no eligible entries/);
  await assert.rejects(composeWeekly(key),/no eligible entries/);
  const saved=await sql<{ content: {title:string}; revision:number }[]>`SELECT content,revision FROM reports WHERE kind='weekly' AND key=${key}`;
  assert.equal(saved[0]?.content.title,"Published historic edition");
  assert.equal(saved[0]?.revision,1);
});

test("catch-up never marks a skipped quiet week or month as generated", async () => {
  await span("2011-11-01","2011-11-30");
  await span("2011-12-01","2011-12-04");
  const outcome=await catchUpReports(new Date("2011-12-05T02:00:00Z"),0);
  assert.deepEqual(outcome,{generated:[]});
  await absent("monthly","2011-11");
});
