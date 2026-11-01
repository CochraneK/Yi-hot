// 监管页：民政部行政处罚 + 社会组织活动异常名录 / 严重违法失信名单的列入、移出与送达公告。
// 版式分三层：概览（全库构成，一眼看出「变糟 / 程序性 / 恢复」各自的量级）→ 筛选（类型是主角，
// 地区与组织类型是次要条件，收在同一行）→ 记录（一条一张卡，左缘颜色就是类型）。
// 筛选用 URL 参数（type / kind / q / province / city / page），列表本身是服务端渲染的静态内容。
// 手机上筛选收进一个折叠块：平铺时第一屏全是筛选项，读起来像缩小了的电脑版网页。
// 搜索框留在折叠块外面——它是主操作，不该藏起来。
import { Link, useNavigate, useSearchParams } from "react-router";
import type { RegulatoryOrgKind, RegulatoryRecord, RegulatoryRecordsPage } from "@aihot/contracts/records";
import { SearchField, hrefWith } from "../feed/Filters";
import { Pagination } from "../feed/DayList";
import { EmptyState } from "../../components/ui/Page";
import { IconArrowUpRight, IconChevronDown, IconClose, IconList, IconShield } from "../../components/icons";
import {
  ORG_KINDS,
  ORG_KIND_LABELS,
  RECORD_TYPE_COLORS,
  RECORD_TYPE_GROUPS,
  RECORD_TYPE_LABELS,
  RECORD_TYPE_ORDER,
  RECORD_TYPE_SHORT,
  headline,
  monthDay,
} from "./format";

/** 淡色底 + 同色描边，文字仍用墨色——灰和琥珀在浅底上做小字会掉到 3:1 以下。 */
function tint(color: string, pct: number) {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

const nf = (n: number) => n.toLocaleString("zh-CN");

/** 同步时间按北京时间手工换算：服务端容器是 UTC，用 toLocaleString 会差 8 小时，
 *  而且服务端和浏览器各按各的时区渲染，水合时还会对不上。 */
function syncTime(iso: string | null): string {
  if (!iso) return "尚未同步";
  const t = new Date(new Date(iso).getTime() + 8 * 3600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCMonth() + 1}月${t.getUTCDate()}日 ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

/**
 * 类型胶囊：色点 + 全称 + 条数。选中的胶囊只染描边、淡底和色点，文字仍是墨色，
 * 六种颜色因此能在同一行里各自成立，又不会有一支因为太浅而读不清。
 */
function TypeChip({ type, count, active, compact = false }: { type: RegulatoryRecord["type"] | null; count: number; active: boolean; compact?: boolean }) {
  const [params] = useSearchParams();
  const color = type ? RECORD_TYPE_COLORS[type] : "var(--ink)";
  return (
    <Link
      to={hrefWith("/records", params, { type })}
      preventScrollReset
      aria-current={active ? "page" : undefined}
      style={active ? { borderColor: color, background: tint(color, 14) } : undefined}
      className={`group inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] transition-[border-color,background-color,color] ${
        active ? "font-semibold text-ink" : "border-line bg-surface text-ink-3 hover:border-line-strong hover:text-ink"
      }`}
    >
      <span
        aria-hidden
        className="size-[5px] shrink-0 rounded-full transition-transform group-hover:scale-150"
        style={{ backgroundColor: color }}
      />
      {/* 折叠块里用简称：全称十个字一颗，六颗排下去每颗各占一行，筛选块会撑到半屏。 */}
      {type ? (compact ? RECORD_TYPE_SHORT[type] : RECORD_TYPE_LABELS[type]) : "全部"}
      <span className={`num text-[11px] font-normal tabular-nums ${active ? "text-ink-3" : "text-ink-4"}`}>{nf(count)}</span>
    </Link>
  );
}

/** 组织类型是次要条件：没有计数、没有色点，选中只加深底色——不能比类型胶囊更抢眼。 */
function KindChip({ kind, active }: { kind: (typeof ORG_KINDS)[number] | null; active: boolean }) {
  const [params] = useSearchParams();
  return (
    <Link
      to={hrefWith("/records", params, { kind })}
      preventScrollReset
      aria-current={active ? "page" : undefined}
      className={`inline-flex h-8 items-center rounded-full border px-3 text-[12.5px] transition-colors ${
        active
          ? "border-line-strong bg-bg-muted font-semibold text-ink"
          : "border-line bg-surface text-ink-3 hover:border-line-strong hover:text-ink"
      }`}
    >
      {kind ? ORG_KIND_LABELS[kind] : "全部类型"}
    </Link>
  );
}

const selectClass =
  "h-8 cursor-pointer appearance-none rounded-full border border-line bg-surface pl-3 pr-7 text-[12.5px] text-ink-2 outline-none transition-colors hover:border-line-strong focus:border-accent";

/** 省 / 市两级下拉：选省会清空市；选中省后才出现市下拉（市列表由后端按省聚合返回）。 */
function RegionFilter({
  provinces,
  cities,
  activeProvince,
  activeCity,
}: {
  provinces: { province: string; n: number }[];
  cities: { city: string; n: number }[];
  activeProvince: string | null;
  activeCity: string | null;
}) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const goProvince = (province: string) => navigate(hrefWith("/records", params, { province: province || null, city: null }));
  const goCity = (city: string) => navigate(hrefWith("/records", params, { city: city || null }));
  if (provinces.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-4">
        <span aria-hidden className="size-1 rounded-full bg-line-strong" />
        地区
      </span>
      <div className="relative">
        <select aria-label="按省份筛选" value={activeProvince ?? ""} onChange={(e) => goProvince(e.target.value)} className={selectClass}>
          <option value="">全部省份</option>
          {provinces.map((p) => (
            <option key={p.province} value={p.province}>
              {p.province}（{p.n}）
            </option>
          ))}
        </select>
        <IconChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
      </div>
      {activeProvince && cities.length > 0 && (
        <div className="relative">
          <select aria-label="按城市筛选" value={activeCity ?? ""} onChange={(e) => goCity(e.target.value)} className={selectClass}>
            <option value="">全部城市</option>
            {cities.map((c) => (
              <option key={c.city} value={c.city}>
                {c.city}（{c.n}）
              </option>
            ))}
          </select>
          <IconChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
        </div>
      )}
    </div>
  );
}

/** 上游把整段括注塞进「依据」字段（有时上百字），单行事实栏里只留开头，全文进 title。 */
function clip(s: string, n = 20): string {
  const chars = Array.from(s);
  return chars.length > n ? `${chars.slice(0, n).join("")}…` : s;
}

/** 一条记录的关键事实：依据、文号、时间、机关，按类型取相关的几项。 */
function factsOf(r: RegulatoryRecord): string[] {
  const out: string[] = [];
  if (r.caseNo) out.push(`文号 ${clip(r.caseNo, 24)}`);
  if (r.punishOn) out.push(`决定日期 ${r.punishOn}`);
  if (r.punishOrgan) out.push(r.punishOrgan);
  if (r.punishBasis) out.push(`依据 ${clip(r.punishBasis)}`);
  if (r.enrolOn) out.push(`列入时间 ${r.enrolOn}`);
  if (r.enrolGist) out.push(`列入依据 ${clip(r.enrolGist)}`);
  if (r.removeOn) out.push(`移出时间 ${r.removeOn}`);
  if (r.removeGist) out.push(`移出依据 ${clip(r.removeGist)}`);
  if (r.registerDept) out.push(r.registerDept);
  return out;
}

/** 图例的一行：色点、简称、条数，占比压成括号小字跟在后面——数字贴着名字，
 *  不推到列的另一端，三列才不会读成三张疏离的表格。整行是筛选入口。 */
function LegendRow({ type, stats }: { type: RegulatoryRecord["type"]; stats: RegulatoryRecordsPage["stats"] }) {
  const [params] = useSearchParams();
  const on = params.get("type") === type;
  const n = stats.byType[type];
  const total = stats.total || 1;
  return (
    <Link
      to={hrefWith("/records", params, { type })}
      preventScrollReset
      aria-current={on ? "page" : undefined}
      className={`group -mx-1.5 flex items-baseline gap-1.5 rounded-md px-1.5 py-[3px] transition-colors hover:bg-bg-sunk ${on ? "bg-bg-sunk" : ""}`}
    >
      <span
        aria-hidden
        className={`mb-[1px] size-2 shrink-0 self-center rounded-full transition-shadow ${on ? "ring-2 ring-line-strong" : "ring-2 ring-transparent"}`}
        style={{ backgroundColor: RECORD_TYPE_COLORS[type] }}
      />
      <span className={`text-[12px] ${on ? "font-semibold text-ink" : "text-ink-3 group-hover:text-ink"}`}>{RECORD_TYPE_SHORT[type]}</span>
      <span className="num text-[12px] tabular-nums text-ink-2">{nf(n)}</span>
      <span className="num text-[10.5px] tabular-nums text-ink-4">{((n / total) * 100).toFixed(n / total >= 0.1 ? 0 : 1)}%</span>
    </Link>
  );
}

/**
 * 全库构成：一条按数量分配的堆叠条 + 图例。3110 条里「移出异常」占近一半、
 * 「行政处罚」只有十来条，横条把这种量级差摊开，单看一串数字是看不出来的。
 * 手机上六行平铺（顺序就是 1→6）；桌面上按「变糟 / 程序性 / 恢复」分三列——
 * 两列平铺时人会竖着读，七个数字竖读会串成没有意义的序列，分组后每一列本身就是一件事。
 */
function Composition({ stats }: { stats: RegulatoryRecordsPage["stats"] }) {
  const present = RECORD_TYPE_ORDER.filter((t) => stats.byType[t] > 0);
  return (
    <div>
      <div aria-hidden className="flex h-2.5 w-full gap-[3px] overflow-hidden rounded-full">
        {present.map((t) => (
          <span
            key={t}
            className="rounded-[2px]"
            style={{ flexGrow: stats.byType[t], flexBasis: 0, minWidth: 4, backgroundColor: RECORD_TYPE_COLORS[t] }}
          />
        ))}
      </div>
      <ul className="mt-2.5 space-y-0.5 sm:hidden">
        {RECORD_TYPE_ORDER.map((t) => (
          <li key={t}>
            <LegendRow type={t} stats={stats} />
          </li>
        ))}
      </ul>
      <div className="mt-3 hidden sm:flex sm:gap-10">
        {RECORD_TYPE_GROUPS.map((g) => (
          <div key={g.key}>
            <p className="flex items-baseline gap-1.5 text-[10.5px] font-medium tracking-[0.02em] text-ink-4">
              {g.label}
              <span className="num tabular-nums text-ink-3">{nf(g.types.reduce((s, t) => s + stats.byType[t], 0))}</span>
            </p>
            <ul className="mt-1 space-y-0.5">
              {g.types.map((t) => (
                <li key={t}>
                  <LegendRow type={t} stats={stats} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 折叠块的标题行：左边报已选几项，右边是展开 / 收起。 */
function FilterSummary({ count }: { count: number }) {
  return (
    <summary className="flex h-9 cursor-pointer list-none items-center justify-between rounded-lg bg-surface px-3 text-[13px] font-medium text-ink ring-1 ring-line-soft">
      <span className="inline-flex items-center gap-1.5">
        <IconList size={14} className="text-ink-3" />
        筛选
        {count > 0 && <span className="num rounded-full bg-accent-softer px-1.5 text-[11.5px] font-semibold text-accent-ink">{count}</span>}
      </span>
      <span className="text-[12px] font-normal text-ink-4 group-open/filter:hidden">展开</span>
      <span className="hidden text-[12px] font-normal text-ink-4 group-open/filter:inline">收起</span>
    </summary>
  );
}

/** 类型行 + 次要条件行：桌面平铺，手机折叠，两处共用这一份。 */
function FilterBody({
  stats,
  activeType,
  activeKind,
  activeProvince,
  activeCity,
  compact = false,
}: {
  stats: RegulatoryRecordsPage["stats"];
  activeType: string | null;
  activeKind: string | null;
  activeProvince: string | null;
  activeCity: string | null;
  compact?: boolean;
}) {
  return (
    <>
      <nav aria-label="记录类型" className="flex flex-wrap gap-1.5">
        <TypeChip type={null} count={stats.total} active={!activeType} compact={compact} />
        {RECORD_TYPE_ORDER.map((t) => (
          <TypeChip key={t} type={t} count={stats.byType[t]} active={activeType === t} compact={compact} />
        ))}
      </nav>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line-soft pt-2.5">
        <RegionFilter provinces={stats.provinces} cities={stats.cities} activeProvince={activeProvince} activeCity={activeCity} />
        <nav aria-label="组织类型" className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-4">
            <span aria-hidden className="size-1 rounded-full bg-line-strong" />
            组织
          </span>
          <KindChip kind={null} active={!activeKind} />
          {ORG_KINDS.map((k) => (
            <KindChip key={k} kind={k} active={activeKind === k} />
          ))}
        </nav>
      </div>
    </>
  );
}

/** 已选条件：每个都能单独点掉，末尾一键清空。筛选面板里虽然也能改，
 *  但翻到第二屏时只有这一行能立刻说明「我为什么只看到这几条」。 */
function ActiveFilters({
  activeType,
  activeKind,
  activeProvince,
  activeCity,
  q,
}: {
  activeType: string | null;
  activeKind: string | null;
  activeProvince: string | null;
  activeCity: string | null;
  q: string | null;
}) {
  const [params] = useSearchParams();
  const chips: { key: string; label: string; patch: Record<string, string | null> }[] = [];
  if (q) chips.push({ key: "q", label: `搜索「${q}」`, patch: { q: null } });
  const typeLabel = activeType ? RECORD_TYPE_LABELS[activeType as RegulatoryRecord["type"]] : undefined;
  if (typeLabel) chips.push({ key: "type", label: typeLabel, patch: { type: null } });
  if (activeProvince) chips.push({ key: "province", label: activeCity ? `${activeProvince} · ${activeCity}` : activeProvince, patch: { province: null, city: null } });
  const kindLabel = activeKind ? ORG_KIND_LABELS[activeKind as RegulatoryOrgKind] : undefined;
  if (kindLabel) chips.push({ key: "kind", label: kindLabel, patch: { kind: null } });
  if (chips.length === 0) return null;
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <Link
          key={c.key}
          to={hrefWith("/records", params, c.patch)}
          preventScrollReset
          title={`取消：${c.label}`}
          className="chip group !bg-surface hover:!border-accent/40 hover:!text-accent"
        >
          {c.label}
          <IconClose size={11} className="text-ink-4 transition-colors group-hover:text-accent" />
        </Link>
      ))}
      <Link to="/records" className="ml-0.5 text-[12px] text-ink-4 underline-offset-2 transition-colors hover:text-accent hover:underline">
        清除全部
      </Link>
    </div>
  );
}

function RecordCard({ r }: { r: RegulatoryRecord }) {
  const color = RECORD_TYPE_COLORS[r.type];
  const typeLabel = RECORD_TYPE_LABELS[r.type];
  const meta = [r.orgKind ? ORG_KIND_LABELS[r.orgKind] : null, [r.regionProvince, r.regionCity].filter(Boolean).join(" · ") || null]
    .filter(Boolean)
    .join(" · ");
  const facts = factsOf(r);
  return (
    <article className="group card card-hover relative overflow-hidden py-3 pl-4 pr-3 lg:py-3.5 lg:pl-5 lg:pr-4">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[2.5px] transition-[width] duration-200 group-hover:w-[4px]"
        style={{ backgroundColor: color }}
      />
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {/* 类型标签自带淡底：扫一列卡片时先认出「变糟 / 程序性 / 恢复」，再看组织名。 */}
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11.5px] font-medium text-ink-2"
              style={{ backgroundColor: tint(color, 11) }}
              title={typeLabel}
            >
              <span aria-hidden className="size-[5px] rounded-full" style={{ backgroundColor: color }} />
              {typeLabel}
            </span>
            {meta && <span className="text-[11.5px] text-ink-4">{meta}</span>}
            {r.entityId && r.entityName && (
              <Link to={`/topics/${r.entityId}`} className="inline-flex items-center gap-0.5 text-[11.5px] font-medium text-accent hover:underline">
                已收录 · {r.entityName}
              </Link>
            )}
          </div>
          <h3 className="mt-1.5 truncate text-[15px] font-semibold leading-snug text-ink lg:text-[15.5px]">{r.orgName}</h3>
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-2">{headline(r)}</p>
          {facts.length > 0 && (
            <p className="num mt-2 truncate text-[11.5px] leading-4 text-ink-4" title={facts.join(" · ")}>
              {facts.slice(0, 3).join(" · ")}
            </p>
          )}
        </div>
        <div className="flex w-[68px] shrink-0 flex-col items-end gap-1.5">
          <time dateTime={r.publishedOn} className="num block text-right text-[12px] leading-4 text-ink-3">
            {monthDay(r.publishedOn)}
            <span className="block text-[10.5px] text-ink-4">{r.publishedOn.slice(0, 4)}</span>
          </time>
          <a
            href={r.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] text-ink-4 transition-colors hover:bg-bg-sunk hover:text-accent"
          >
            原文
            <IconArrowUpRight size={11} />
          </a>
        </div>
      </div>
    </article>
  );
}

export function RecordsPage({ data }: { data: RegulatoryRecordsPage }) {
  const [params] = useSearchParams();
  const activeType = params.get("type");
  const activeKind = params.get("kind");
  const activeProvince = params.get("province");
  const activeCity = params.get("city");
  const q = params.get("q");
  const pageCount = Math.max(1, Math.ceil(data.total / data.pageSize));
  const href = (p: number) => hrefWith("/records", params, { page: p <= 1 ? null : String(p) });
  const activeCount = [activeType, activeKind, activeProvince, activeCity, q].filter(Boolean).length;
  const searching = !!q;
  const keep = { type: activeType, kind: activeKind, province: activeProvince, city: activeCity };

  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-10">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 pb-1 pt-4 lg:pt-1">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-[1.3] text-ink lg:text-[24px]">监管</h1>
          {/* 手机上只留一句话，完整说明给桌面：那段解释数据来源与归一规则，手机上占掉小半屏。 */}
          <p className="mt-1.5 max-w-[640px] text-[13px] leading-relaxed text-ink-3 lg:hidden">
            民政部对全国性社会组织的行政处罚，以及活动异常名录、严重违法失信名单的列入、移出与送达公告，每天同步一次。
          </p>
          <p className="mt-1.5 hidden max-w-[680px] text-[13px] leading-relaxed text-ink-3 lg:block">
            民政部对全国性社会组织的行政处罚，以及全国社会组织活动异常名录、严重违法失信名单的列入、移出与送达公告。
            数据来自中国社会组织政务服务平台公开接口，每天同步一次。
          </p>
        </div>
        <p className="hidden shrink-0 items-center gap-1.5 text-[11.5px] text-ink-4 lg:flex">
          <span aria-hidden className="size-1.5 rounded-full bg-ok" />
          最近同步 {syncTime(data.stats.lastSyncedAt)}
        </p>
      </header>

      {/* 概览：全库口径，不随当前筛选收缩——它回答的是「我在整体里筛的是哪一块」。 */}
      <section className="card mt-3 p-3.5 lg:p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="flex items-baseline gap-1.5">
            <span className="num text-[26px] font-semibold leading-none tracking-tight text-ink lg:text-[28px]">{nf(data.stats.total)}</span>
            <span className="text-[12px] text-ink-3">条公开监管记录</span>
          </p>
          <p className="flex items-center gap-1.5 text-[11.5px] text-ink-4 lg:hidden">
            <span aria-hidden className="size-1.5 rounded-full bg-ok" />
            最近同步 {syncTime(data.stats.lastSyncedAt)}
          </p>
        </div>
        <div className="mt-3">
          <Composition stats={data.stats} />
        </div>
      </section>

      {/* 手机：筛选收进折叠块。带着筛选条件进来时默认展开，免得看不出结果为什么被过滤。 */}
      <details open={activeCount > 0 || undefined} className="group/filter mt-3 rounded-panel border border-line bg-bg-sunk/60 p-1.5 lg:hidden">
        <FilterSummary count={activeCount} />
        <div className="mt-2 px-1.5 pb-1">
          <FilterBody stats={data.stats} activeType={activeType} activeKind={activeKind} activeProvince={activeProvince} activeCity={activeCity} compact />
        </div>
      </details>

      <div className="mt-3 hidden rounded-panel border border-line bg-bg-sunk/50 p-3 lg:block">
        <FilterBody stats={data.stats} activeType={activeType} activeKind={activeKind} activeProvince={activeProvince} activeCity={activeCity} />
      </div>

      <div className="mt-3 lg:hidden">
        <SearchField action="/records" defaultValue={q ?? ""} keep={keep} variant="bar" placeholder="搜索组织名称…" />
      </div>

      {/* 结果行：左边报数量，右边是桌面搜索框（手机搜索在上面那条）。 */}
      <div className="mt-3 flex items-center gap-3">
        <p className="min-w-0 flex-1 text-[12.5px] text-ink-3">
          共 <span className="num font-semibold text-ink-2">{nf(data.total)}</span> 条
          {searching && <span className="text-ink-4"> · 关键词「{q}」</span>}
          {pageCount > 1 && <span className="num text-ink-4"> · 第 {data.page} / {pageCount} 页</span>}
        </p>
        <div className="hidden w-60 shrink-0 lg:block">
          <SearchField action="/records" defaultValue={q ?? ""} keep={keep} placeholder="搜索组织名称…" />
        </div>
      </div>

      <ActiveFilters activeType={activeType} activeKind={activeKind} activeProvince={activeProvince} activeCity={activeCity} q={q} />

      {data.items.length === 0 ? (
        <div className="mt-4 card">
          <EmptyState
            title="没有符合条件的记录"
            action={
              <Link to="/records" className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-[13px] font-semibold text-bg">
                清除全部筛选
              </Link>
            }
          >
            换个筛选条件，或清空组织名搜索试试。
          </EmptyState>
        </div>
      ) : (
        <div className="mt-3.5 grid gap-2.5">
          {data.items.map((r) => (
            <RecordCard key={r.id} r={r} />
          ))}
        </div>
      )}

      <Pagination page={data.page} pageCount={pageCount} href={href} />

      <section className="mt-6 flex gap-2.5 rounded-panel border border-line bg-bg-sunk/40 p-3.5">
        <IconShield size={15} className="mt-[2px] shrink-0 text-ink-4" />
        <p className="text-[11.5px] leading-relaxed text-ink-4">
          数据来源：中国社会组织政务服务平台
          <a href="https://chinanpo.mca.gov.cn/xzcfgg" className="mx-0.5 text-accent hover:underline" rel="noreferrer noopener" target="_blank">
            行政处罚公告
          </a>
          、
          <a href="https://chinanpo.mca.gov.cn/hdycmlYzwfsxgg" className="mx-0.5 text-accent hover:underline" rel="noreferrer noopener" target="_blank">
            活动异常名录和严重违法失信列入送达公告
          </a>
          ，每天同步一次。组织类型由统一社会信用代码推导，地区按登记管理机关归一成省 / 市。
          本站仅作汇集与检索，原始记录以登记管理机关发布为准。
        </p>
      </section>
    </div>
  );
}
