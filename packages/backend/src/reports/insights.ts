// A report insight is an evidence-linked editorial inference, not another item summary.
// The model may propose it, but all references and minimum independent-source support
// are checked against the exact material supplied in the same generation call.
export type InsightLevel = "pattern" | "hypothesis";

export interface InsightEntry {
  itemId: string;
  factId: string | null;
  sourceId: string;
  category: string | null;
}

export interface StoredReportInsight {
  level: InsightLevel;
  claim: string;
  reasoning: string;
  alternative: string;
  watchFor: string;
  evidenceIds: string[];
}

interface ProposedInsight {
  claim: string;
  reasoning: string;
  alternative: string;
  watchFor: string;
  refs: Array<number | string>;
}

function referenceIndex(value: number | string): number | null {
  if (typeof value === "string" && !/^[1-9]\d{0,4}$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n - 1 : null;
}

/**
 * Reject a whole claim rather than silently deleting an invalid source and
 * accidentally displaying prose whose actual stated basis has disappeared.
 * Two references to different posts of one source do not constitute corroboration.
 */
export function compilePeriodInsights(
  kind: "weekly" | "monthly",
  proposals: ProposedInsight[],
  numberedEntries: InsightEntry[],
): StoredReportInsight[] {
  const out: StoredReportInsight[] = [];
  const seenClaims = new Set<string>();
  for (const proposal of proposals.slice(0, 3)) {
    const claim = proposal.claim.trim();
    const reasoning = proposal.reasoning.trim();
    const alternative = proposal.alternative.trim();
    const watchFor = proposal.watchFor.trim();
    if (!claim || !reasoning || !alternative || !watchFor) continue;
    if (!Array.isArray(proposal.refs) || proposal.refs.length < 2 || proposal.refs.length > 8) continue;
    const indices = proposal.refs.map(referenceIndex);
    if (indices.some(i => i === null || i >= numberedEntries.length)) continue;
    const entries = [...new Set(indices as number[])].map(i => numberedEntries[i]!);
    if (entries.length < 2 ||
        new Set(entries.map(e => e.sourceId)).size < 2 ||
        new Set(entries.map(e => e.factId ?? e.itemId)).size < 2) continue;
    const key = claim.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
    if (seenClaims.has(key)) continue;
    seenClaims.add(key);
    out.push({
      level: kind === "weekly" ? "pattern" : "hypothesis",
      claim, reasoning, alternative, watchFor,
      evidenceIds: entries.map(e => e.itemId),
    });
  }
  return out;
}

function categories(entries: InsightEntry[], sectionOf: Record<string, string>) {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const k = sectionOf[e.category ?? ""] ?? "未分类";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

/**
 * Descriptive comparison of this site's *observed candidate sample* only.
 * Changes to collection coverage, ranking and editorial filters can all move
 * these numbers; the prompt is explicitly forbidden to treat them as society-wide trends.
 */
export function periodObservationBrief(
  kind: "weekly" | "monthly",
  current: InsightEntry[],
  previous: InsightEntry[],
  sectionOf: Record<string, string>,
): string {
  const currentSources = new Set(current.map(e => e.sourceId));
  const previousSources = new Set(previous.map(e => e.sourceId));
  const overlap = [...currentSources].filter(id => previousSources.has(id)).length;
  const union = new Set([...currentSources, ...previousSources]).size;
  const overlapShare = union ? overlap / union : 0;
  const period = kind === "weekly" ? "前一周" : "前一月";
  const basics = `本站候选样本（不是社会事件发生数）：本期 ${current.length} 条去重事件，${currentSources.size} 个技术信源；${period} ${previous.length} 条去重事件，${previousSources.size} 个技术信源。共同信源 ${overlap} 个，信源集合重叠比 ${Math.round(overlapShare * 100)}%。`;
  if (current.length < 10 || previous.length < 10 || overlapShare < 0.5) {
    return basics + "可比性不足（样本太少或信源构成变化），禁止使用增长、下降、加速、趋冷等比较性结论；仅对本期事件建立有来源的横向观察。";
  }
  const now = categories(current, sectionOf);
  const before = categories(previous, sectionOf);
  const labels = [...new Set([...now.keys(), ...before.keys()])];
  const shifts = labels.map(name => ({
    name,
    current: Math.round(100 * (now.get(name) ?? 0) / current.length),
    prior: Math.round(100 * (before.get(name) ?? 0) / previous.length),
  })).sort((a, b) => Math.abs(b.current - b.prior) - Math.abs(a.current - a.prior)).slice(0, 5);
  return basics + "以下是本站去重候选的构成占比（每100条中的份额，非社会发生率）："+
    shifts.map(s => `${s.name} ${s.prior}%→${s.current}%`).join("；") +
    "。只允许称‘本站样本占比变化’，不可称社会事件或公益资金整体变化；因来源与筛选口径、迟到稿件不同，因果和未来走向均需另证。";
}
