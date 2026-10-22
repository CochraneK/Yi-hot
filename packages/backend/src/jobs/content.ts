// Content processing: body extraction when the source needs it → analysis → publish → event grouping.
// Every article reaches the queues through queueProcessing, which records when it was queued, so the
// safety net only picks up articles nothing is working on and sends those still waiting for a body to
// extraction first. A provider outage makes an article wait and retry with backoff; only a permanent
// refusal or exhausted retries end in "failed", which the admin re-queues in bulk.
import type { PgBoss } from "pg-boss";
import { sql, type Db } from "../db.ts";
import { extractArticleBody, pageFetchable } from "../content/extract.ts";
import { analyzeArticle, AnalysisInterruptedError } from "../editorial/analyze.ts";
import { isHistorical } from "../content/materials.ts";
import { publishArticle } from "../publication/publish.ts";
import { BudgetExceededError, ProviderRejectedError, ReceiptBusyError, ReceiptUnknownError } from "../providers/receipts.ts";
import { ModelOutputError } from "../providers/llm.ts";
import { ensureQueue, enqueue, QUEUES, shutdownSignal } from "./queue.ts";

/** Minutes to wait after the n-th failed attempt; one more failure after the last ends in "failed". */
const RETRY_MINUTES = [5, 10, 20, 40, 60, 120, 240, 360];
/** Unusable model output is retried less: each retry is a paid call. */
const MAX_OUTPUT_FAILURES = 3;
/** Extraction gives up after this many errors and the article is judged on what it has. */
const MAX_EXTRACT_FAILURES = 3;
/** A queued article whose job left no trace for this long is queued again. */
const QUEUED_STALE = "30 minutes";

type Step = "extract" | "analyze";

/**
 * Whether paid analysis should wait for the off-peak window. DeepSeek bills weekday peak hours
 * (Beijing 09:00–12:00 and 14:00–18:00) at double the off-peak rate, so with ANALYZE_OFFPEAK_ONLY
 * the model calls are held back to the half-price window while body extraction (free) still runs.
 * Peak hours are not a full stop: peakSlotsLeft lets a few articles an hour through.
 *
 * Deferring moves *when* the model runs, never *what* the timeline says: `discovered_at` and
 * `published_at` are written at ingest by decideTimeline, long before any analysis. The longest wait
 * is 9 h (a 08:59 article picked up at 18:00), inside the 12 h push freshness gate in
 * notify/selected.ts, so nothing loses its announcement.
 */
export function isPeakAnalysisHour(now = Date.now()): boolean {
  if (process.env.ANALYZE_OFFPEAK_ONLY !== "true") return false;
  const beijing = new Date(now + 8 * 3600_000);
  const weekday = beijing.getUTCDay();
  if (weekday === 0 || weekday === 6) return false; // weekends are off-peak all day
  const hour = beijing.getUTCHours();
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18);
}

/** Analyses per peak hour by default: a trickle, not a stop. */
const PEAK_PER_HOUR = 8;

// Dispatch count for the peak hour in flight, seeded from the receipts so a restart mid-hour does not
// hand out a second full quota. Cheap, and the only state this module keeps.
let peakHour = -1;
let peakDispatched = 0;

/**
 * Paid analyses still allowed this hour. Off-peak the answer is unlimited; during peak hours it is
 * ANALYZE_PEAK_PER_HOUR (default 8, 0 = stop entirely, which is what the switch used to mean).
 *
 * Holding *everything* back for three hours at a time left the feed visibly frozen all morning and
 * then dumped the whole backlog at 12:00. A trickle keeps today's news moving while still pushing the
 * bulk of the work into the half-price window — the sweep runs every five minutes, so the remaining
 * backlog drains on its own.
 */
export async function peakSlotsLeft(now = Date.now()): Promise<number> {
  if (!isPeakAnalysisHour(now)) return Number.POSITIVE_INFINITY;
  const perHour = Number(process.env.ANALYZE_PEAK_PER_HOUR ?? PEAK_PER_HOUR);
  if (!Number.isFinite(perHour) || perHour <= 0) return 0;
  const hour = Math.floor(now / 3600_000);
  if (hour !== peakHour) {
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM receipt_attempts a JOIN receipts r ON r.id = a.receipt_id
      WHERE r.purpose = 'prefilter_article' AND a.origin = 'live' AND a.started_at >= to_timestamp(${hour * 3600})`;
    peakHour = hour;
    peakDispatched = row?.n ?? 0;
  }
  return Math.max(0, perHour - peakDispatched);
}

interface Route {
  step: Step;
  /** Not an editorial source: no analysis; the post goes straight to event grouping as discussion evidence. */
  signal: boolean;
  historical: boolean;
}

/**
 * The article's next step: its body first while none is confirmed and the source asks for full text,
 * when there is only a title or a feed summary (the analysis judges the whole article), or when an
 * X post links an X Article (fetched before judging; for a discussion post only while it is news, as
 * history adds no heat).
 */
async function route(articleId: string, db: Db): Promise<Route | null> {
  const [row] = await db<{ body_status: string; participation_mode: string; kind: string; config: Record<string, unknown>; url: string; bare: boolean; backfill: boolean; published_at: Date | null; discovered_at: Date }[]>`
    SELECT a.body_status, s.participation_mode, s.kind, s.config, a.url, (coalesce(a.body_text, '') = '' AND a.x_post IS NULL) AS bare,
           a.backfill, a.published_at, a.discovered_at
    FROM articles a JOIN sources s ON s.id = a.source_id WHERE a.id = ${articleId}`;
  if (!row) return null;
  const historical = isHistorical(row);
  const signal = row.participation_mode !== "editorial";
  const pending = row.body_status === "pending";
  const wantsBody = row.config.fetchPublicContent === true || !!row.config.detail || row.kind === "web_list";
  const needsPage = !signal && (wantsBody || (row.bare && pageFetchable(row.url, row.kind)));
  const needsXArticle = row.kind === "x_search" && (!signal || (row.participation_mode === "hot_signal" && !historical));
  return { step: pending && (needsPage || needsXArticle) ? "extract" : "analyze", signal, historical };
}

/**
 * Queue order (pg-boss serves higher priority first): live work before history, so a new source's
 * first import or a backfill never holds up today's news; discussion evidence waits behind reports
 * in the serial grouping queue, history behind both.
 */
const PRIORITY = { live: 0, liveSignal: -1, history: -2 } as const;

/** A backfilled item this fresh can still have a live twin on the site (see processArticle). */
const RECENT_ARRIVAL_MS = 7 * 24 * 3600 * 1000;

/**
 * The one way to hand an article to processing. `attemptTag` makes an explicit re-evaluation a new
 * (paid) request; the same tag reuses its receipt. With `db`, the job commits with the caller's write.
 * Posts of non-editorial sources skip the analysis queue: they only need recording and grouping.
 */
export async function queueProcessing(articleId: string, opts: { step?: Step; attemptTag?: string; db?: Db } = {}): Promise<string | null> {
  const db = opts.db ?? sql;
  const r = await route(articleId, db);
  if (!r) return null;
  const step = opts.step ?? r.step;
  // Peak hours: let a trickle through and leave the rest waiting for the sweep, so the feed keeps
  // moving instead of freezing until the window ends. An explicit re-evaluation (attemptTag) is a
  // human asking now, so it is never held back.
  if (step === "analyze" && !opts.attemptTag) {
    const left = await peakSlotsLeft();
    if (left <= 0) {
      await db`UPDATE articles SET processing_queued_at = NULL WHERE id = ${articleId}`;
      return null;
    }
    if (Number.isFinite(left)) peakDispatched += 1;
  }
  await db`UPDATE articles SET processing_queued_at = now() WHERE id = ${articleId}`;
  if (step === "extract") return enqueue(QUEUES.extractBody, { articleId }, { singletonKey: articleId, priority: r.historical ? PRIORITY.history : PRIORITY.live }, opts.db);
  if (r.signal && !opts.attemptTag) {
    return enqueue(QUEUES.group, { articleId, signalOnly: true }, { singletonKey: articleId, priority: r.historical ? PRIORITY.history : PRIORITY.liveSignal }, opts.db);
  }
  const tagged = !!opts.attemptTag;
  return enqueue(QUEUES.analyze, tagged ? { articleId, attemptTag: opts.attemptTag } : { articleId },
    { singletonKey: tagged ? `manual:analyze:${articleId}:${opts.attemptTag}` : articleId, priority: r.historical ? PRIORITY.history : PRIORITY.live }, opts.db);
}

/**
 * A post of a non-editorial source: recorded (hot_signal material only feeds heat; isolated material
 * never reaches public surfaces). Returns whether it is discussion evidence to group.
 */
export async function settleNonEditorial(articleId: string): Promise<{ group: boolean }> {
  const [row] = await sql<{ participation_mode: string; backfill: boolean; published_at: Date | null; discovered_at: Date }[]>`
    UPDATE articles a SET processing_state = 'skipped', processing_attempts = 0, processing_retry_at = NULL, processing_queued_at = NULL
    FROM sources s WHERE s.id = a.source_id AND a.id = ${articleId} AND s.participation_mode <> 'editorial'
    RETURNING s.participation_mode, a.backfill, a.published_at, a.discovered_at`;
  if (!row) return { group: false };
  await publishArticle(articleId);
  return { group: row.participation_mode === "hot_signal" && !isHistorical(row) };
}

/** attemptTag makes an explicit re-evaluation a new (paid) request; the same tag reuses its receipt. */
export async function processArticle(articleId: string, opts: { attemptTag?: string } = {}): Promise<{ state: string }> {
  const [found] = await sql<{ participation_mode: string; processing_state: string; revision: number; backfill: boolean; published_at: Date | null; discovered_at: Date }[]>`
    SELECT s.participation_mode, a.processing_state, a.revision, a.backfill, a.published_at, a.discovered_at FROM articles a JOIN sources s ON s.id = a.source_id WHERE a.id = ${articleId}`;
  if (!found) return { state: "missing" };
  const row = { ...found, historical: isHistorical(found) };
  if (row.participation_mode !== "editorial") {
    // Normally queued straight for grouping (queueProcessing); an explicit re-evaluation lands here.
    const { group } = await settleNonEditorial(articleId);
    if (group) await enqueue(QUEUES.group, { articleId, signalOnly: true }, { singletonKey: articleId, priority: PRIORITY.liveSignal });
    return { state: "skipped" };
  }
  try {
    const result = await analyzeArticle(articleId, { attemptTag: opts.attemptTag });
    if (!result) return { state: "missing" };
    // Only a title or a feed summary: the article page first; extraction queues the analysis again.
    if (result.needsBody || !result.output) {
      await queueProcessing(articleId, { step: "extract" });
      return { state: "fetching-body" };
    }
    if (result.stale) return { state: "stale" }; // the newer revision has its own job
    await publishArticle(articleId);
    // History is archived but founds no event (isHistorical). It is still grouped when it arrived
    // this week, so that a backfilled copy of a case already on the site (search's 7-day lookback, a
    // source's first import) joins that card instead of standing beside it. Grouping only lets such
    // an item attach — it never founds a story — so an older archive would spend an identity call per
    // item for a card nobody scrolls to.
    const recentArrival = row.published_at !== null && row.discovered_at.getTime() - row.published_at.getTime() <= RECENT_ARRIVAL_MS;
    if (result.output.relevance === "pass" && (!row.historical || recentArrival)) await enqueue(QUEUES.group, { articleId }, { singletonKey: articleId, priority: PRIORITY.live });
    return { state: result.output.relevance };
  } catch (error) {
    if (error instanceof AnalysisInterruptedError || shutdownSignal.signal.aborted) throw error;
    if (error instanceof ReceiptUnknownError) {
      // The provider may have billed this request: stop; ops.recover releases it once and requeues the article.
      await sql`UPDATE articles SET processing_state = 'failed', processing_error = ${`receipt ${error.receiptId} outcome unknown`} WHERE id = ${articleId}`;
      return { state: "unknown-receipt" };
    }
    throw error;
  }
}

/** Waits and retries for passing trouble; marks "failed" for refusals and exhausted retries. */
async function afterFailure(articleId: string, error: unknown): Promise<{ state: string; retryAt?: Date }> {
  // Let pg-boss retry this job after restart, reusing settled receipts. A deploy is not an article
  // failure and must neither consume processing_attempts nor turn an incomplete chain terminal.
  if (error instanceof AnalysisInterruptedError || shutdownSignal.signal.aborted) throw error;
  const message = String(error instanceof Error ? error.message : error).slice(0, 500);
  if (error instanceof ReceiptBusyError || error instanceof BudgetExceededError) {
    // Not the article's fault: the same request is in flight, or the budget window is full.
    const seconds = error instanceof BudgetExceededError ? error.retryAfterSeconds : 60;
    const retryAt = new Date(Date.now() + seconds * 1000);
    await sql`UPDATE articles SET processing_state = 'new', processing_error = ${message}, processing_retry_at = ${retryAt}, processing_queued_at = NULL WHERE id = ${articleId}`;
    return { state: "waiting", retryAt };
  }
  const [a] = await sql<{ processing_attempts: number }[]>`SELECT processing_attempts FROM articles WHERE id = ${articleId}`;
  const attempts = (a?.processing_attempts ?? 0) + 1;
  const refused = error instanceof ProviderRejectedError && !error.retryable;
  const exhausted = attempts > RETRY_MINUTES.length || (error instanceof ModelOutputError && attempts >= MAX_OUTPUT_FAILURES);
  if (refused || exhausted) {
    await sql`UPDATE articles SET processing_state = 'failed', processing_error = ${message}, processing_attempts = ${attempts},
                processing_retry_at = NULL, processing_queued_at = NULL WHERE id = ${articleId}`;
    return { state: "failed" };
  }
  const retryAt = new Date(Date.now() + RETRY_MINUTES[attempts - 1]! * 60_000);
  await sql`UPDATE articles SET processing_state = 'new', processing_error = ${message}, processing_attempts = ${attempts},
              processing_retry_at = ${retryAt}, processing_queued_at = NULL WHERE id = ${articleId}`;
  return { state: "retrying", retryAt };
}

export async function registerContentJobs(boss: PgBoss, concurrency = Number(process.env.ANALYZE_CONCURRENCY || 6)) {
  await ensureQueue(QUEUES.analyze);
  await boss.work<{ articleId: string; attemptTag?: string }>(QUEUES.analyze, { localConcurrency: concurrency, pollingIntervalSeconds: 2 }, async ([job]) => {
    if (!job) return;
    const { articleId, attemptTag } = job.data;
    try {
      const result = await processArticle(articleId, { attemptTag });
      if (result.state !== "unknown-receipt") {
        await sql`UPDATE articles SET processing_attempts = 0, processing_retry_at = NULL, processing_queued_at = NULL WHERE id = ${articleId}`;
      }
      return result;
    } catch (error) {
      return afterFailure(articleId, error);
    }
  });
}

/**
 * Body extraction before analysis. Failures are retried a few times; after that the article is judged
 * on the excerpt it has ("unconfirmed" body, never a wrong one).
 */
export async function registerExtractionJobs(boss: PgBoss) {
  await ensureQueue(QUEUES.extractBody);
  await boss.work<{ articleId: string }>(QUEUES.extractBody, { localConcurrency: 4, pollingIntervalSeconds: 2 }, async ([job]) => {
    if (!job) return;
    const { articleId } = job.data;
    try {
      const state = await extractArticleBody(articleId);
      await queueProcessing(articleId, { step: "analyze" });
      return { state };
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error).slice(0, 500);
      const [a] = await sql<{ processing_attempts: number }[]>`
        UPDATE articles SET processing_attempts = processing_attempts + 1, processing_error = ${`extract: ${message}`},
          processing_queued_at = NULL, processing_retry_at = now() + interval '10 minutes'
        WHERE id = ${articleId} RETURNING processing_attempts`;
      if ((a?.processing_attempts ?? MAX_EXTRACT_FAILURES) < MAX_EXTRACT_FAILURES) return { state: "retrying" };
      await sql`UPDATE articles SET body_status = 'unconfirmed', processing_attempts = 0, processing_retry_at = NULL WHERE id = ${articleId} AND body_status = 'pending'`;
      await queueProcessing(articleId, { step: "analyze" });
      return { state: "unconfirmed" };
    }
  });
}

/**
 * Safety net: articles waiting for processing that no queue holds (crash between write and enqueue,
 * a lost job, a retry that came due). Articles already queued or running are left alone.
 *
 * Peak hours take only the hourly trickle (see peakSlotsLeft) and leave the rest alone: everything it
 * would pick up is on its way to a paid call, and holding it costs nothing — those articles keep
 * `processing_state = 'new'`, so the off-peak sweep drains the whole backlog.
 */
export async function sweepUnprocessed(): Promise<{ enqueued: number }> {
  const left = await peakSlotsLeft();
  if (left <= 0) return { enqueued: 0 };
  // During peak, ask for a couple of rows per free slot: queueProcessing re-checks the quota itself,
  // and the rest of the backlog is not worth a per-article route() read every five minutes.
  const take = Number.isFinite(left) ? Math.min(60, Math.max(2, Math.ceil(left) * 2)) : 500;
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM articles
    WHERE processing_state = 'new' AND created_at < now() - interval '3 minutes'
      AND (processing_retry_at IS NULL OR processing_retry_at <= now())
      AND (processing_queued_at IS NULL OR processing_queued_at < now() - ${QUEUED_STALE}::interval)
    ORDER BY discovered_at DESC LIMIT ${take}`;
  let enqueued = 0;
  for (const r of rows) if (await queueProcessing(r.id)) enqueued += 1;
  return { enqueued };
}

/** How the runs page groups failures: the message with ids and numbers masked. */
export const failureGroupSql = (column = "processing_error") =>
  sql.unsafe(`regexp_replace(left(coalesce(${column}, '(no message)'), 120), '[0-9a-f]{8,}|[0-9]{4,}', '…', 'g')`);

/**
 * Admin: failed articles of the last 30 days back into processing, all or one failure group. The
 * first ones are queued now; the safety net picks up the rest within minutes.
 */
export async function requeueFailed(group: string | null): Promise<{ requeued: number }> {
  const rows = await sql<{ id: string }[]>`
    UPDATE articles SET processing_state = 'new', processing_attempts = 0, processing_retry_at = NULL, processing_error = NULL
    WHERE processing_state = 'failed' AND discovered_at > now() - interval '30 days'
      AND (${group}::text IS NULL OR ${failureGroupSql()} = ${group})
    RETURNING id`;
  for (const r of rows.slice(0, 500)) await queueProcessing(r.id);
  return { requeued: rows.length };
}
