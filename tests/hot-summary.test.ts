import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { rankingExtras, type HotEntry } from "@aihot/backend/events/hot-read";

const T = tag();
const SOURCE = `hot-summary-${T}`;
const storyIds: number[] = [];
const entries: HotEntry[] = [];

type ReportOptions = {
  visibility?: "public" | "summary-only" | "withdrawn";
  eligible?: boolean;
  selected?: boolean;
  visibleAfter?: Date | null;
  summary?: string | null;
  storyId?: number;
};

after(async () => {
  if (storyIds.length) await sql`DELETE FROM stories WHERE id = ANY(${storyIds}::bigint[])`;
  await sql`DELETE FROM articles WHERE source_id = ${SOURCE}`;
  await sql`DELETE FROM sources WHERE id = ${SOURCE}`;
  await closeDb();
});

async function report(name: string, options: ReportOptions = {}) {
  const id = `${SOURCE}-${name}`;
  await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at)
    VALUES (${id}, ${SOURCE}, ${id}, ${`https://example.org/${id}`}, ${name}, now(), now())`;
  await sql`INSERT INTO publications (
      article_id, visibility, eligible, selected, title, summary, source_id, channel, url,
      discovered_at, timeline_at, sort_at, visible_after, story_id
    ) VALUES (
      ${id}, ${options.visibility ?? "public"}, ${options.eligible ?? true}, ${options.selected ?? false},
      ${name}, ${options.summary === undefined ? `${name}-report-summary` : options.summary}, ${SOURCE}, 'news',
      ${`https://example.org/${id}`}, now(), now(), now(), ${options.visibleAfter ?? null}, ${options.storyId ?? null}
    )`;
  return id;
}

async function addEntry(name: string, options: {
  digest?: string | null;
  summary?: string | null;
  latest?: string | null;
  report?: ReportOptions;
} = {}) {
  const [story] = await sql<{ id: number; public_id: string }[]>`
    INSERT INTO stories (public_id, title, digest, summary, latest)
    VALUES (${randomUUID()}, ${name}, ${options.digest ?? null}, ${options.summary ?? null}, ${options.latest ?? null})
    RETURNING id, public_id::text`;
  storyIds.push(story!.id);
  const itemId = await report(name, { ...options.report, storyId: story!.id });
  const at = new Date().toISOString();
  const entry: HotEntry = {
    rank: entries.length + 1,
    storyId: story!.id,
    storyPublicId: story!.public_id,
    title: name,
    heat: 10,
    trend: "flat",
    trendPct: 0,
    badges: [],
    participantCount: 2,
    sourceCount: 2,
    signalCount: 0,
    reportCount: 1,
    sourceNames: ["Test source"],
    latestAt: at,
    firstReportAt: at,
    representativeItemId: itemId,
    representativeUrl: `https://example.org/${itemId}`,
    representativeSource: "Test source",
    participants: [],
  };
  entries.push(entry);
  return { entry, storyId: story!.id };
}

test("hot summaries prefer story copy and fall back only to a public eligible representative report", async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at)
    VALUES (${SOURCE}, 'Test hot summaries', 'rss', 'T1', 'editorial', '2100-01-01')`;

  const digest = await addEntry("digest", {
    digest: "story-digest",
    summary: "story-summary-behind-digest",
    latest: "digest-latest",
    report: { summary: "report-behind-digest" },
  });
  const storySummary = await addEntry("story-summary", { summary: "story-summary" });
  const fallback = await addEntry("fallback", { latest: "fallback-latest" });
  const withdrawn = await addEntry("withdrawn", { report: { visibility: "withdrawn" } });
  const ineligible = await addEntry("ineligible", { report: { eligible: false } });
  const unreleased = await addEntry("unreleased", {
    report: { selected: true, visibleAfter: new Date("2100-01-01T00:00:00Z") },
  });
  const restricted = await addEntry("restricted");
  const restrictedEvidence = await report("restricted-evidence", { visibility: "withdrawn" });
  await sql`INSERT INTO story_digests (story_id, version, digest, article_ids)
    VALUES (${restricted.storyId}, 1, 'old restricted copy', ${[restrictedEvidence]})`;

  const extras = await rankingExtras({
    id: -Date.now(),
    computedAt: new Date().toISOString(),
    ruleVersion: "test",
    entries,
    coverage: null,
  });

  assert.deepEqual(extras.text(digest.entry), { summary: "story-digest", latest: "digest-latest" });
  assert.deepEqual(extras.text(storySummary.entry), { summary: "story-summary", latest: null });
  assert.deepEqual(extras.text(fallback.entry), { summary: "fallback-report-summary", latest: "fallback-latest" });
  for (const { entry } of [withdrawn, ineligible, unreleased, restricted]) {
    assert.deepEqual(extras.text(entry), { summary: null, latest: null }, entry.title);
  }

  // Correcting visibility can leave the ranking id unchanged: the next read must still see the report gate.
  await sql`UPDATE publications SET visibility = 'public' WHERE article_id = ${withdrawn.entry.representativeItemId!}`;
  const refreshed = await rankingExtras({
    id: Date.now(),
    computedAt: new Date().toISOString(),
    ruleVersion: "test",
    entries,
    coverage: null,
  });
  assert.deepEqual(refreshed.text(withdrawn.entry), { summary: "withdrawn-report-summary", latest: null });
});
