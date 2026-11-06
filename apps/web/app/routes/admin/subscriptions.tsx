import type { Route } from "./+types/subscriptions";
import { SITE } from "@aihot/industry/site";
import { useSearchParams } from "react-router";
import { adminGet } from "../../lib/admin.server";
import { bj, num } from "../../features/admin/format";
import { AdminPage, Badge, Card, DataTable, FilterChips, Input, Pager, Stat } from "../../features/admin/ui";

interface Sub {
  id: number;
  email: string;
  status: string;
  weekly: boolean;
  monthly: boolean;
  daily: boolean;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  bounce_count: number;
  last_bounce_at: string | null;
  sent_7d: number;
}
interface Data {
  rows: Sub[];
  total: number;
  page: number;
  hasMore: boolean;
  counts: Record<string, number>;
}

export async function loader({ request }: Route.LoaderArgs) {
  const sp = new URL(request.url).search;
  return adminGet<Data>(request, `/api/admin/subscriptions${sp}`);
}
export const meta: Route.MetaFunction = () => [{ title: `订阅人 · ${SITE.name} 后台` }];

const STATUS: Record<string, { tone: "ok" | "warn" | "muted" | "bad"; label: string }> = {
  active: { tone: "ok", label: "活跃" },
  pending: { tone: "warn", label: "待确认" },
  unsubscribed: { tone: "muted", label: "退订" },
  bounced: { tone: "bad", label: "退信" },
  complained: { tone: "bad", label: "投诉" },
};

export default function SubscriptionsAdmin({ loaderData: d }: Route.ComponentProps) {
  const [sp] = useSearchParams();
  return (
    <AdminPage title="订阅人" subtitle="邮件订阅名单（周报 / 月报 / 日报）。本页只读：取消或修改订阅请走数据库，或读者自助退订链接。">
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="订阅人总数" value={num(d.total)} />
        <Stat label="活跃" value={num(d.counts.active)} tone="ok" />
        <Stat label="退订" value={num(d.counts.unsubscribed)} />
        <Stat label="近 7 天发送" value={num(d.counts.sent_7d)} />
      </div>
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <FilterChips
            param="status"
            options={[
              { value: "", label: "全部" },
              { value: "active", label: "活跃", count: d.counts.active },
              { value: "pending", label: "待确认", count: d.counts.pending },
              { value: "unsubscribed", label: "退订", count: d.counts.unsubscribed },
              { value: "bounced", label: "退信", count: d.counts.bounced },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <FilterChips
            param="kind"
            options={[
              { value: "", label: "全部偏好" },
              { value: "daily", label: "日报" },
              { value: "weekly", label: "周报" },
              { value: "monthly", label: "月报" },
            ]}
          />
          <form method="get" className="ml-auto flex items-center gap-2">
            {sp.get("status") && <input type="hidden" name="status" value={sp.get("status")!} />}
            {sp.get("kind") && <input type="hidden" name="kind" value={sp.get("kind")!} />}
            <Input name="q" defaultValue={sp.get("q") ?? ""} placeholder="搜索邮箱…" className="!w-56 !py-1.5" />
          </form>
        </div>
        <DataTable
          rows={d.rows}
          rowKey={(r) => r.id}
          columns={[
            { key: "email", label: "邮箱", render: (r) => <div className="font-medium text-ink">{r.email}</div> },
            {
              key: "status",
              label: "状态",
              render: (r) => {
                const m = STATUS[r.status] ?? { tone: "muted" as const, label: r.status };
                return <Badge tone={m.tone}>{m.label}</Badge>;
              },
            },
            {
              key: "pref",
              label: "订阅",
              render: (r) => (
                <div className="flex flex-wrap gap-1">
                  {r.daily && <Badge tone="accent">日报</Badge>}
                  {r.weekly && <Badge>周报</Badge>}
                  {r.monthly && <Badge>月报</Badge>}
                  {!r.daily && !r.weekly && !r.monthly && <span className="text-ink-4">—</span>}
                </div>
              ),
            },
            { key: "sent7", label: "近 7 天发送", align: "right", render: (r) => num(r.sent_7d) },
            { key: "confirmed", label: "确认于", render: (r) => (r.confirmed_at ? bj(r.confirmed_at, true) : <span className="text-ink-4">未确认</span>) },
            { key: "created", label: "注册于", render: (r) => bj(r.created_at, true) },
          ]}
        />
        <div className="px-4 py-3">
          <Pager page={d.page} hasMore={d.hasMore} />
        </div>
      </Card>
    </AdminPage>
  );
}
