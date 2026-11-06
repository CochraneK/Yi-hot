// Read-only list of newsletter subscribers for the admin console. Manual changes
// (cancel / change preferences) still go through the database or the reader's
// self-service unsubscribe link, so this module only ever SELECTs.
import { sql } from "../db.ts";

export interface SubscriptionRow {
  id: number;
  email: string;
  status: "pending" | "active" | "unsubscribed" | "bounced" | "complained";
  weekly: boolean;
  monthly: boolean;
  daily: boolean;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  bounce_count: number;
  last_bounce_at: string | null;
  sent_7d: number;
}

export interface SubscriptionList {
  rows: SubscriptionRow[];
  total: number;
  page: number;
  hasMore: boolean;
  counts: { total: number; active: number; pending: number; unsubscribed: number; bounced: number; complained: number; sent_7d: number };
}

function buildWhere(status?: string, kind?: string, q?: string) {
  const conds = [sql`TRUE`];
  if (status) conds.push(sql`status = ${status}`);
  if (kind === "daily") conds.push(sql`daily IS TRUE`);
  else if (kind === "weekly") conds.push(sql`weekly IS TRUE`);
  else if (kind === "monthly") conds.push(sql`monthly IS TRUE`);
  if (q) conds.push(sql`lower(email) LIKE ${`%${q.toLowerCase()}%`}`);
  // postgres.js has no sql.join: fragments are composed by nesting them in another tagged template.
  return conds.reduce((acc, c) => sql`${acc} AND ${c}`);
}

export async function listSubscriptions(input: { status?: string; kind?: string; q?: string; page?: number }): Promise<SubscriptionList> {
  const page = Math.max(1, Number(input.page) || 1);
  const limit = 50;
  const offset = (page - 1) * limit;
  const where = buildWhere(input.status, input.kind, input.q);

  const [countRow] = await sql<{ c: number }[]>`
    SELECT count(*)::int AS c FROM newsletter_subscriptions WHERE ${where}`;
  const rows: SubscriptionRow[] = (await sql<Omit<SubscriptionRow, "sent_7d">[]>`
    SELECT id, email, status, weekly, monthly, daily, confirmed_at, created_at, updated_at, bounce_count, last_bounce_at
    FROM newsletter_subscriptions WHERE ${where}
    ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`).map((r) => ({ ...r, sent_7d: 0 }));

  if (rows.length) {
    const ids = rows.map((r) => r.id);
    const sent = await sql<{ subscription_id: number; n: number }[]>`
      SELECT subscription_id, count(*)::int AS n FROM newsletter_outbox
      WHERE subscription_id = ANY(${ids}) AND kind = 'report' AND status = 'sent' AND sent_at > now() - interval '7 days'
      GROUP BY subscription_id`;
    const map = new Map(sent.map((s) => [s.subscription_id, s.n]));
    for (const r of rows) r.sent_7d = map.get(r.id) ?? 0;
  }

  const [agg] = await sql<Record<string, number>[]>`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status = 'active')::int AS active,
      count(*) FILTER (WHERE status = 'pending')::int AS pending,
      count(*) FILTER (WHERE status = 'unsubscribed')::int AS unsubscribed,
      count(*) FILTER (WHERE status = 'bounced')::int AS bounced,
      count(*) FILTER (WHERE status = 'complained')::int AS complained
    FROM newsletter_subscriptions`;
  const [s7] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM newsletter_outbox WHERE kind = 'report' AND status = 'sent' AND sent_at > now() - interval '7 days'`;

  return {
    rows,
    total: countRow.c,
    page,
    hasMore: offset + rows.length < countRow.c,
    counts: {
      total: agg.total,
      active: agg.active,
      pending: agg.pending,
      unsubscribed: agg.unsubscribed,
      bounced: agg.bounced,
      complained: agg.complained,
      sent_7d: s7?.n ?? 0,
    },
  };
}
