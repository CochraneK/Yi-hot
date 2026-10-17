import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { claimOutbox, confirmSubscription, recordBounce, recordOutboxResult, recoverStaleOutbox, requestSubscription, syncLatestReports, unsubscribe } from "@aihot/backend/newsletter/subscriptions";
import { ingestAuthorized } from "./ingest.ts";

const windows = new Map<string, number[]>();
function limited(key: string, max: number) {
  const now = Date.now();
  const rows = (windows.get(key) ?? []).filter((t) => now - t < 3600_000);
  if (rows.length >= max) return true;
  rows.push(now); windows.set(key, rows); return false;
}
const token = (req: FastifyRequest) => String((req.body as any)?.token ?? "").slice(0, 300);
const privateRoute = (req: FastifyRequest, reply: FastifyReply) => {
  reply.header("Cache-Control", "no-store");
  if (!ingestAuthorized(req)) { reply.code(401).send({ ok: false }); return false; }
  return true;
};

export function registerNewsletter(app: FastifyInstance) {
  app.post("/api/site/newsletter/subscribe", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (limited(`subscribe:${req.ip}`, 8)) return reply.code(429).header("Retry-After", "3600").send({ ok: false, detail: "请求过于频繁，请稍后再试。" });
    try { return await requestSubscription((req.body ?? {}) as never); }
    catch (error) { return reply.code((error as any).statusCode === 400 ? 400 : 503).send({ ok: false, detail: (error as Error).message }); }
  });
  app.post("/api/site/newsletter/confirm", async (req, reply) => reply.header("Cache-Control", "no-store").send(await confirmSubscription(token(req))));
  app.post("/api/site/newsletter/unsubscribe", async (req, reply) => reply.header("Cache-Control", "no-store").send(await unsubscribe(token(req))));

  app.post("/api/ingest/newsletter/sync", async (req, reply) => privateRoute(req, reply) && reply.send({ ...(await recoverStaleOutbox()), ...(await syncLatestReports()) }));
  app.post("/api/ingest/newsletter/claim", async (req, reply) => privateRoute(req, reply) && reply.send({ items: await claimOutbox(Number((req.body as any)?.limit) || 20) }));
  app.post("/api/ingest/newsletter/result", async (req, reply) => {
    if (!privateRoute(req, reply)) return;
    const body = (req.body ?? {}) as any;
    if (!["sent", "failed", "unknown"].includes(body.status)) return reply.code(400).send({ ok: false });
    return recordOutboxResult(Number(body.id), body.status, String(body.response ?? ""));
  });
  app.post("/api/ingest/newsletter/bounce", async (req, reply) => {
    if (!privateRoute(req, reply)) return;
    const body = (req.body ?? {}) as any;
    return recordBounce(String(body.email ?? ""), String(body.diagnostic ?? ""));
  });
}
