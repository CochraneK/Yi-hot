// Content-group deliveries (Feishu custom-bot webhooks): selected cards and reset pushes.
// One row per target and dedupe key, so nothing is pushed twice; an outcome we cannot know
// ("unknown") is never retried automatically; content older than a target's enabled_at is never
// back-filled. FEISHU_CONTENT_PUSH_ENABLED is the safety valve: off, deliveries are recorded as
// skipped and nothing leaves the process.
//
// FEISHU_PUSH_MODE picks the cadence for selected items: `each` (one card per item), `daily` (hold
// them and post one ranked card a day, sendHotDaily) or `off`. Reset pushes are always one card.
import { config, credential } from "../config.ts";
import { sql } from "../db.ts";
import { itemUrl } from "../publication/links.ts";
import { beijingDay, postWebhook } from "./feishu.ts";
import { SITE } from "@aihot/industry/site";

/** How long a held item may wait for its daily card before it is dropped rather than sent stale. */
const HOLD_MAX_MS = 26 * 3600_000;

export interface DeliveryRequest {
  subjectKind: "codex_reset" | "selected";
  subjectId: string;
  dedupeKey: string;
  /** When the underlying content appeared; older than a target's enabled_at means skip. */
  contentAt: Date;
  card: unknown;
}

interface Target {
  key: string;
  kind: "feishu_webhook" | "feishu_chat" | "log";
  enabled_at: Date | null;
  config_ref: string | null;
}

/** Default content targets; they start disabled and are switched on in production only. */
export async function ensureContentTargets() {
  await sql`
    INSERT INTO notify_targets (key, purpose, kind, enabled, config_ref, note) VALUES
      ('feishu-content-main', 'content', 'feishu_webhook', false, 'FEISHU_PUSH_WEBHOOK_URL', '飞书内容主群'),
      ('feishu-content-mirror', 'content', 'feishu_webhook', false, 'FEISHU_PUSH_MIRROR_WEBHOOK_URL', '飞书内容镜像群')
    ON CONFLICT (key) DO NOTHING`;
}

export async function deliverContent(req: DeliveryRequest): Promise<Array<{ target: string; status: string }>> {
  const targets = await sql<Target[]>`SELECT key, kind, enabled_at, config_ref FROM notify_targets WHERE purpose = 'content' AND enabled`;
  const results: Array<{ target: string; status: string }> = [];
  for (const t of targets) {
    if (t.enabled_at && req.contentAt < t.enabled_at) continue;
    const [row] = await sql<{ id: number }[]>`
      INSERT INTO deliveries (target_key, subject_kind, subject_id, dedupe_key, status, payload)
      VALUES (${t.key}, ${req.subjectKind}, ${req.subjectId}, ${req.dedupeKey}, 'pending', ${sql.json(req.card as never)})
      ON CONFLICT (target_key, dedupe_key) DO NOTHING RETURNING id`;
    if (!row) continue; // already delivered, skipped or in doubt
    if (!config.feishuContentPushEnabled || t.kind !== "feishu_webhook") {
      await sql`UPDATE deliveries SET status = 'skipped', response = 'content push disabled', updated_at = now() WHERE id = ${row.id}`;
      results.push({ target: t.key, status: "skipped" });
      continue;
    }
    // A content group is a place people read, not a firehose. With the daily cadence the item is held
    // here and one ranked card goes out at the scheduled time; `off` keeps the record and sends nothing.
    const cadence = req.subjectKind === "selected" ? config.feishuPushMode : "each";
    if (cadence === "off") {
      await sql`UPDATE deliveries SET status = 'skipped', response = 'content push is off', updated_at = now() WHERE id = ${row.id}`;
      results.push({ target: t.key, status: "skipped" });
      continue;
    }
    if (cadence === "daily") {
      await sql`UPDATE deliveries SET status = 'held', response = 'waiting for the daily card', updated_at = now() WHERE id = ${row.id}`;
      results.push({ target: t.key, status: "held" });
      continue;
    }
    // Clearing the off-peak backlog can select hundreds of items within one hour; keep one group
    // readable by refusing above the ceiling. Capped items stay skipped, never queued for later.
    const cap = config.feishuPushMaxPerHour;
    if (cap > 0) {
      const [usage] = await sql<{ sent: number }[]>`
        SELECT count(*)::int AS sent FROM deliveries
        WHERE target_key = ${t.key} AND status = 'sent' AND sent_at > now() - interval '1 hour'`;
      if ((usage?.sent ?? 0) >= cap) {
        await sql`UPDATE deliveries SET status = 'skipped', response = 'hourly cap reached', updated_at = now() WHERE id = ${row.id}`;
        results.push({ target: t.key, status: "skipped" });
        continue;
      }
    }
    const url = t.config_ref ? credential("integrations", t.config_ref) : undefined;
    if (!url) {
      await sql`UPDATE deliveries SET status = 'failed', response = 'webhook not configured', updated_at = now() WHERE id = ${row.id}`;
      results.push({ target: t.key, status: "failed" });
      continue;
    }
    await sql`UPDATE deliveries SET status = 'sending', attempts = attempts + 1, updated_at = now() WHERE id = ${row.id}`;
    try {
      const res = await postWebhook(url, req.card);
      // A Feishu error code on HTTP 200, or a 4xx, is a definite rejection; 5xx may have gone through.
      const status = res.ok ? "sent" : res.status < 500 ? "failed" : "unknown";
      await sql`UPDATE deliveries SET status = ${status}, response = ${res.body.slice(0, 500)}, sent_at = ${res.ok ? new Date() : null}, updated_at = now() WHERE id = ${row.id}`;
      results.push({ target: t.key, status });
    } catch (error) {
      // Timeout or connection loss after sending may still have delivered: never resend.
      await sql`UPDATE deliveries SET status = 'unknown', response = ${String(error).slice(0, 500)}, updated_at = now() WHERE id = ${row.id}`;
      results.push({ target: t.key, status: "unknown" });
    }
  }
  return results;
}

interface HeldItem {
  id: number;
  article_id: string;
  title: string | null;
  category: string | null;
  score: string | null;
  created_at: Date;
}

/** A Feishu markdown link ends at the first `]`, so the label must not carry brackets of its own. */
const linkLabel = (text: string) => text.replace(/[[\]]/g, " ").replace(/\s+/g, " ").trim();

/** One card for the whole day: the ranked titles, a count, and a way into the full list. */
export function hotCard(items: HeldItem[], total: number, now: Date) {
  return {
    header: { title: { tag: "plain_text", content: `${SITE.name} · 今日热榜 · ${beijingDay(now)}` }, template: "turquoise" },
    elements: [
      {
        tag: "div",
        text: { tag: "lark_md", content: items.map((it, i) => `**${i + 1}.** [${linkLabel(it.title ?? "")}](${itemUrl(it.article_id)})`).join("\n") },
      },
      { tag: "note", elements: [{ tag: "plain_text", content: total > items.length ? `今日入选 ${total} 条，这里按热度列出前 ${items.length} 条` : `今日入选 ${total} 条` }] },
      { tag: "action", actions: [{ tag: "button", text: { tag: "plain_text", content: "看完整热榜" }, url: `${config.siteUrl}/hot`, type: "primary" }] },
    ],
  };
}

/**
 * The daily card: everything held since the last one, ranked by the selection score, in a single
 * message. Items that waited more than a day are dropped instead of sent stale — a missed slot is
 * not worth a week-old list. A card the chat rejected outright (a disabled bot, a bad payload) puts
 * its items back in the hold so the next run can still use them; a 5xx is never retried.
 */
export async function sendHotDaily(now = new Date()): Promise<Array<{ target: string; status: string; shown?: number; total?: number }>> {
  const targets = await sql<Array<{ key: string; config_ref: string | null }>>`
    SELECT key, config_ref FROM notify_targets WHERE purpose = 'content' AND enabled AND kind = 'feishu_webhook'`;
  const results: Array<{ target: string; status: string; shown?: number; total?: number }> = [];
  const cutoff = new Date(now.getTime() - HOLD_MAX_MS);
  for (const t of targets) {
    await sql`UPDATE deliveries SET status = 'skipped', response = 'held too long for the daily card', updated_at = now()
              WHERE target_key = ${t.key} AND status = 'held' AND created_at < ${cutoff}`;
    const rows = await sql<HeldItem[]>`
      SELECT d.id, d.subject_id AS article_id, p.title, p.category, p.score, d.created_at
      FROM deliveries d LEFT JOIN publications p ON p.article_id = d.subject_id
      WHERE d.target_key = ${t.key} AND d.status = 'held' AND d.subject_kind = 'selected'
      ORDER BY p.score DESC NULLS LAST, d.created_at DESC`;
    const gone = rows.filter((r) => r.title === null).map((r) => r.id);
    if (gone.length) {
      await sql`UPDATE deliveries SET status = 'skipped', response = 'article no longer published', updated_at = now() WHERE id = ANY(${gone})`;
    }
    const live = rows.filter((r): r is HeldItem & { title: string } => r.title !== null);
    if (!live.length) {
      results.push({ target: t.key, status: "empty" });
      continue;
    }
    const top = live.slice(0, Math.max(1, config.feishuHotTop));
    const below = live.slice(top.length).map((r) => r.id);
    const url = t.config_ref ? credential("integrations", t.config_ref) : undefined;
    if (!url) {
      // The targets stay held: a missing webhook is a setup problem, not a reason to drop the day.
      await sql`UPDATE deliveries SET response = 'webhook not configured', updated_at = now() WHERE id = ANY(${top.map((r) => r.id)})`;
      results.push({ target: t.key, status: "failed", shown: top.length, total: live.length });
      continue;
    }
    const ids = top.map((r) => r.id);
    await sql`UPDATE deliveries SET status = 'sending', attempts = attempts + 1, updated_at = now() WHERE id = ANY(${ids})`;
    try {
      const res = await postWebhook(url, hotCard(top, live.length, now));
      if (res.ok) {
        await sql`UPDATE deliveries SET status = 'sent', response = ${res.body.slice(0, 500)}, sent_at = ${now}, updated_at = now() WHERE id = ANY(${ids})`;
        results.push({ target: t.key, status: "sent", shown: top.length, total: live.length });
        if (below.length) {
          // Bookkeeping only. Kept out of the send path and out of the catch below: a broken UPDATE
          // here once turned a delivered card into ten "unknown" rows.
          try {
            await sql`UPDATE deliveries SET status = 'skipped', response = ${"below today's top"}, updated_at = now() WHERE id = ANY(${below})`;
          } catch (error) {
            console.warn(`[notify] could not shelve ${below.length} below-top deliveries: ${String(error)}`);
          }
        }
      } else if (res.status < 500) {
        // A definite rejection (19007, a bad payload): nothing reached the group, so the items go
        // back to held and ride the next card instead of being lost.
        await sql`UPDATE deliveries SET status = 'held', response = ${`daily card rejected: ${res.body}`.slice(0, 500)}, updated_at = now() WHERE id = ANY(${ids})`;
        results.push({ target: t.key, status: "rejected", shown: top.length, total: live.length });
      } else {
        // 5xx may have delivered anyway: never resend, and never claim the items are still waiting.
        await sql`UPDATE deliveries SET status = 'unknown', response = ${res.body.slice(0, 500)}, updated_at = now() WHERE id = ANY(${ids})`;
        results.push({ target: t.key, status: "unknown", shown: top.length, total: live.length });
      }
    } catch (error) {
      await sql`UPDATE deliveries SET status = 'unknown', response = ${String(error).slice(0, 500)}, updated_at = now() WHERE id = ANY(${ids})`;
      results.push({ target: t.key, status: "unknown", shown: top.length, total: live.length });
    }
  }
  return results;
}

/**
 * Sends a stored delivery again after an operator checked the group and found it missing. Only
 * for deliveries in doubt or definitely failed; the safety valve still applies.
 */
export async function resendDelivery(id: number): Promise<{ status: string }> {
  const [d] = await sql<{ status: string; payload: unknown; target_key: string; config_ref: string | null; kind: string }[]>`
    SELECT d.status, d.payload, d.target_key, t.config_ref, t.kind FROM deliveries d JOIN notify_targets t ON t.key = d.target_key WHERE d.id = ${id}`;
  if (!d) throw new Error(`delivery ${id} not found`);
  if (d.status !== "unknown" && d.status !== "failed") throw new Error(`delivery ${id} is ${d.status}`);
  if (!config.feishuContentPushEnabled || d.kind !== "feishu_webhook") throw new Error("content push is disabled in this environment");
  const url = d.config_ref ? credential("integrations", d.config_ref) : undefined;
  if (!url) throw new Error("webhook not configured");
  await sql`UPDATE deliveries SET status = 'sending', attempts = attempts + 1, updated_at = now() WHERE id = ${id}`;
  try {
    const res = await postWebhook(url, d.payload);
    const status = res.ok ? "sent" : res.status < 500 ? "failed" : "unknown";
    await sql`UPDATE deliveries SET status = ${status}, response = ${res.body.slice(0, 500)}, sent_at = ${res.ok ? new Date() : null}, updated_at = now() WHERE id = ${id}`;
    return { status };
  } catch (error) {
    await sql`UPDATE deliveries SET status = 'unknown', response = ${String(error).slice(0, 500)}, updated_at = now() WHERE id = ${id}`;
    return { status: "unknown" };
  }
}

/**
 * Deliveries a stopped process left half way: "sending" may have reached the group, so it becomes
 * "unknown" (alerted, resolved in the admin); "pending" never left, so it becomes "failed" (the
 * admin can send it). Nothing is re-sent automatically.
 */
export async function markStaleDeliveries(): Promise<{ unknown: number; failed: number; held: number }> {
  const cutoff = new Date(Date.now() - 15 * 60_000);
  // Held rows wait for the daily card, so they go stale on the hold budget rather than the send one;
  // without this a target switched back to `each` would keep holding rows nothing ever flushes.
  const held = await sql`UPDATE deliveries SET status = 'skipped', response = coalesce(response, 'held too long for the daily card'), updated_at = now()
                        WHERE status = 'held' AND created_at < ${new Date(Date.now() - HOLD_MAX_MS)}`;
  const unknown = await sql`UPDATE deliveries SET status = 'unknown', response = coalesce(response, '发送中进程中断，是否送达未知'), updated_at = now()
                            WHERE status = 'sending' AND updated_at < ${cutoff}`;
  const failed = await sql`UPDATE deliveries SET status = 'failed', response = coalesce(response, '发送前进程中断，没有发出'), updated_at = now()
                           WHERE status = 'pending' AND updated_at < ${cutoff}`;
  return { unknown: unknown.count, failed: failed.count, held: held.count };
}
