// 公开机器接口的每地址限流。页面不在范围内：HTML 由 web 进程渲染并自带缓存，不从这里出。
// 额度表在 @aihot/contracts/rate-limit —— /llms.txt 念的是同一份，不存在「文档写 180、实际 60」。
//
// 为什么放在 api 层而不是 web 或反代层：api 是真正的数据出口，而且它没有发布端口，只接受
// web 转发；web 已把访客地址裁定好写进 X-Forwarded-For，所以这里的 req.ip 只能是那个值，
// 伪造不进来。反代层（Caddy，属于另一个项目）改不了，web 层又要同时服务 SSR 与静态资源。
import type { FastifyInstance, FastifyRequest } from "fastify";
import { isPrivateAddress } from "@aihot/contracts/net";
import { rateRuleFor, type RateRule } from "@aihot/contracts/rate-limit";
import { sendProblem } from "./respond.ts";

const buckets = new Map<string, number[]>();
/**
 * 上限的意义不是省内存，而是「被海量不同来源打时不要被自己的防护拖死」：每条记录只是一个
 * 时间戳数组，正常情况下几千个键、几百 KB。超了按插入顺序淘汰最老的四分之一。
 */
const MAX_BUCKETS = 20_000;

export interface RateDecision {
  ok: boolean;
  remaining: number;
  /** 距离该键最早一条记录过期还有几秒；超限时才有意义。 */
  retryAfter: number;
}

function evictOldest(): void {
  const drop = Math.ceil(MAX_BUCKETS / 4);
  let removed = 0;
  for (const key of buckets.keys()) {
    buckets.delete(key);
    if (++removed >= drop) break;
  }
}

/**
 * 滑动窗口日志：任意 windowMs 内不超过 limit 次。固定窗口会在边界放过两倍流量，这里多存几个
 * 数字就能避免。`now` 可注入，测试不必等真实时间过去。
 */
export function consume(key: string, rule: RateRule, now = Date.now()): RateDecision {
  const cutoff = now - rule.windowMs;
  let stamps = buckets.get(key);
  if (!stamps) {
    if (buckets.size >= MAX_BUCKETS) evictOldest();
    stamps = [];
    buckets.set(key, stamps);
  } else {
    let expired = 0;
    while (expired < stamps.length && stamps[expired]! <= cutoff) expired++;
    if (expired > 0) stamps.splice(0, expired);
  }
  if (stamps.length >= rule.limit) {
    const waitMs = stamps[0]! + rule.windowMs - now;
    return { ok: false, remaining: 0, retryAfter: Math.max(1, Math.ceil(waitMs / 1000)) };
  }
  stamps.push(now);
  return { ok: true, remaining: rule.limit - stamps.length, retryAfter: 0 };
}

/** 仅供测试：清空计数，避免用例之间互相影响。 */
export function resetRateLimit(): void {
  buckets.clear();
}

/** 仅供测试与排查：当前占用多少个键。 */
export function rateLimitKeyCount(): number {
  return buckets.size;
}

function requestPath(req: FastifyRequest): string {
  const raw = req.raw.url ?? "/";
  const q = raw.indexOf("?");
  return q >= 0 ? raw.slice(0, q) : raw;
}

export function registerRateLimit(app: FastifyInstance): void {
  app.addHook("onRequest", async (req, reply) => {
    const rule = rateRuleFor(requestPath(req));
    if (!rule) return;
    // 内网来源 = 页面渲染时 web 进程自己发来的请求（也包含本机排查用的 curl）。页面一次
    // 渲染可能连打两三个接口，把它们计入访客额度等于让「刷新」消耗配额；而按地址区分又与
    // 真实访客无关。公网来源不可能被识别成内网：web 只在 TCP 对端本身是内网时才采信
    // X-Forwarded-For（见 apps/web/server.ts）。
    if (isPrivateAddress(req.ip)) return;
    const decision = consume(`${req.ip}|${rule.scope}`, rule);
    reply.header("RateLimit-Limit", String(rule.limit));
    if (decision.ok) {
      reply.header("RateLimit-Remaining", String(decision.remaining));
      return;
    }
    reply.header("RateLimit-Reset", String(decision.retryAfter));
    return sendProblem(req, reply, {
      status: 429,
      code: "rate_limited",
      detail: `${rule.scope} accepts ${rule.limit} requests per ${Math.round(rule.windowMs / 1000)}s from one address. Retry in ${decision.retryAfter}s.`,
      retryAfter: decision.retryAfter,
    });
  });
}
