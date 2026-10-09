import { SITE } from "@aihot/industry/site";
import { Link } from "react-router";
import type { Route } from "./+types/usage";
import { adminGet } from "../../lib/admin.server";
import { LineChart, ShareBars, StackedBars } from "../../features/admin/charts";
import { bj, money, num } from "../../features/admin/format";
import { AdminPage, Card, DataTable, Empty, FilterChips, Stat } from "../../features/admin/ui";

interface Day {
  day: string;
  label: string;
  calls: number;
  tokensIn: number;
  tokensOut: number;
  amount: number | null;
  currency: string;
  priced: boolean;
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
  source_url: string | null;
  verified_on: string | null;
}

interface Usage {
  days: number;
  currency: string;
  priced: boolean;
  prices: Price[];
  daily: Day[];
  purposes: Purpose[];
  totals: { calls: number; tokensIn: number; tokensOut: number; amount: number | null };
  averages: { callsPerDay: number; tokensPerCall: number };
  activeDays: number;
  recent: { days: number; calls: number; tokensIn: number; tokensOut: number; amount: number | null; perDay: number | null; activeDays: number; perDayActive: number | null };
  projection: { amount: number; currency: string; basisDays: number } | null;
  projectedActive: { amount: number; currency: string; basisDays: number } | null;
  lifetime: { calls: number; tokensIn: number; tokensOut: number; first: string | null; amount: number | null };
}

export async function loader({ request }: Route.LoaderArgs) {
  const days = new URL(request.url).searchParams.get("days") ?? "30";
  return adminGet<Usage>(request, `/api/admin/usage?days=${encodeURIComponent(days)}`);
}

export const meta: Route.MetaFunction = () => [{ title: `用量与成本 · ${SITE.name} 后台` }];

const wan = (v: number) => `${num(v / 1e4, v >= 1e5 ? 0 : 2)} 万`;

export default function UsageAdmin({ loaderData: u }: Route.ComponentProps) {
  const cur = u.currency;
  const totalTokens = u.totals.tokensIn + u.totals.tokensOut;
  // Monthly is quoted as a range: the calendar average is pulled down by quiet days and the
  // active-day average up by spikes, so a single figure would overstate its own precision.
  const monthly = [u.projection?.amount, u.projectedActive?.amount].filter((v): v is number => v != null);
  const monthlyRange = monthly.length === 2 ? `${money(Math.min(...monthly), cur)}–${money(Math.max(...monthly), cur)}` : u.projection ? money(u.projection.amount, cur) : "—";

  return (
    <AdminPage
      title="用量与成本"
      subtitle="每次模型调用都会记下 token 用量，金额是按「计价方式」里的单价估算的——只有服务商回传了账单才是实付。注意：这里的日期是模型调用的发生时间（北京时间），不是内容的发布时间；一篇 7 月发布的政策文件可能今天才被抓到并分析，token 就记在今天。政府站白天抓取密、夜里几乎不跑，所以曲线的工作日/周末起伏是正常的。"
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
          label="估算费用"
          value={u.totals.amount === null ? "未定价" : money(u.totals.amount, cur)}
          tone={u.totals.amount === null ? "warn" : undefined}
          hint={u.totals.amount === null ? "填好单价后才有金额" : `每次调用约 ${money(u.totals.amount / u.totals.calls, cur)}`}
        />
        <Stat
          label={`近 ${u.recent.days} 天费用`}
          value={u.recent.amount === null ? "—" : money(u.recent.amount, cur)}
          hint={
            u.recent.perDay === null
              ? "暂无数据"
              : `日均 ${money(u.recent.perDay, cur)} · 月化 ${monthlyRange}`
          }
        />
      </div>

      {!u.priced && (
        <div className="mt-4">
          <Empty>
            还没有单价，所以只有 token 没有金额。单价存在 <span className="font-mono text-[12px]">service_prices</span> 表（按
            service + model 匹配），填入后本页自动生效，无需改代码。
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
        <Card title="每日费用（估算）" right={<span className="text-[12px] text-ink-4">按调用发生日（北京）· {cur}</span>}>
          <LineChart
            height={220}
            labels={u.daily.map((d) => d.label)}
            series={[{ key: "cost", label: "估算费用", color: "var(--accent)", values: u.daily.map((d) => d.amount) }]}
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

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title="计价方式" pad={false}>
          {u.prices.length ? (
            <DataTable
              dense
              rows={u.prices}
              rowKey={(p) => `${p.service}|${p.model}`}
              columns={[
                { key: "s", label: "服务", render: (p) => <span className="font-mono text-[12px]">{p.service}</span> },
                { key: "m", label: "模型", render: (p) => <span className="font-mono text-[12px]">{p.model || "（兜底）"}</span> },
                { key: "i", label: "输入 / 百万", align: "right", render: (p) => money(p.input_per_mtok ?? 0, p.currency) },
                { key: "o", label: "输出 / 百万", align: "right", render: (p) => money(p.output_per_mtok ?? 0, p.currency) },
                { key: "v", label: "核对于", align: "right", render: (p) => <span className="whitespace-nowrap text-ink-4">{p.verified_on ?? "—"}</span> },
              ]}
            />
          ) : (
            <Empty>
              <span className="font-mono text-[12px]">service_prices</span> 表是空的——金额无法估算。填入后本页自动生效，无需改代码。
            </Empty>
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
                ["累计调用", `${num(u.lifetime.calls)} 次`],
                ["累计 token", `${num(u.lifetime.tokensIn + u.lifetime.tokensOut)}（输入 ${num(u.lifetime.tokensIn)} / 输出 ${num(u.lifetime.tokensOut)}）`],
                ["累计估算费用", u.lifetime.amount === null ? "未定价" : `≈ ${money(u.lifetime.amount, cur)}`],
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
    </AdminPage>
  );
}
