import { SITE } from "@aihot/industry/site";
import { useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/usage";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { LineChart, ShareBars, StackedBars } from "../../features/admin/charts";
import { bj, money, num } from "../../features/admin/format";
import { AdminPage, Badge, Button, Card, DataTable, Empty, Field, FilterChips, Input, ReasonDialog, Select, Stat } from "../../features/admin/ui";

interface Day {
  day: string;
  label: string;
  calls: number;
  tokensIn: number;
  tokensOut: number;
  amount: number | null;
  /** What per-request providers actually debited that day (Beijing). Null when nothing was billed. */
  paid: number | null;
  currency: string;
  priced: boolean;
}

interface PerCallRow {
  service: string;
  calls: number;
  failed: number;
  billed: number;
  unbilled: number;
  amount: number | null;
  currency: string;
  unit: number | null;
}

interface Purpose {
  purpose: string;
  model: string | null;
  calls: number;
  tokensIn: number;
  tokensOut: number;
  amount: number;
  currency: string;
  priced: boolean;
}

interface Price {
  service: string;
  model: string;
  currency: string;
  input_per_mtok: string | null;
  cached_per_mtok: string | null;
  output_per_mtok: string | null;
  per_request: string | null;
  source_url: string | null;
  verified_on: string | null;
  note: string | null;
}

interface SeenModel {
  model: string;
  /** 调用时记录的 service，价格行按这个 + model 匹配。 */
  service: string | null;
  calls: number;
  /** 该模型名是否仍在 MODELS 注册表里（只影响提示，不影响计价）。 */
  registered: boolean;
  priced: boolean;
}

interface Usage {
  days: number;
  currency: string;
  priced: boolean;
  prices: Price[];
  daily: Day[];
  purposes: Purpose[];
  totals: { calls: number; tokensIn: number; tokensOut: number; amount: number | null; paid: number | null };
  /** `token` is our arithmetic from the price table; `api` is what providers really debited. Both are
   *  folded into `currency`; `unconverted` lists amounts that could not be (no USD_CNY_RATE). */
  spend: { token: number | null; api: number | null; total: number | null; currency: string; unconverted?: Array<{ currency: string; amount: number }> };
  perCall: {
    rows: PerCallRow[];
    calls: number;
    billed: number;
    amount: number | null;
    currency: string;
    lifetime: { calls: number; billed: number; amount: number | null };
  };
  averages: { callsPerDay: number; tokensPerCall: number };
  activeDays: number;
  recent: { days: number; calls: number; tokensIn: number; tokensOut: number; amount: number | null; paid: number | null; spend: number | null; perDay: number | null; activeDays: number; perDayActive: number | null };
  projection: { amount: number; currency: string; basisDays: number } | null;
  projectedActive: { amount: number; currency: string; basisDays: number } | null;
  lifetime: { calls: number; tokensIn: number; tokensOut: number; first: string | null; amount: number | null; apiCalls: number; apiAmount: number | null };
  seenModels: SeenModel[];
  services: string[];
}

export async function loader({ request }: Route.LoaderArgs) {
  const days = new URL(request.url).searchParams.get("days") ?? "30";
  return adminGet<Usage>(request, `/api/admin/usage?days=${encodeURIComponent(days)}`);
}

export const meta: Route.MetaFunction = () => [{ title: `用量与成本 · ${SITE.name} 后台` }];

const wan = (v: number) => `${num(v / 1e4, v >= 1e5 ? 0 : 2)} 万`;

/** Beijing "today", for pre-filling the date a price was checked against the provider's page. */
const todayBj = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

interface PriceForm {
  service: string;
  model: string;
  currency: string;
  inputPerMtok: string;
  cachedPerMtok: string;
  outputPerMtok: string;
  perRequest: string;
  sourceUrl: string;
  verifiedOn: string;
  note: string;
}

const blankForm = (currency = "USD"): PriceForm => ({
  service: "llm",
  model: "",
  currency,
  inputPerMtok: "",
  cachedPerMtok: "",
  outputPerMtok: "",
  perRequest: "",
  sourceUrl: "https://api-docs.deepseek.com/quick_start/pricing",
  verifiedOn: todayBj(),
  note: "",
});

/** PG numeric columns arrive as strings like "0.300000"; trim to what the operator would type. */
const rate = (v: string | null) => (v === null || v === "" ? "" : String(Number(v)));

const formOf = (p: Price): PriceForm => ({
  service: p.service,
  model: p.model,
  currency: p.currency,
  inputPerMtok: rate(p.input_per_mtok),
  cachedPerMtok: rate(p.cached_per_mtok),
  outputPerMtok: rate(p.output_per_mtok),
  perRequest: rate(p.per_request),
  sourceUrl: p.source_url ?? "",
  verifiedOn: p.verified_on ?? "",
  note: p.note ?? "",
});

export default function UsageAdmin({ loaderData: u }: Route.ComponentProps) {
  const cur = u.currency;
  const { run, pending } = useAdminAction();
  const [form, setForm] = useState<PriceForm | null>(null);
  const [formTitle, setFormTitle] = useState("新增单价");
  const [removing, setRemoving] = useState<Price | null>(null);

  const totalTokens = u.totals.tokensIn + u.totals.tokensOut;
  // Monthly is quoted as a range: the calendar average is pulled down by quiet days and the
  // active-day average up by spikes, so a single figure would overstate its own precision.
  const monthly = [u.projection?.amount, u.projectedActive?.amount].filter((v): v is number => v != null);
  const monthlyRange = monthly.length === 2 ? `${money(Math.min(...monthly), cur)}–${money(Math.max(...monthly), cur)}` : u.projection ? money(u.projection.amount, cur) : "—";

  const edit = (title: string, next: PriceForm) => {
    setFormTitle(title);
    setForm(next);
  };

  const savePrice = async (reason: string) => {
    if (!form) return false;
    const res = await run("POST", "/api/admin/usage/prices", { price: form, reason }, { success: "单价已保存，金额立刻生效", label: "price.save" });
    return res !== null;
  };

  const removePrice = async (reason: string) => {
    if (!removing) return false;
    const qs = new URLSearchParams({ service: removing.service, model: removing.model, reason });
    const res = await run("DELETE", `/api/admin/usage/prices?${qs}`, undefined, { success: "已删除单价", label: "price.delete" });
    return res !== null;
  };

  const isEmptyForm = form !== null && !form.inputPerMtok.trim() && !form.outputPerMtok.trim() && !form.perRequest.trim();

  return (
    <AdminPage
      title="用量与成本"
      subtitle="每次模型调用都会记下 token 用量（含缓存命中与未命中），金额是按「计价方式」里的单价估算的——只有服务商回传了账单才是实付。按次计费的采集接口（小红书、公众号、网页搜索这类）不计 token，它们扣掉的钱单列在「按次计费的服务商」里，两者相加才是这段时间的真实花费。高峰/空闲双价的服务（DeepSeek 工作日 9–12、14–18 翻倍），空闲价填主行、高峰价另建一行并在模型名后加 @peak 后缀。注意：这里的日期是调用发生的时间（北京时间），不是内容的发布时间；一篇 7 月发布的政策文件可能今天才被抓到并分析，token 就记在今天。政府站白天抓取密、夜里几乎不跑，所以曲线的工作日/周末起伏是正常的。"
      actions={
        <FilterChips
          param="days"
          options={[
            { value: "7", label: "7 天" },
            { value: "", label: "30 天" },
            { value: "90", label: "90 天" },
            { value: "365", label: "一年" },
          ]}
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`调用（近 ${u.days} 天）`} value={num(u.totals.calls)} hint={`有调用的 ${u.activeDays} 天 · 日${num(u.averages.callsPerDay)} 次`} />
        <Stat label="token 合计" value={num(totalTokens)} hint={`输入 ${num(u.totals.tokensIn)} · 输出 ${num(u.totals.tokensOut)}`} />
        <Stat
          label="费用合计"
          value={u.spend.total === null ? "未定价" : money(u.spend.total, cur)}
          tone={u.spend.total === null ? "warn" : undefined}
          hint={
            u.spend.total === null
              ? "填好单价后才有金额"
              : `模型估算 ${u.spend.token === null ? "—" : money(u.spend.token, cur)} · 按次实付 ${u.spend.api === null ? "—" : money(u.spend.api, cur)}${
                  u.spend.unconverted?.length
                    ? ` · 另有 ${u.spend.unconverted.map((x) => `${x.currency} ${x.amount.toFixed(2)}`).join("、")} 未折算（设 USD_CNY_RATE 后并入）`
                    : ""
                }`
          }
        />
        <Stat
          label={`近 ${u.recent.days} 天费用`}
          value={u.recent.spend === null ? "—" : money(u.recent.spend, cur)}
          hint={
            u.recent.perDay === null
              ? "暂无数据"
              : `日均 ${money(u.recent.perDay, cur)} · 月化 ${monthlyRange}`
          }
        />
      </div>

      {!u.priced && u.perCall.rows.length === 0 && (
        <div className="mt-4">
          <Empty>
            还没有单价，所以只有 token 没有金额。点下面「计价方式」里的<span className="text-ink-2">新增单价</span>
            填一条即可，本页会自动生效，不用改代码也不用碰数据库。
          </Empty>
        </div>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title="每日 token 用量" right={<span className="text-[12px] text-ink-4">按调用发生日（北京）</span>}>
          <StackedBars
            height={220}
            labels={u.daily.map((d) => d.label)}
            series={[
              { key: "in", label: "输入", color: "var(--accent)", values: u.daily.map((d) => d.tokensIn) },
              { key: "out", label: "输出", color: "var(--amber)", values: u.daily.map((d) => d.tokensOut) },
            ]}
            format={wan}
          />
        </Card>
        <Card title="每日费用" right={<span className="text-[12px] text-ink-4">按调用发生日（北京）· {cur}</span>}>
          <LineChart
            height={220}
            labels={u.daily.map((d) => d.label)}
            series={[
              { key: "cost", label: "模型估算", color: "var(--accent)", values: u.daily.map((d) => d.amount) },
              { key: "paid", label: "按次实付", color: "var(--amber)", values: u.daily.map((d) => d.paid), dashed: true },
            ]}
            format={(v) => money(v, cur)}
          />
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card title="按用途" pad={false}>
          {u.purposes.length ? (
            <DataTable
              dense
              rows={u.purposes}
              rowKey={(p) => `${p.purpose}|${p.model}`}
              columns={[
                { key: "p", label: "用途", render: (p) => <span className="whitespace-nowrap font-mono text-[11.5px] text-ink-3">{p.purpose}</span> },
                { key: "m", label: "模型", render: (p) => <span className="whitespace-nowrap font-mono text-[12px]">{p.model ?? "—"}</span> },
                { key: "c", label: "调用", align: "right", render: (p) => num(p.calls) },
                { key: "i", label: "输入 token", align: "right", render: (p) => num(p.tokensIn) },
                { key: "o", label: "输出 token", align: "right", render: (p) => num(p.tokensOut) },
                {
                  key: "$",
                  label: "费用",
                  align: "right",
                  render: (p) => (p.priced ? <span className="whitespace-nowrap">{`≈ ${money(p.amount, p.currency)}`}</span> : <span className="text-ink-4">未定价</span>),
                },
              ]}
            />
          ) : (
            <Empty>这个时段没有模型调用</Empty>
          )}
        </Card>

        <Card title="用量占比">
          {u.purposes.length ? (
            <ShareBars rows={u.purposes.map((p) => ({ label: p.purpose, value: p.tokensIn + p.tokensOut }))} />
          ) : (
            <Empty>暂无数据</Empty>
          )}
        </Card>
      </div>

      <div className="mt-5">
        <Card
          title="按次计费的服务商"
          pad={false}
          right={<span className="text-[12px] text-ink-4">服务商回执为实扣；网页搜索这类按官方单价估算</span>}
        >
          {u.perCall.rows.length ? (
            <>
              <DataTable
                dense
                rows={u.perCall.rows}
                rowKey={(r) => r.service}
                columns={[
                  { key: "s", label: "服务", render: (r) => <span className="font-mono text-[12px]">{r.service}</span> },
                  { key: "c", label: "调用", align: "right", render: (r) => num(r.calls) },
                  { key: "f", label: "失败", align: "right", render: (r) => (r.failed ? <span className="text-ink-3">{num(r.failed)}</span> : <span className="text-ink-4">—</span>) },
                  { key: "b", label: "已扣费", align: "right", render: (r) => num(r.billed) },
                  {
                    key: "u",
                    label: "未扣费",
                    align: "right",
                    render: (r) => (r.unbilled ? <span className="text-ink-3">{num(r.unbilled)}</span> : <span className="text-ink-4">—</span>),
                  },
                  { key: "p", label: "单次均价", align: "right", render: (r) => (r.unit === null ? <span className="text-ink-4">—</span> : <span className="whitespace-nowrap">{money(r.unit, r.currency)}</span>) },
                  {
                    key: "$",
                    label: "近段时间实付",
                    align: "right",
                    render: (r) => (r.amount === null ? <span className="text-ink-4">未扣费</span> : <span className="whitespace-nowrap font-medium">{money(r.amount, r.currency)}</span>),
                  },
                ]}
              />
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line px-4 py-2.5 text-[12px] text-ink-3">
                <span>
                  近 {u.days} 天共 {num(u.perCall.calls)} 次调用，其中 {num(u.perCall.billed)} 次扣费
                  {u.perCall.lifetime.calls > u.perCall.calls && ` · 至今累计 ${num(u.perCall.lifetime.calls)} 次、${u.perCall.lifetime.amount === null ? "—" : money(u.perCall.lifetime.amount, u.perCall.currency)}`}
                </span>
                <span className="num">
                  合计 {u.perCall.amount === null ? "—" : money(u.perCall.amount, u.perCall.currency)}
                </span>
              </div>
            </>
          ) : (
            <Empty>这段时间没有按次计费的服务调用。</Empty>
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card
          title="计价方式"
          pad={false}
          right={
            <Button size="sm" onClick={() => edit("新增单价", blankForm(cur))}>
              新增单价
            </Button>
          }
        >
          {u.prices.length ? (
            <DataTable
              dense
              rows={u.prices}
              rowKey={(p) => `${p.service}|${p.model}`}
              columns={[
                { key: "s", label: "服务", render: (p) => <span className="font-mono text-[12px]">{p.service}</span> },
                { key: "m", label: "模型", render: (p) => <span className="font-mono text-[12px]" title={p.note ?? undefined}>{p.model || "（兜底）"}</span> },
                { key: "i", label: "输入 / 百万", align: "right", render: (p) => (p.input_per_mtok === null ? <span className="text-ink-4">—</span> : money(p.input_per_mtok, p.currency)) },
                { key: "o", label: "输出 / 百万", align: "right", render: (p) => (p.output_per_mtok === null ? <span className="text-ink-4">—</span> : money(p.output_per_mtok, p.currency)) },
                { key: "r", label: "按次", align: "right", render: (p) => (p.per_request === null ? <span className="text-ink-4">—</span> : money(p.per_request, p.currency)) },
                { key: "v", label: "核对于", align: "right", render: (p) => <span className="whitespace-nowrap text-ink-4">{p.verified_on ?? "—"}</span> },
                {
                  key: "a",
                  label: "",
                  align: "right",
                  render: (p) => (
                    <span className="flex justify-end gap-1">
                      <Button size="sm" tone="ghost" onClick={() => edit(`${p.service} / ${p.model || "兜底单价"}`, formOf(p))}>
                        编辑
                      </Button>
                      <Button size="sm" tone="ghost" onClick={() => setRemoving(p)}>
                        删除
                      </Button>
                    </span>
                  ),
                },
              ]}
            />
          ) : (
            <Empty>
              <span className="font-mono text-[12px]">service_prices</span> 表是空的——金额无法估算。点右上角「新增单价」填一条即可。
            </Empty>
          )}

          {u.seenModels.length > 0 && (
            <div className="border-t border-line px-4 py-3">
              <div className="text-[12px] text-ink-3">
                实际在用（近 {u.days} 天）—— 单价按 <span className="font-mono">service + model</span> 匹配，模型名对不上就永远算不出钱。
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {u.seenModels.map((m) => {
                  return (
                    <span key={`${m.service}|${m.model}`} className="inline-flex items-center gap-1.5 rounded-full bg-bg-sunk px-2.5 py-1 text-[12px] ring-1 ring-line">
                      <span className="font-mono text-ink-2">{m.model}</span>
                      {m.priced ? (
                        <Badge tone="ok">已定价</Badge>
                      ) : (
                        <Badge tone="warn">未定价</Badge>
                      )}
                      {!m.registered && (
                        <Badge tone="bad" title="这个名字已不在 MODELS 注册表里（模型改名/下线）。计价用的是调用时记录的 service，所以只要下面有对应单价行仍能算钱；新建源时不要再选它。">
                          已下线名
                        </Badge>
                      )}
                      {!m.priced && m.service !== null && (
                        <button
                          type="button"
                          className="text-accent hover:underline"
                          onClick={() => edit(`为 ${m.model} 补单价`, { ...blankForm(cur), service: m.service!, model: m.model })}
                        >
                          补价
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {u.prices.some((p) => p.source_url) && (
            <div className="border-t border-line px-4 py-2.5 text-[12px] text-ink-4">
              来源：
              {[...new Set(u.prices.map((p) => p.source_url).filter(Boolean))].map((url) => (
                <a key={url} href={url!} target="_blank" rel="noreferrer" className="ml-1 text-accent">
                  {url}
                </a>
              ))}
            </div>
          )}
        </Card>

        <Card title="至今累计（不受时段筛选影响）">
          <dl className="grid gap-2.5 text-[13px]">
            {(
              [
                ["首次调用", u.lifetime.first ? bj(u.lifetime.first, true) : "—"],
                ["累计调用", `${num(u.lifetime.calls + u.lifetime.apiCalls)} 次`],
                ["累计 token", `${num(u.lifetime.tokensIn + u.lifetime.tokensOut)}（输入 ${num(u.lifetime.tokensIn)} / 输出 ${num(u.lifetime.tokensOut)}）`],
                [
                  "累计费用",
                  u.lifetime.amount === null && u.lifetime.apiAmount === null
                    ? "未定价"
                    : `≈ ${money((u.lifetime.amount ?? 0) + (u.lifetime.apiAmount ?? 0), cur)}`,
                ],
                ["其中按次实付", u.lifetime.apiAmount === null ? "—" : `${money(u.lifetime.apiAmount, cur)}（${num(u.lifetime.apiCalls)} 次）`],
                ["近 7 天有调用", `${u.recent.activeDays} 天（日均 ${u.recent.perDay === null ? "—" : money(u.recent.perDay!, cur)}）`],
                [
                  "月化区间",
                  monthly.length === 2
                    ? `${monthlyRange}（下界＝日历日均×30，上界＝活跃日均×30）`
                    : "—",
                ],
              ] as Array<[string, string]>
            ).map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 border-b border-line-soft pb-2 last:border-0">
                <dt className="shrink-0 text-ink-3">{k}</dt>
                <dd className="num text-right text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[12px] text-ink-4">
            金额是「token 数 × 单价」的估算，按高峰价口径填写时即为上限；服务商若回传实际账单，会在「
            <Link to="/admin/models" className="text-accent">
              模型与评测
            </Link>
            」里以实付覆盖。月化故意给<span className="text-ink-2">区间</span>而不是单值：下界＝近 {u.recent.days} 天日历日均 × 30（被节假日空窗压低），上界＝同期活跃日均 × 30（被首次全量回填的尖峰抬高）。站点历史只有十来天，把它当量级参考即可。
          </p>
        </Card>
      </div>

      <ReasonDialog
        open={form !== null}
        title={formTitle}
        description="单价存在 service_prices 表（按 service + model 匹配），保存后本页金额立刻重算。输入/输出单价按「每百万 token」填；留空表示不适用。"
        confirmLabel="保存"
        busy={pending === "price.save"}
        onClose={() => setForm(null)}
        onSubmit={savePrice}
      >
        {form && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="服务">
              <Select value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })}>
                {[...new Set([...u.services, form.service].filter(Boolean))].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="模型" hint="留空＝该服务的兜底价；其余必须与调用时记录的模型名完全一致">
              <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="deepseek-chat" />
            </Field>
            <Field label="币种">
              <Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                <option value="USD">USD</option>
                <option value="CNY">CNY</option>
              </Select>
            </Field>
            <Field label="核对日期">
              <Input type="date" value={form.verifiedOn} onChange={(e) => setForm({ ...form, verifiedOn: e.target.value })} />
            </Field>
            <Field label={`输入单价（${form.currency} / 百万 token）`}>
              <Input value={form.inputPerMtok} onChange={(e) => setForm({ ...form, inputPerMtok: e.target.value })} inputMode="decimal" placeholder="0.30" />
            </Field>
            <Field label={`输出单价（${form.currency} / 百万 token）`}>
              <Input value={form.outputPerMtok} onChange={(e) => setForm({ ...form, outputPerMtok: e.target.value })} inputMode="decimal" placeholder="1.20" />
            </Field>
            <Field label={`缓存命中单价（${form.currency} / 百万 token，可填）`} hint="调用记录里带命中/未命中 token 数，命中部分按这个价格算；留空则命中部分按输入单价算（会高估）">
              <Input value={form.cachedPerMtok} onChange={(e) => setForm({ ...form, cachedPerMtok: e.target.value })} inputMode="decimal" />
            </Field>
            <Field label={`按次单价（${form.currency} / 次，可空）`} hint="按调用次数计费的服务填这里；与 token 单价可同时生效（相加）">
              <Input value={form.perRequest} onChange={(e) => setForm({ ...form, perRequest: e.target.value })} inputMode="decimal" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="来源 URL" hint="服务商价目页，留档备查">
                <Input value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} placeholder="https://…" />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="备注" hint="写进单价行（如「高峰价」「含缓存」）">
                <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="高峰价（北京 00:30–08:30 之外）" />
              </Field>
            </div>
            {isEmptyForm && <div className="text-[12px] text-amber sm:col-span-2">至少填一个价格（输入 / 输出 / 按次），否则保存会被拒绝。</div>}
          </div>
        )}
      </ReasonDialog>

      <ReasonDialog
        open={removing !== null}
        title="删除单价"
        description={
          removing
            ? `删除后 ${removing.service} / ${removing.model || "兜底"} 的调用会重新显示为「未定价」。`
            : undefined
        }
        confirmLabel="删除"
        danger
        busy={pending === "price.delete"}
        onClose={() => setRemoving(null)}
        onSubmit={removePrice}
      />
    </AdminPage>
  );
}
