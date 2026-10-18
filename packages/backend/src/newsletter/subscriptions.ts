import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { credential, config } from "../config.ts";
import { sql } from "../db.ts";
import { listReports, loadReport, type ReportKind } from "../publication/reports.ts";
import { FEATURES } from "@aihot/industry/features";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const secret = () => credential("auth", "SESSION_SECRET") ?? "";

function signedToken(id: number, purpose: string, days = 366): string {
  const exp = Math.floor(Date.now() / 1000) + days * 86400;
  const value = `${id}.${exp}.${purpose}`;
  const sig = createHmac("sha256", secret()).update(value).digest("base64url");
  return `${id}.${exp}.${sig}`;
}

function verifySigned(token: string, purpose: string): number | null {
  const [rawId, rawExp, given = ""] = token.split(".");
  const id = Number(rawId), exp = Number(rawExp);
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(exp) || exp < Date.now() / 1000) return null;
  const expected = createHmac("sha256", secret()).update(`${id}.${exp}.${purpose}`).digest("base64url");
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

export async function requestSubscription(input: { email?: unknown; weekly?: unknown; monthly?: unknown; daily?: unknown }) {
  const email = String(input.email ?? "").trim().toLowerCase().slice(0, 254);
  if (!EMAIL.test(email)) throw Object.assign(new Error("请输入有效邮箱地址"), { statusCode: 400 });
  const weekly = input.weekly !== false;
  const monthly = input.monthly !== false;
  const daily = input.daily === true;
  if (!weekly && !monthly && !daily) throw Object.assign(new Error("请至少选择日报、周报或月报"), { statusCode: 400 });
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hash(token);
  const expires = new Date(Date.now() + 48 * 3600_000);
  const [row] = await sql<{ id: number; status: string }[]>`
    INSERT INTO newsletter_subscriptions (email, weekly, monthly, daily, status, confirm_token_hash, confirm_expires_at, updated_at)
    VALUES (${email}, ${weekly}, ${monthly}, ${daily}, 'pending', ${tokenHash}, ${expires}, now())
    ON CONFLICT ((lower(email))) DO UPDATE SET
      weekly = CASE WHEN newsletter_subscriptions.status = 'active' THEN newsletter_subscriptions.weekly ELSE EXCLUDED.weekly END,
      monthly = CASE WHEN newsletter_subscriptions.status = 'active' THEN newsletter_subscriptions.monthly ELSE EXCLUDED.monthly END,
      daily = CASE WHEN newsletter_subscriptions.status = 'active' THEN newsletter_subscriptions.daily ELSE EXCLUDED.daily END,
      pending_weekly = CASE WHEN newsletter_subscriptions.status = 'active' THEN EXCLUDED.weekly ELSE NULL END,
      pending_monthly = CASE WHEN newsletter_subscriptions.status = 'active' THEN EXCLUDED.monthly ELSE NULL END,
      pending_daily = CASE WHEN newsletter_subscriptions.status = 'active' THEN EXCLUDED.daily ELSE NULL END,
      status = CASE WHEN newsletter_subscriptions.status = 'active' THEN 'active' ELSE 'pending' END,
      confirm_token_hash = EXCLUDED.confirm_token_hash, confirm_expires_at = EXCLUDED.confirm_expires_at,
      updated_at = now()
    RETURNING id, status`;
  if (row) {
    const confirmUrl = `${config.siteUrl}/subscribe/confirm?token=${encodeURIComponent(token)}`;
    await sql`INSERT INTO newsletter_outbox (subscription_id, kind, dedupe_key, payload)
      VALUES (${row.id}, 'confirmation', ${`confirm:${row.id}:${tokenHash}`}, ${sql.json({ email, weekly, monthly, daily, confirmUrl } as never)})
      ON CONFLICT (dedupe_key) DO NOTHING`;
  }
  return { ok: true, state: "confirmation_sent" };
}

export async function confirmSubscription(token: string) {
  const tokenHash = hash(token);
  const [row] = await sql<{ id: number }[]>`UPDATE newsletter_subscriptions SET
    weekly = coalesce(pending_weekly, weekly), monthly = coalesce(pending_monthly, monthly), daily = coalesce(pending_daily, daily),
    pending_weekly = NULL, pending_monthly = NULL, pending_daily = NULL,
    status = 'active', confirmed_at = coalesce(confirmed_at, now()),
    confirm_token_hash = NULL, confirm_expires_at = NULL, unsubscribed_at = NULL, updated_at = now()
    WHERE confirm_token_hash = ${tokenHash} AND confirm_expires_at > now() AND status IN ('pending','active') RETURNING id`;
  return { ok: !!row, state: row ? "confirmed" : "invalid" };
}

export async function unsubscribe(token: string) {
  const id = verifySigned(token, "unsubscribe");
  if (!id) return { ok: false, state: "invalid" };
  const [row] = await sql<{ id: number }[]>`UPDATE newsletter_subscriptions SET status = 'unsubscribed', unsubscribed_at = now(), updated_at = now()
    WHERE id = ${id} AND status <> 'unsubscribed' RETURNING id`;
  await sql`UPDATE newsletter_outbox SET status = 'cancelled', updated_at = now() WHERE subscription_id = ${id} AND status IN ('pending','failed')`;
  return { ok: true, state: row ? "unsubscribed" : "already_unsubscribed" };
}

export async function syncLatestReports() {
  let queued = 0;
  for (const kind of ["daily", "weekly", "monthly"] as const) {
    if (kind === "daily" && !FEATURES.dailyNewsletter) continue;
    const latest = (await listReports(kind, 1))[0];
    if (!latest) continue;
    const report = await loadReport(kind, latest.key);
    if (!report) continue;
    const subs = await sql<{ id: number; email: string; confirmed_at: Date }[]>`SELECT id, email, confirmed_at FROM newsletter_subscriptions WHERE status = 'active'
      AND ((${kind} = 'daily' AND daily) OR (${kind} = 'weekly' AND weekly) OR (${kind} = 'monthly' AND monthly))`;
    for (const sub of subs) {
      // Confirmation starts delivery from the next issue; subscribing must never dump archives.
      if (!sub.confirmed_at || new Date(report.generatedAt) <= sub.confirmed_at) continue;
      const unsubscribeUrl = `${config.siteUrl}/subscribe/unsubscribe?token=${encodeURIComponent(signedToken(sub.id, "unsubscribe"))}`;
      const rows = await sql`INSERT INTO newsletter_outbox (subscription_id, kind, dedupe_key, payload)
        VALUES (${sub.id}, 'report', ${`report:${kind}:${latest.key}:${sub.id}`}, ${sql.json({ email: sub.email, report, unsubscribeUrl } as never)})
        ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`;
      queued += rows.length;
    }
  }
  return { queued };
}

export async function claimOutbox(limit = 20) {
  return sql.begin(async (tx) => {
    const rows = await tx<{ id: number; kind: string; payload: any; attempts: number }[]>`
      SELECT id, kind, payload, attempts FROM newsletter_outbox
      WHERE status IN ('pending','failed') AND available_at <= now() AND attempts < 5
      ORDER BY id FOR UPDATE SKIP LOCKED LIMIT ${Math.max(1, Math.min(50, limit))}`;
    if (rows.length) await tx`UPDATE newsletter_outbox SET status = 'sending', leased_at = now(), attempts = attempts + 1, updated_at = now() WHERE id = ANY(${rows.map((r) => r.id)})`;
    return rows;
  });
}

export async function recordOutboxResult(id: number, status: "sent" | "failed" | "unknown", response: string) {
  const [row] = await sql<{ id: number }[]>`UPDATE newsletter_outbox SET status = ${status}, response = ${response.slice(0, 500)},
    sent_at = CASE WHEN ${status} = 'sent' THEN now() ELSE sent_at END,
    available_at = CASE WHEN ${status} = 'failed' THEN now() + interval '30 minutes' ELSE available_at END, updated_at = now()
    WHERE id = ${id} AND status = 'sending' RETURNING id`;
  return { ok: !!row };
}

export async function recordBounce(email: string, diagnostic = "") {
  const normalized = email.trim().toLowerCase();
  const [row] = await sql<{ id: number }[]>`UPDATE newsletter_subscriptions SET bounce_count = bounce_count + 1, last_bounce_at = now(),
    status = 'bounced', updated_at = now() WHERE lower(email) = ${normalized} AND status = 'active' RETURNING id`;
  if (row) {
    await sql`UPDATE newsletter_outbox SET status = 'cancelled', response = ${`bounce: ${diagnostic}`.slice(0, 500)}, updated_at = now()
      WHERE subscription_id = ${row.id} AND status IN ('pending','failed')`;
  }
  return { ok: true, matched: !!row };
}

export async function recoverStaleOutbox() {
  const rows = await sql`UPDATE newsletter_outbox SET status = 'unknown', response = coalesce(response, 'sender interrupted'), updated_at = now()
    WHERE status = 'sending' AND leased_at < now() - interval '30 minutes'`;
  return { unknown: rows.count };
}
