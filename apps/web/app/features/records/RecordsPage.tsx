// 监管记录页：民政部行政处罚 + 社会组织活动异常名录 / 严重违法失信名单的列入、移出与送达公告。
// 筛选用 URL 参数（type / kind / q / page），列表本身是服务端渲染的静态内容。
import { Link, useSearchParams } from "react-router";
import type { RegulatoryRecord, RegulatoryRecordsPage } from "@aihot/contracts/records";
import { SearchField, hrefWith } from "../feed/Filters";
import { Pagination } from "../feed/DayList";
import { EmptyState } from "../../components/ui/Page";
import { ORG_KINDS, ORG_KIND_LABELS, RECORD_TYPE_LABELS, RECORD_TYPE_ORDER, RECORD_TYPE_TONES, headline, monthDay } from "./format";

function TypeChip({ type, count, active }: { type: RegulatoryRecord["type"] | null; count: number; active: boolean }) {
  const [params] = useSearchParams();
  const to = hrefWith("/records", params, { type });
  return (
    <Link
      to={to}
      preventScrollReset
      aria-current={active ? "page" : undefined}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors ${active ? "border-ink bg-ink font-semibold text-bg" : "border-line bg-surface text-ink-3 hover:border-ink-4 hover:text-ink"}`}
    >
      {type ? RECORD_TYPE_LABELS[type] : "全部"}
      <span className={`num text-[11.5px] ${active ? "text-bg/70" : "text-ink-4"}`}>{count}</span>
    </Link>
  );
}

function KindChip({ kind, active }: { kind: (typeof ORG_KINDS)[number] | null; active: boolean }) {
  const [params] = useSearchParams();
  const to = hrefWith("/records", params, { kind });
  return (
    <Link
      to={to}
      preventScrollReset
      aria-current={active ? "page" : undefined}
      className={`inline-flex h-8 items-center rounded-full border px-3 text-[12.5px] transition-colors ${active ? "border-ink bg-ink font-semibold text-bg" : "border-line bg-surface text-ink-3 hover:border-ink-4 hover:text-ink"}`}
    >
      {kind ? ORG_KIND_LABELS[kind] : "全部类型"}
    </Link>
  );
}

/** 一条记录的关键事实：依据、文号、时间、机关，按类型取相关的几项。 */
function factsOf(r: RegulatoryRecord): string[] {
  const out: string[] = [];
  if (r.caseNo) out.push(`文号 ${r.caseNo}`);
  if (r.punishOn) out.push(`决定日期 ${r.punishOn}`);
  if (r.punishOrgan) out.push(r.punishOrgan);
  if (r.punishBasis) out.push(`依据 ${r.punishBasis}`);
  if (r.enrolOn) out.push(`列入时间 ${r.enrolOn}`);
  if (r.enrolGist) out.push(`列入依据 ${r.enrolGist}`);
  if (r.removeOn) out.push(`移出时间 ${r.removeOn}`);
  if (r.removeGist) out.push(`移出依据 ${r.removeGist}`);
  if (r.registerDept) out.push(r.registerDept);
  return out;
}

function RecordCard({ r }: { r: RegulatoryRecord }) {
  return (
    <article className="card px-4 py-3.5 lg:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset ${RECORD_TYPE_TONES[r.type]}`}>{RECORD_TYPE_LABELS[r.type]}</span>
            {r.orgKind && <span className="text-[11.5px] text-ink-4">{ORG_KIND_LABELS[r.orgKind]}</span>}
            {r.entityId && r.entityName && (
              <Link to={`/topics/${r.entityId}`} className="text-[11.5px] font-medium text-accent hover:underline">
                已收录 · {r.entityName}
              </Link>
            )}
          </div>
          <h3 className="mt-1.5 text-[15px] font-semibold leading-snug text-ink">{r.orgName}</h3>
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-2">{headline(r)}</p>
          <p className="num mt-1.5 truncate text-[11.5px] text-ink-4" title={factsOf(r).join(" · ")}>{factsOf(r).join(" · ") || "—"}</p>
        </div>
        <time dateTime={r.publishedOn} className="num shrink-0 pt-0.5 text-[12px] text-ink-4">{monthDay(r.publishedOn)}</time>
      </div>
    </article>
  );
}

export function RecordsPage({ data }: { data: RegulatoryRecordsPage }) {
  const [params] = useSearchParams();
  const activeType = params.get("type");
  const activeKind = params.get("kind");
  const q = params.get("q");
  const pageCount = Math.max(1, Math.ceil(data.total / data.pageSize));
  const href = (p: number) => hrefWith("/records", params, { page: p <= 1 ? null : String(p) });
  const syncNote = data.stats.lastSyncedAt ? new Date(data.stats.lastSyncedAt).toLocaleString("zh-CN", { hour12: false }) : "尚未同步";

  return (
    <div className="pb-10">
      <header className="pb-2 pt-5 lg:pt-1">
        <h1 className="text-[24px] font-semibold leading-[1.3] text-ink">监管记录</h1>
        <p className="mt-1.5 max-w-[720px] text-[13px] leading-relaxed text-ink-3">
          民政部对全国性社会组织的行政处罚，以及全国社会组织活动异常名录、严重违法失信名单的列入、移出与送达公告。数据来自中国社会组织政务服务平台公开接口，每天同步一次；组织类型由统一社会信用代码推导。
        </p>
      </header>

      <nav aria-label="记录类型" className="mt-4 flex flex-wrap gap-1.5">
        <TypeChip type={null} count={data.stats.total} active={!activeType} />
        {RECORD_TYPE_ORDER.map((t) => (
          <TypeChip key={t} type={t} count={data.stats.byType[t]} active={activeType === t} />
        ))}
      </nav>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <nav aria-label="组织类型" className="flex flex-wrap gap-1.5">
          <KindChip kind={null} active={!activeKind} />
          {ORG_KINDS.map((k) => (
            <KindChip key={k} kind={k} active={activeKind === k} />
          ))}
        </nav>
        <div className="w-full lg:ml-auto lg:w-60">
          <SearchField action="/records" defaultValue={q ?? ""} keep={{ type: activeType, kind: activeKind }} placeholder="搜索组织名称…" />
        </div>
      </div>

      <p className="mt-3 text-[12px] text-ink-4">
        共 <span className="num">{data.total.toLocaleString("zh-CN")}</span> 条记录
        {q && <>，匹配「{q}」</>}；最近同步 {syncNote}
      </p>

      {data.items.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="没有符合条件的记录">换个筛选条件，或清空组织名搜索试试。</EmptyState>
        </div>
      ) : (
        <div className="mt-4 grid gap-2.5">
          {data.items.map((r) => (
            <RecordCard key={r.id} r={r} />
          ))}
        </div>
      )}

      <Pagination page={data.page} pageCount={pageCount} href={href} />

      <p className="mt-6 text-[12px] leading-relaxed text-ink-4">
        数据来源：<a href="https://chinanpo.mca.gov.cn/xzcfgg" className="text-accent hover:underline" rel="noreferrer noopener" target="_blank">行政处罚公告</a>
        、<a href="https://chinanpo.mca.gov.cn/hdycmlYzwfsxgg" className="text-accent hover:underline" rel="noreferrer noopener" target="_blank">活动异常名录和严重违法失信列入送达公告</a>
        （中国社会组织政务服务平台）。本站仅作汇集与检索，原始记录以登记管理机关发布为准。
      </p>
    </div>
  );
}
