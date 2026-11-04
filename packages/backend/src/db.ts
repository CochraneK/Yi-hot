import postgres from "postgres";
import { config } from "./config.ts";

// int8 and numeric come back as numbers: ids and scores in this schema stay far below 2^53.
const numberType = (oid: number) => ({
  to: oid,
  from: [oid],
  serialize: (value: unknown) => String(value),
  parse: (value: string) => Number(value),
});

export const sql = postgres(config.databaseUrl, {
  max: Number(process.env.DATABASE_POOL_MAX || 10),
  // Keep connections through quiet minutes: a reconnect costs a SCRAM exchange on the next request.
  idle_timeout: 600,
  connect_timeout: 10,
  // 根因修复（2026-11-04）：worker 曾因 db 连接被网络抖动变成半开而永久 hang——postgres.js 没有
  // 查询级超时，idle_timeout 只对空闲连接生效，正在执行的死查询会一直 pending。开启 TCP keepalive
  // 并把首次探测前空闲压到 10s，配合宿主 sysctl 的 tcp_keepalive_intvl=10/probes=3，半开连接约 40s
  // 被 OS 关闭，postgres.js 随即 reject 挂起的查询，任务失败重试而非卡死。
  keep_alive: 10,
  // 双保险：每条连接最多存活 10 分钟就强制回收重建，避免长期存活的连接悄悄变死。
  max_lifetime: 600,
  onnotice: () => {},
  // Prepared statements keep PostgreSQL's plan cache: planning a detail read took longer than running
  // it. Searches plan every execution instead (withCustomPlans). JIT compilation costs more than
  // these short queries ever run.
  connection: { jit: "off" },
  types: {
    int8: numberType(20),
    numeric: numberType(1700),
  },
});

export type Sql = typeof sql;
export type Tx = postgres.TransactionSql;
export type Db = Sql | Tx;

/**
 * Runs queries with plans made for their actual values. A cached generic plan cannot tell a
 * two-character search term (no usable trigram) from a longer one and would scan the whole trigram
 * index, so every search goes through here.
 */
export function withCustomPlans<T>(fn: (db: Tx) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL plan_cache_mode = force_custom_plan`;
    return fn(tx);
  }) as Promise<T>;
}

export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}

/** First row of a query that always returns one (aggregates). */
export function one<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error("expected one row");
  return row;
}
