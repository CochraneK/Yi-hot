// Paid requests (models, SocialData, Jina, Dajiala) go through here.
//
// 1. A logical request has a stable key bound to task, input revision, provider, model, prompt and config.
// 2. Before calling, a placeholder row and an attempt row are persisted; budgets count attempts.
// 3. The raw response is saved before any business write; recovery reuses a received response.
// 4. A request whose outcome is unknown (timeout after sending, crash mid-flight) is not re-sent by the
//    caller. ops.recover releases it once after 30 minutes (admin/runs.ts), so a lost answer costs at
//    most one repeat; after that it waits for the admin.
import { sql, type Db } from "../db.ts";
import { sha256, stableJson } from "../lib/ids.ts";

export class BudgetExceededError extends Error {
  readonly service: string;
  /**
   * 撞的是哪个窗口：`stopped` 是运营把预算调成 0（整项服务停摆），`provider` 是供应商刚拒付
   * （402 / 账务类 429）后挂的冷却，其余是用完了当天的额度。
   */
  readonly window: string;
  readonly retryAfterSeconds: number;
  constructor(service: string, window: string, retryAfterSeconds: number) {
    super(`Budget for ${service} exhausted (${window})`);
    this.service = service;
    this.window = window;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ReceiptBusyError extends Error {}

export class ReceiptUnknownError extends Error {
  readonly receiptId: number;
  constructor(receiptId: number, message: string) {
    super(message);
    this.receiptId = receiptId;
  }
}

/** Raised by a call when the provider clearly did not accept (and will not bill) the request. */
export class ProviderRejectedError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;
  /** Provider told us when to come back (seconds); null when it did not say. */
  readonly retryAfterSeconds: number | null;
  constructor(message: string, status: number | null, retryable: boolean, retryAfterSeconds: number | null = null) {
    super(message);
    this.status = status;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** The provider boundary accepts both OpenAI-compatible nested errors and flat provider errors. */
function rejectionDetail(body: string): { code: string; message: string } {
  let data: unknown;
  try { data = JSON.parse(body); } catch { return { code: "", message: body }; }
  if (!data || typeof data !== "object") return { code: "", message: body };
  const root = data as Record<string, unknown>;
  const error = root.error && typeof root.error === "object" ? root.error as Record<string, unknown> : root;
  return {
    code: typeof error.code === "string" || typeof error.code === "number" ? String(error.code) : typeof error.type === "string" ? error.type : "",
    message: typeof error.message === "string" ? error.message : typeof root.error === "string" ? root.error : body,
  };
}

/** Account or spending refusals: the key is unusable or the money is gone, so retrying cannot help. */
export function providerAccessRefused(service: string, error: string): boolean {
  const http = /(?:^| )HTTP (\d{3})(?:: ?| )([\s\S]*)$/.exec(error);
  if (!http) return false;
  const status = Number(http[1]);
  if ([401, 402, 403].includes(status)) return true;
  if (status !== 429) return false;
  const { code, message } = rejectionDetail(http[2]!);
  if (["GoUsageLimitError", "FreeUsageLimitError", "CreditLimitExceeded", "credit_balance_exhausted", "organization_usage_limit_exceeded", "organization_spend_limit_exceeded", "project_spend_limit_exceeded"].includes(code)) return true;
  if (service === "zhipu" && ["1113", "1308", "1309", "1310", "1311", "1314", "1315", "1316", "1317", "1318", "1319", "1320", "1321"].includes(code)) return true;
  if (service === "dashscope") {
    if (["CommodityNotPurchased", "PrepaidBillOverdue", "PostpaidBillOverdue", "BudgetLimitExceeded"].includes(code)) return true;
    // AllocationQuota / insufficient_quota usually means TPM throttling here, not spent money.
    if (["Throttling.AllocationQuota", "insufficient_quota"].includes(code) && message.trim() === "Free allocated quota exceeded.") return true;
  }
  // A bare quota/limit/insufficient word is not evidence that buying capacity is required.
  return /\binsufficient (?:account |credit )?balance\b|\b(?:credit )?balance (?:is )?(?:exhausted|insufficient)\b|账户.*欠费|余额不足/i.test(message);
}

/**
 * A refusal every later request would meet too: the account cannot pay or the plan is spent.
 * 401/403 can be about one resource (a private post) and 429 can be a TPM/RPM throttle, so neither stops
 * anything; the alert layer still reports them.
 */
export function providerSpendingRefused(service: string, error: string): boolean {
  const http = /(?:^| )HTTP (\d{3})(?:: ?| )([\s\S]*)$/.exec(error);
  if (!http) return false;
  const status = Number(http[1]);
  if (status === 402) return true;
  if (status !== 429) return false;
  return providerAccessRefused(service, error);
}

export interface CallOutcome {
  response: unknown;
  requestId?: string | null;
  usage?: Record<string, unknown> | null;
  cost?: { amount: number; currency: string; basis: "actual" | "estimated" } | null;
}

export interface ReceiptRequest {
  service: string;
  model?: string | null;
  purpose: string;
  subject?: string | null;
  /** Everything that determines the output. Hashed into the logical key; only a redacted summary is stored. */
  identity: unknown;
  /** Stored for diagnosis; must not contain secrets. */
  requestSummary?: Record<string, unknown>;
  /** Distinguishes an explicit re-run (e.g. admin "re-evaluate") from recovery of the same request. */
  attemptTag?: string;
}

export interface ReceiptResult {
  receiptId: number;
  response: unknown;
  reused: boolean;
}

const PENDING_STALE_MS = 10 * 60 * 1000;

export function logicalKeyFor(req: ReceiptRequest): string {
  const identity = sha256(stableJson(req.identity));
  return [req.service, req.purpose, req.model ?? "-", identity, req.attemptTag ?? "0"].join(":");
}

interface ReceiptRow {
  id: number;
  status: string;
  response: unknown;
  created_at: Date;
  updated_at: Date;
}

/** How long a provider's access/billing refusal stops new calls to it. */
export const PROVIDER_STOP_SECONDS = 900;
/**
 * The stop is a state, not a finding: the refused-provider alert stays open until a newer successful
 * call, so the stop expiring never reads as a recovery. Like that alert it is per model: a quota can be
 * one model's, and the service's other models stay callable.
 */
export const providerStopKey = (service: string, model?: string | null) =>
  `provider.stop.${service}${model == null ? "" : `:${encodeURIComponent(model)}`}`;

/** Until when new calls under this stop are held, in epoch milliseconds; null when they may be sent. */
async function stopUntil(tx: Db, key: string): Promise<number | null> {
  const [row] = await tx<{ value: { until?: string } }[]>`SELECT value FROM settings WHERE key = ${key}`;
  const until = Date.parse(row?.value?.until ?? "");
  return Number.isFinite(until) && until > Date.now() ? until : null;
}

/** Record the stop an access refusal implies, and drop the ones that expired a day ago while here. */
async function stopForRefusal(tx: Db, key: string): Promise<void> {
  const now = Date.now();
  const until = new Date(now + PROVIDER_STOP_SECONDS * 1000).toISOString();
  await tx`INSERT INTO settings (key, value, updated_by) VALUES (${key}, ${tx.json({ until, refusedAt: new Date(now).toISOString() } as never)}, 'receipts')
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
  await tx`DELETE FROM settings WHERE key LIKE 'provider.stop.%'
           AND coalesce((value->>'until')::timestamptz, 'epoch') < now() - interval '1 day'`;
}

/** A received answer proves access is back: the stop can go. */
async function clearStop(tx: Db, key: string): Promise<void> {
  await tx`DELETE FROM settings WHERE key = ${key}`;
}

async function checkBudget(tx: Db, service: string, model?: string | null): Promise<void> {
  // A model that refused on access or billing is not called again until its stop runs out: one refused
  // request per cooldown, not one per article. Requests already in flight cannot be stopped.
  const stopped = await stopUntil(tx, providerStopKey(service, model));
  if (stopped !== null) throw new BudgetExceededError(service, "provider", Math.ceil((stopped - Date.now()) / 1000));
  const [budget] = await tx<{ per_minute: number; per_hour: number; per_day: number }[]>`
    SELECT per_minute, per_hour, per_day FROM budgets WHERE service = ${service}`;
  if (!budget) return; // default rows come with the migrations; a service an operator removed is unlimited
  // Every request sent counts, retries of the same logical request included.
  const [counts] = await tx<{ minute: number; hour: number; day: number }[]>`
    SELECT
      count(*) FILTER (WHERE started_at > now() - interval '1 minute') AS minute,
      count(*) FILTER (WHERE started_at > now() - interval '1 hour') AS hour,
      count(*) AS day
    FROM receipt_attempts
    WHERE service = ${service} AND origin = 'live' AND started_at > now() - interval '1 day'`;
  const c = counts!;
  if (budget.per_minute <= 0 || budget.per_hour <= 0 || budget.per_day <= 0) {
    throw new BudgetExceededError(service, "stopped", 3600);
  }
  if (c.minute >= budget.per_minute) throw new BudgetExceededError(service, "minute", 60);
  if (c.hour >= budget.per_hour) throw new BudgetExceededError(service, "hour", 600);
  if (c.day >= budget.per_day) throw new BudgetExceededError(service, "day", 3600);
}

/**
 * Runs a paid request at most once per logical key and returns its raw response.
 * The caller parses the response and commits business results, then calls completeReceipt.
 */
export async function paidRequest(req: ReceiptRequest, call: () => Promise<CallOutcome>): Promise<ReceiptResult> {
  const logicalKey = logicalKeyFor(req);

  const claimed = await sql.begin(async (tx) => {
    // Serialise budget checks per service so concurrent workers cannot overshoot.
    await tx`SELECT pg_advisory_xact_lock(hashtext(${"budget:" + req.service}))`;
    const [existing] = await tx<ReceiptRow[]>`
      SELECT id, status, response, created_at, updated_at FROM receipts WHERE logical_key = ${logicalKey} FOR UPDATE`;
    if (existing) {
      if (existing.status === "received" || existing.status === "completed") return { kind: "reuse" as const, row: existing };
      if (existing.status === "pending") {
        if (Date.now() - existing.updated_at.getTime() < PENDING_STALE_MS) return { kind: "busy" as const, row: existing };
        await markUnknown(tx, existing.id, "placeholder went stale without a recorded result");
        return { kind: "unknown" as const, row: existing };
      }
      if (existing.status === "unknown") return { kind: "unknown" as const, row: existing };
      // failed: the provider did not take the request, or its answer was unusable; a new attempt is allowed.
      await checkBudget(tx, req.service, req.model);
      const [r] = await tx<{ attempts: number }[]>`
        UPDATE receipts SET status = 'pending', attempts = attempts + 1, error = NULL, updated_at = now() WHERE id = ${existing.id} RETURNING attempts`;
      const attemptId = await startAttempt(tx, existing.id, r!.attempts, req);
      return { kind: "call" as const, id: existing.id, attemptId };
    }
    await checkBudget(tx, req.service, req.model);
    const [row] = await tx<{ id: number }[]>`
      INSERT INTO receipts (logical_key, service, model, purpose, subject, status, request, attempts)
      VALUES (${logicalKey}, ${req.service}, ${req.model ?? null}, ${req.purpose}, ${req.subject ?? null}, 'pending',
              ${tx.json((req.requestSummary ?? {}) as never)}, 1)
      RETURNING id`;
    const attemptId = await startAttempt(tx, row!.id, 1, req);
    return { kind: "call" as const, id: row!.id, attemptId };
  });

  if (claimed.kind === "reuse") return { receiptId: claimed.row.id, response: claimed.row.response, reused: true };
  if (claimed.kind === "busy") throw new ReceiptBusyError(`Receipt ${claimed.row.id} is in flight`);
  if (claimed.kind === "unknown") {
    throw new ReceiptUnknownError(claimed.row.id, `Receipt ${claimed.row.id} has an unknown outcome; it is released once automatically, then from the admin`);
  }

  const { id: receiptId, attemptId } = claimed;
  const started = Date.now();
  let outcome: CallOutcome;
  try {
    outcome = await call();
  } catch (error) {
    // The same classification the alert layer uses, narrowed to what no later request can avoid: an
    // account/spending refusal (not a throttle or a private resource) also stops new calls to the service.
    const spendingRefused = error instanceof ProviderRejectedError && providerSpendingRefused(req.service, error.message);
    const status = error instanceof ProviderRejectedError ? "failed" : "unknown";
    // "unknown": the request may have reached the provider (timeout, reset): do not re-send automatically.
    const message = (error instanceof ProviderRejectedError ? error.message : String(error)).slice(0, 2000);
    await sql.begin(async (tx) => {
      await tx`UPDATE receipts SET status = ${status}, error = ${message}, updated_at = now() WHERE id = ${receiptId}`;
      await tx`UPDATE receipt_attempts SET status = ${status}, error = ${message}, latency_ms = ${Date.now() - started}, finished_at = now() WHERE id = ${attemptId}`;
      // One refused request per cooldown, not one per article: the rest wait instead of each burning a
      // terminal failure.
      if (spendingRefused) await stopForRefusal(tx, providerStopKey(req.service, req.model));
    });
    throw error;
  }

  await sql.begin(async (tx) => {
    await tx`
      UPDATE receipts SET
        status = 'received',
        response = ${tx.json((outcome.response ?? null) as never)},
        request_id = ${outcome.requestId ?? null},
        usage = ${outcome.usage ? tx.json(outcome.usage as never) : null},
        cost = ${outcome.cost?.amount ?? null},
        currency = ${outcome.cost?.currency ?? null},
        cost_basis = ${outcome.cost?.basis ?? null},
        received_at = now(),
        updated_at = now()
      WHERE id = ${receiptId}`;
    await tx`
      UPDATE receipt_attempts SET
        status = 'received', request_id = ${outcome.requestId ?? null}, usage = ${outcome.usage ? tx.json(outcome.usage as never) : null},
        cost = ${outcome.cost?.amount ?? null}, currency = ${outcome.cost?.currency ?? null}, cost_basis = ${outcome.cost?.basis ?? null},
        latency_ms = ${Date.now() - started}, finished_at = now()
      WHERE id = ${attemptId}`;
    // A real answer is the only proof that access is back; it releases a stop without waiting for it.
    await clearStop(tx, providerStopKey(req.service, req.model));
  });
  return { receiptId, response: outcome.response, reused: false };
}

async function startAttempt(tx: Db, receiptId: number, attempt: number, req: ReceiptRequest): Promise<number> {
  const [row] = await tx<{ id: number }[]>`
    INSERT INTO receipt_attempts (receipt_id, attempt, service, model, status) VALUES (${receiptId}, ${attempt}, ${req.service}, ${req.model ?? null}, 'pending')
    RETURNING id`;
  return row!.id;
}

async function markUnknown(tx: Db, receiptId: number, reason: string) {
  await tx`UPDATE receipts SET status = 'unknown', error = ${reason}, updated_at = now() WHERE id = ${receiptId}`;
  await tx`UPDATE receipt_attempts SET status = 'unknown', error = ${reason}, finished_at = now() WHERE receipt_id = ${receiptId} AND status = 'pending'`;
}

/**
 * Placeholders left behind by a process that stopped mid-request (crash, kill) become "unknown", so
 * they are released like any other unknown outcome even when nothing retries them.
 */
export async function markStalePendingReceipts(): Promise<number> {
  const stale = await sql<{ id: number }[]>`SELECT id FROM receipts WHERE status = 'pending' AND updated_at < ${new Date(Date.now() - PENDING_STALE_MS)}`;
  for (const r of stale) await sql.begin((tx) => markUnknown(tx, r.id, "placeholder went stale without a recorded result"));
  return stale.length;
}

export async function completeReceipt(db: Db, receiptId: number): Promise<void> {
  await db`UPDATE receipts SET status = 'completed', completed_at = coalesce(completed_at, now()), updated_at = now() WHERE id = ${receiptId}`;
}

/** Marks a received response that could not be used (e.g. unparsable) so a fresh attempt can be made. */
export async function rejectReceivedResponse(receiptId: number, reason: string): Promise<void> {
  await sql`UPDATE receipts SET status = 'failed', error = ${reason.slice(0, 2000)}, updated_at = now() WHERE id = ${receiptId}`;
}
