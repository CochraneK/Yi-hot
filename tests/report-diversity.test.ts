import { stub, tag } from "./setup.ts";
// A single high-volume outlet must not fill a daily issue on its own: past the per-source cap its
// items still appear, but as flash headlines rather than full entries.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { publishArticle } from "@aihot/backend/publication/publish";
import { composeDaily, DAILY_MAX_PER_SOURCE } from "@aihot/backend/reports/compose";

const T = tag();
const BIG = `test-report-big-${T}`;
const SMALL = `test-report-small-${T}`;
const BIG_NAME = `Highly prolific outlet ${T}`;
const DAY = "2020-02-10";
const WINDOW_START = "2020-02-09T00:00:00Z";

const provider = await stub((hit) => ({
  id: `report-diversity-${T}-${hit}`,
  choices: [{ message: { content: JSON.stringify({ title: "测试导语", leadParagraph: "测试摘要", highlights: [1] }) } }],
  usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
}));
process.env.DEEPSEEK_BASE_URL = `${provider.url}/v1`;
process.env.DEEPSEEK_API_KEY = "test-key";

before(async () => {
  // An earlier run of this file leaves its fixtures in the same window; they would compete for the
  // issue's slots and make the cap look broken. Throwaway sources only, so clearing them is safe.
  await sql`DELETE FROM articles WHERE source_id LIKE 'test-report-%'
            AND discovered_at >= ${WINDOW_START} AND discovered_at < '2020-02-11'`;
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at)
            VALUES (${BIG}, ${BIG_NAME}, 'rss', 'T1', 'editorial', '2100-01-01'),
                   (${SMALL}, ${SMALL}, 'rss', 'T1', 'editorial', '2100-01-01')`;
});

after(async () => {
  await sql`DELETE FROM reports WHERE kind = 'daily' AND key = ${DAY}`;
  await provider.close();
  await stopBoss();
  await closeDb();
});

async function released(sourceId: string, label: string, minutes: number): Promise<string> {
  const at = new Date(Date.parse(WINDOW_START) + minutes * 60_000);
  const { articleId } = await upsertMaterial({
    sourceId,
    url: `https://example.com/report-diversity-${T}-${label}`,
    title: `Diversity ${T} ${label}`,
    bodyText: `Diversity ${label} body`,
    bodyStatus: "ok",
    publishedAt: at,
    discoveredAt: at,
    via: "fetch",
  });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, score, selected)
            VALUES (${articleId}, 1, 'rule', 'pass', 'policy', ${`标题 ${T} ${label}`}, ${`摘要 ${T} ${label}`}, 90, true)`;
  const published = await publishArticle(articleId, { now: at, releasedAt: at });
  assert.equal(published?.selected, true);
  return articleId;
}

test("a daily issue spreads across sources and keeps the overflow as flash headlines", async () => {
  const bigItems: string[] = [];
  for (let i = 0; i < 6; i += 1) bigItems.push(await released(BIG, `big-${i}`, 10 + i));
  for (let i = 0; i < 2; i += 1) await released(SMALL, `small-${i}`, 30 + i);

  const { entries } = await composeDaily(DAY);
  const [report] = await sql<{ content: {
    sections: Array<{ items: Array<{ itemId: string; sourceName: string }> }>;
    flashes: Array<{ itemId: string; sourceName: string }>;
  } }[]>`SELECT content FROM reports WHERE kind = 'daily' AND key = ${DAY}`;
  const sections = report!.content.sections.flatMap((s) => s.items);
  const flashes = report!.content.flashes;

  assert.equal(sections.filter((i) => i.sourceName === BIG_NAME).length, DAILY_MAX_PER_SOURCE);
  assert.equal(sections.filter((i) => i.sourceName !== BIG_NAME).length, 2);
  assert.equal(flashes.filter((i) => i.sourceName === BIG_NAME).length, 6 - DAILY_MAX_PER_SOURCE);
  // Nothing is dropped: every item of the window is readable either in full or as a headline.
  const seen = new Set([...sections, ...flashes].map((i) => i.itemId));
  for (const id of bigItems) assert.equal(seen.has(id), true);
  assert.equal(entries, sections.length);
});
