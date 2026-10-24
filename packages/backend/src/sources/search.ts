// 关键词搜索型信源：用 DeepSeek 网页搜索（/v1/tools/search）按查询词捞回结果列表。
//
// 与列表页/热榜的根本区别：它不依赖某个站点的栏目结构，也不依赖热榜编辑器"恰好选中"了一条对口的
// 新闻——查询词直接决定覆盖面。实测（2026-10-21，8 组儿童权益查询）149 条去重结果里 148 条是现有
// 118 个源结构上拿不到的（民政部通知、检察院未保案例、法院判决、国务院妇儿工委办），authority≥3
// 占 91%。代价是每条带 signed 的 date 只到日，所以本采集器出的发布时间一律按日级精度入库。
//
// 计费按「成功请求」而非结果条数：一次查询 ¥0.005，与 count=20 还是 50 无关。因此同一查询在同一天
// 只真正请求一次（window 是幂等键的一部分），把 interval_minutes 设得比 24 小时短也不会多花钱。
import { FetchError, type Candidate, type SourceRow } from "./types.ts";
import { deepseekSearch, type SearchHit } from "../providers/deepseek-tools.ts";
import { BudgetExceededError } from "../providers/receipts.ts";

export interface SearchRead {
  candidates: Candidate[];
  detail: Record<string, unknown>;
}

const BJ_MS = 8 * 3600_000;

/** 北京「今天」，也是幂等窗口：一天之内同一查询复用同一份响应。 */
function bjDay(now = Date.now()): string {
  return new Date(now + BJ_MS).toISOString().slice(0, 10);
}

function minusDays(ymd: string, days: number): string {
  const t = Date.parse(`${ymd}T00:00:00Z`);
  return new Date(t - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * 搜索结果里的 `date` 只到日（UTC RFC3339，通常是当天 00:00:00Z）。整串照收会在前端显示成
 * 「08:00」这种凭空出现的钟点，所以统一归一到该日 00:00Z，并标注 precision='date' —— 前端据此
 * 只显示日期。真实时间由后续的正文抽取（详情页）升级，upsertMaterial 的精度不降级保护会保住它。
 */
function dayOf(date: string | null): Date | null {
  if (!date) return null;
  const ymd = /^(\d{4}-\d{2}-\d{2})/.exec(date)?.[1];
  if (!ymd) return null;
  const t = Date.parse(`${ymd}T00:00:00Z`);
  return Number.isFinite(t) ? new Date(t) : null;
}

function toCandidate(hit: SearchHit, receiptId: number, query: string): Candidate {
  const publishedAt = dayOf(hit.date);
  const excerpt = (hit.summary ?? hit.snippet ?? "").slice(0, 2000) || null;
  const body = hit.content ? hit.content.slice(0, 50_000) : null;
  return {
    url: hit.url,
    title: hit.title,
    author: hit.siteName,
    publishedAt,
    query,
    ...(publishedAt ? { publishedAtPrecision: "date" as const } : {}),
    excerpt,
    bodyText: body,
    bodyStatus: body ? "ok" : "pending",
    raw: {
      deepseek: {
        authority: hit.authority,
        rerankScore: hit.rerankScore,
        siteName: hit.siteName,
        date: hit.date,
        receiptId,
      },
    },
  };
}

/** 稳定的小哈希：只用来把一个源固定分到「隔 N 天里的第几天」，不参与任何内容判断。 */
function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 每个查询一次请求。查询里未自带时间窗时自动追加 `after:`，避免把去年的旧闻当新闻抓回来；
 * 想让某个源长跨度回填，直接在 query 里写 after:/before:，这里就不再覆盖。
 *
 * `config.everyNDays`（默认 1）让源按天轮转：N=2 表示隔天跑。这是**唯一真正省搜索费**的旋钮——
 * 幂等窗口是北京「当天」，把 interval_minutes 从 12h 改成 24h 并不会少付钱，但少跑一天就是少一天。
 */
export async function fetchSearch(source: SourceRow): Promise<SearchRead> {
  const queries = (Array.isArray(source.config.queries) ? source.config.queries : []).map((q: unknown) => String(q ?? "").trim()).filter(Boolean);
  if (queries.length === 0) throw new FetchError("queries missing");
  const count = Number(source.config.count ?? 20);
  const lookbackDays = Math.max(0, Number(source.config.lookbackDays ?? 7));
  const minAuthority = Number(source.config.minAuthority ?? 2);
  const minRerank = Number(source.config.minRerank ?? 0);
  const needContent = source.config.needContent === true;
  const oriQuestion = typeof source.config.oriQuestion === "string" ? source.config.oriQuestion : undefined;

  const window = bjDay();
  const since = minusDays(window, lookbackDays);
  // 轮转：dayIndex 与源 id 的哈希对 N 取模，固定把源摊到不同日子，避免同一天全挤在一起。
  const everyNDays = Math.max(1, Math.floor(Number(source.config.everyNDays ?? 1)));
  if (everyNDays > 1) {
    const dayIndex = Math.floor(Date.parse(`${window}T00:00:00Z`) / 86_400_000);
    const slot = hash32(source.id) % everyNDays;
    if (dayIndex % everyNDays !== slot) {
      return { candidates: [], detail: { skippedRotation: true, everyNDays, slot, queries: queries.length } };
    }
  }

  const errors: string[] = [];
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  // 逐条 query 的产出，用来回答「哪条词在花钱、带来多少入选」。历史（本次上线前）没有这个字段，
  // 报告脚本对缺失的窗口一律标 unknown，不假设、不插值。
  const perQuery: { q: string; hits: number; kept: number; fresh: number }[] = [];
  let rawHits = 0;
  let droppedByAuthority = 0;
  let droppedByRerank = 0;
  let budgetError: BudgetExceededError | null = null;

  for (const q of queries) {
    const query = /(^|\s)(after|before):/i.test(q) ? q : `${q} after:${since}`;
    const stat = { q: q.slice(0, 200), hits: 0, kept: 0, fresh: 0 };
    try {
      const res = await deepseekSearch({ query, count, needContent, oriQuestion, window: `${window}:${since}`, subject: source.id });
      rawHits += res.hits.length;
      stat.hits = res.hits.length;
      for (const hit of res.hits) {
        // authority / rerank 缺失或 -1（未知）时不据此丢弃：字段没给不等于结果不对口，
        // 对口与否交给后面的评分步骤判断。
        if (hit.authority !== null && hit.authority >= 0 && hit.authority < minAuthority) {
          droppedByAuthority += 1;
          continue;
        }
        if (hit.rerankScore !== null && hit.rerankScore < minRerank) {
          droppedByRerank += 1;
          continue;
        }
        if (seen.has(hit.url)) continue;
        seen.add(hit.url);
        stat.kept += 1;
        stat.fresh += 1;
        candidates.push(toCandidate(hit, res.receiptId, stat.q));
      }
    } catch (error) {
      // 预算耗尽不是「这个源坏了」：已拿到的结果照样入库，剩下的查询等配额恢复。
      if (error instanceof BudgetExceededError) {
        budgetError = error;
        perQuery.push(stat);
        break;
      }
      errors.push(`${q}: ${String(error instanceof Error ? error.message : error).slice(0, 200)}`);
    }
    perQuery.push(stat);
  }

  // 一条都没拿到时把原因抛出去：整源失败要能在 fetch_runs 里看见（预算耗尽按预算处理，不计健康度）。
  if (candidates.length === 0) {
    if (budgetError) throw budgetError;
    if (errors.length > 0) throw new FetchError(errors.join(" | ").slice(0, 900));
  }
  return {
    candidates,
    detail: {
      queries: queries.length,
      rawHits,
      droppedByAuthority,
      droppedByRerank,
      budgetExhausted: budgetError !== null,
      perQuery,
      ...(errors.length ? { errors: errors.slice(0, 5) } : {}),
    },
  };
}
