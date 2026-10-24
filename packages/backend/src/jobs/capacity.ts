// 队列可持续（Queue Sustainability）：配额、背压、例外通道。
//
// 一天能分析多少篇是有限的——每篇固定 5 次模型调用，¥0.006 上下。入稿量长期高于处理能力时，
// 「排队」不是解法，只是把今天的账推到明天，队列随天数线性变长。2026-10-24 实测：入稿
// 1,400–2,100 篇/天（其中 70% 是「发现即陈旧」的历史稿），而 ¥3/天 的预算只够约 450 篇。
//
// 所以这里做三件事，且都在**花钱之前**发生：
//   1. 配额：历史稿每天最多分析 HISTORY_DAILY_MAX 篇（默认 120），并且不能吃掉当日新闻的余量
//      （全站参考线 DAILY_ANALYZE_QUOTA）。当日新闻不受限——挡它等于漏新闻。
//   2. 背压：历史积压超过 HISTORY_BACKLOG_MAX 篇、或最老的一篇已等超过 HISTORY_MAX_WAIT_HOURS
//      小时，就不再接收新的历史候选，直接归档（保留原文/来源/原因，可批量恢复），而不是继续排队。
//   3. 例外通道：政策、法规、司法案例、研究报告类标题永远放行。容量压力不该让它们消失，
//      这也是「不能仅凭超过 48 小时就判定不值得处理」的落地方式。
//
// 当日新闻永远不受配额限制：有人等着看。配额挡的只有历史。
import { sql } from "../db.ts";

/** 当日报纸全站分析篇数的参考线（只用来给历史稿算余量，不会挡住当日新闻）。 */
export function dailyQuota(): number {
  const v = Number(process.env.DAILY_ANALYZE_QUOTA ?? 480);
  return Number.isFinite(v) && v > 0 ? v : 480;
}

/**
 * 历史稿每天最多分析多少篇。这是省钱的那个旋钮：历史稿的入选率与当日稿相当（约 1/3），
 * 但它晚一天没人看得出来，所以容量要先紧着当日新闻。
 */
export function historyDailyMax(): number {
  const v = Number(process.env.HISTORY_DAILY_MAX ?? 120);
  return Number.isFinite(v) && v >= 0 ? v : 120;
}

/** 历史待处理的上限：超过就不再接收新的历史候选。 */
export function historyBacklogMax(): number {
  const v = Number(process.env.HISTORY_BACKLOG_MAX ?? 600);
  return Number.isFinite(v) && v >= 0 ? v : 600;
}

/** 历史稿最长等待：超过这个时长的积压说明装不下了，先停止接收。 */
export function historyMaxWaitHours(): number {
  const v = Number(process.env.HISTORY_MAX_WAIT_HOURS ?? 96);
  return Number.isFinite(v) && v > 0 ? v : 96;
}

/**
 * 必须放行的历史稿：政策 / 法规 / 司法 / 研究。用标题而不是正文——判据要在花钱之前就能算，
 * 而且要让运维一眼看出为什么这一篇没被挡。宁可多放几条，也不要让《未成年人保护法》修订
 * 因为「两个月前发布」被归档。
 */
const WORTH_HISTORY = /(法|条例|办法|规定|意见|通知|规划|纲要|方案|决定|批复|白皮书|蓝皮书|报告|公报|标准|指引|指南|判决|裁定|案例|司法|立法|修订|征求意见|政策|统计)/;

export function worthHistory(title: string): boolean {
  return WORTH_HISTORY.test(title);
}

export interface CapacitySnapshot {
  /** 北京时间当天已完成的篇数（不含本条决策之前的在途）。 */
  analyzed: number;
  /** 当前等待中的历史稿篇数。 */
  backlog: number;
  /** 等待中最老一篇已等的小时数。 */
  oldestHours: number;
}

// 一分钟一次的快照就够：队列决策是每秒几次的粒度，不需要每条都查库。
let snapshot: (CapacitySnapshot & { at: number; day: string }) | null = null;
// 当天已经放行的历史稿条数。这里必须是**跨快照累加**的：早先按快照重置，等于把「每天 120 篇」
// 变成「每分钟 120 篇」，一天下来上限形同虚设。只在跨自然日时归零，进程重启会重新计数。
let admittedDay = "";
let admittedToday = 0;

function beijingDay(now: number): string {
  return new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
}

export async function capacitySnapshot(now = Date.now()): Promise<CapacitySnapshot> {
  const day = beijingDay(now);
  if (snapshot && snapshot.day === day && now - snapshot.at < 60_000) return snapshot;
  const [row] = await sql<{ analyzed: number; backlog: number; oldest: number }[]>`
    SELECT
      (SELECT count(*)::int FROM analyses
        WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai') AS analyzed,
      (SELECT count(*)::int FROM articles
        WHERE processing_state = 'new' AND backfill
          AND (published_at IS NULL OR discovered_at - published_at > interval '48 hours')) AS backlog,
      (SELECT coalesce(extract(epoch FROM now() - min(discovered_at)) / 3600, 0)::float8 FROM articles
        WHERE processing_state = 'new' AND backfill
          AND (published_at IS NULL OR discovered_at - published_at > interval '48 hours')) AS oldest`;
  snapshot = { at: now, day, analyzed: row?.analyzed ?? 0, backlog: row?.backlog ?? 0, oldestHours: row?.oldest ?? 0 };
  return snapshot;
}

export type Admission = { admit: true } | { admit: false; reason: string };

/**
 * 这条历史稿现在能不能花钱分析。当日新闻走另一条路（不限量），不经过这里。
 */
export async function admitHistory(title: string, now = Date.now()): Promise<Admission> {
  if (worthHistory(title)) return { admit: true };
  const snap = await capacitySnapshot(now);
  if (snap.backlog >= historyBacklogMax()) return { admit: false, reason: "backlog" };
  if (snap.oldestHours >= historyMaxWaitHours()) return { admit: false, reason: "backlog" };
  const day = beijingDay(now);
  if (day !== admittedDay) {
    admittedDay = day;
    admittedToday = 0;
  }
  // 两个上限取小的：历史自己的日上限，以及全站参考线剩下的余量（当日新闻先吃）。
  // 余量用库里的当日完成数，历史自己的用量用内存计数——两者不能相加，否则同一篇会被算两次
  // （放进队列时记一次，分析完成后再在 analyzed 里记一次）。
  const roomTotal = Math.max(0, dailyQuota() - snap.analyzed);
  const roomHistory = Math.max(0, historyDailyMax() - admittedToday);
  if (Math.min(roomTotal, roomHistory) <= 0) return { admit: false, reason: "quota" };
  admittedToday += 1;
  return { admit: true };
}

/** 归档：不删除、不伪装成已处理，保留原文与来源，后面可以按 reason 批量放回队列。 */
export async function archiveArticle(articleId: string, reason: string): Promise<void> {
  await sql`UPDATE articles SET processing_state = 'archived', archive_reason = ${reason}, archived_at = now(),
              processing_queued_at = NULL, processing_retry_at = NULL
            WHERE id = ${articleId} AND processing_state = 'new'`;
}
