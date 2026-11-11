// Newsletter regressions run only in the isolated *_test / *_ci database.
// They do not deliver email; the outbox is inspected as committed SQL data.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { confirmSubscription, requestSubscription } from "@aihot/backend/newsletter/subscriptions";

const email = `newsletter-p1-${tag()}@example.org`;
type Subscription = {
  id: number; status: string; confirm_token_hash: string | null;
  weekly: boolean; monthly: boolean; daily: boolean;
  pending_weekly: boolean | null; pending_monthly: boolean | null; pending_daily: boolean | null;
};
type Outbox = { id: number; dedupe_key: string; status: string; payload: { confirmUrl: string; weekly: boolean; monthly: boolean; daily: boolean } };
const state = async () => {
  const [sub] = await sql<Subscription[]>`SELECT id,status,confirm_token_hash,weekly,monthly,daily,
    pending_weekly,pending_monthly,pending_daily FROM newsletter_subscriptions WHERE lower(email)=${email}`;
  const outbox = sub ? await sql<Outbox[]>`SELECT id,dedupe_key,status,payload FROM newsletter_outbox
    WHERE subscription_id=${sub.id} AND kind='confirmation' ORDER BY id` : [];
  return { sub, outbox };
};
const tokenOf = (row: Outbox) => new URL(row.payload.confirmUrl).searchParams.get("token")!;

after(async () => {
  await sql`DELETE FROM newsletter_subscriptions WHERE lower(email)=${email}`;
  await closeDb();
});

test("concurrent identical subscriptions use one durable token and one confirmation task", async () => {
  const requests = Array.from({ length: 4 }, () => requestSubscription({ email, weekly: true, monthly: true, daily: false }));
  const results = await Promise.all(requests);
  assert.ok(results.every(result => result.ok && result.state === "confirmation_sent"));
  const { sub, outbox } = await state();
  assert.ok(sub);
  assert.equal(sub.status, "pending");
  assert.equal(outbox.length, 1, "duplicate requests must not enqueue multiple confirmation messages");
  assert.equal(outbox[0]!.status, "pending");
  await requestSubscription({ email, weekly: true, monthly: true, daily: false });
  assert.equal((await state()).outbox.length, 1, "same preferences must preserve the original link");
  const confirmation = await confirmSubscription(tokenOf(outbox[0]!));
  assert.deepEqual(confirmation, { ok: true, state: "confirmed" });
  assert.equal((await state()).sub?.status, "active");
});

test("active subscriber preference change remains pending until confirmed", async () => {
  const prior = await state();
  assert.equal(prior.sub?.status, "active");
  await requestSubscription({ email, weekly: false, monthly: true, daily: true });
  const first = await state();
  assert.ok(first.sub);
  assert.deepEqual([first.sub.weekly, first.sub.monthly, first.sub.daily], [true, true, false],
    "an unconfirmed preference change cannot immediately change an active subscription");
  assert.deepEqual([first.sub.pending_weekly, first.sub.pending_monthly, first.sub.pending_daily], [false, true, true]);
  assert.equal(first.outbox.length, 2);
  const newTask = first.outbox.at(-1)!;
  await Promise.all([
    requestSubscription({ email, weekly: false, monthly: true, daily: true }),
    requestSubscription({ email, weekly: false, monthly: true, daily: true }),
  ]);
  const afterRepeat = await state();
  assert.equal(afterRepeat.outbox.length, 2, "the second identical preference request reuses its token");
  assert.equal(afterRepeat.sub?.confirm_token_hash, first.sub.confirm_token_hash);
  assert.deepEqual(await confirmSubscription(tokenOf(newTask)), { ok: true, state: "confirmed" });
  const changed = (await state()).sub!;
  assert.deepEqual([changed.weekly, changed.monthly, changed.daily], [false, true, true]);
});

test("changing pending preferences cancels old undelivered confirmation and keeps the new link valid", async () => {
  await requestSubscription({ email, weekly: true, monthly: false, daily: false });
  const a = await state();
  const stale = a.outbox.at(-1)!;
  await requestSubscription({ email, weekly: false, monthly: true, daily: false });
  const b = await state();
  const current = b.outbox.at(-1)!;
  assert.equal(b.outbox.length, a.outbox.length + 1);
  assert.equal(b.outbox.find(row => row.id === stale.id)?.status, "cancelled");
  assert.equal(current.status, "pending");
  assert.notEqual(tokenOf(current), tokenOf(stale));
  assert.deepEqual(await confirmSubscription(tokenOf(stale)), { ok: false, state: "invalid" });
  assert.deepEqual(await confirmSubscription(tokenOf(current)), { ok: true, state: "confirmed" });
  const flags = (await state()).sub!;
  assert.deepEqual([flags.weekly, flags.monthly, flags.daily], [false, true, false]);
});
