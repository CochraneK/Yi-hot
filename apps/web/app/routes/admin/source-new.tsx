import { SITE } from "@aihot/industry/site";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { Route } from "./+types/source-new";
import { useAdminAction } from "../../features/admin/action";
import { bj } from "../../features/admin/format";
import { KIND_LABEL, MODE_LABEL, TIER_LABEL } from "../../features/admin/labels";
import { AdminPage, Button, Card, Empty, Field, Input, Select, Textarea } from "../../features/admin/ui";
import { sourceProposals } from "../../lib/source-registry.server";

export const meta: Route.MetaFunction = () => [{ title: `新建信源 · ${SITE.name} 后台` }];

export function loader({ request }: Route.LoaderArgs) {
  const id = new URL(request.url).searchParams.get("proposal");
  const proposal = sourceProposals.find(p => p.id === id && p.status === "preview_ready");
  return { proposal: proposal ?? null };
}

const TEMPLATES: Record<string, Record<string, unknown>> = {
  rss: { feedUrl: "https://example.com/feed.xml" },
  web_list: { url: "https://example.com/blog", baseUrl: "https://example.com", itemSelector: "article", linkSelector: "a", titleSelector: "h2", allowUrlPrefixes: ["https://example.com/blog/"] },
  json_list: { url: "https://example.com/api/posts", mode: "json_api", method: "GET", itemsPath: "data.items", titlePaths: ["title"], urlTemplate: "{raw:url}", summaryPaths: ["summary"] },
  x_search: { query: "from:handle -filter:replies", searchType: "Latest" },
  // 网页搜索：按请求计费（¥0.005/次），queries 里每个词各算一次；同日同查询只真跑一次。
  search: { queries: ["关键词 一", "关键词 二"], count: 20, lookbackDays: 7, minAuthority: 2 },
  mp_account: { ghid: "", nickname: "" },
  external: {},
};

interface Preview {
  ms: number;
  count: number;
  items: Array<{ title: string; url: string; publishedAt: string | null; excerpt: string }>;
}

export default function NewSource({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const proposal = loaderData.proposal;
  const wechat = params.get("wechat") === "1";
  const requestedKind = proposal?.kind ?? params.get("kind");
  const initialKind = requestedKind && requestedKind in TEMPLATES ? requestedKind : "rss";
  const requestedUrl = params.get("url") ?? "";
  const initialUrl = (requestedUrl.startsWith("https://") || requestedUrl.startsWith("http://")) && requestedUrl.length <= 2048 ? requestedUrl : "";
  const initialName = (proposal?.name ?? params.get("name") ?? "").slice(0, 200);
  const { run, pending } = useAdminAction();
  const [form, setForm] = useState({ id: proposal?.id ?? "", name: initialName, kind: initialKind, tier: proposal?.tier ?? "T2", participation_mode: "isolated", interval_minutes: 120, first_party: proposal?.first_party ?? false, site_fulltext: false, syndicate_fulltext: false, tags: "" });
  const [config, setConfig] = useState(() => {
    if (proposal?.config) return JSON.stringify(proposal.config, null, 2);
    const template = { ...TEMPLATES[initialKind] };
    if (initialUrl && initialKind === "rss") template.feedUrl = initialUrl;
    if (initialUrl && initialKind === "web_list") template.url = initialUrl;
    if (initialUrl && initialKind === "json_list") template.url = initialUrl;
    return JSON.stringify(template, null, 2);
  });
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);

  const parsed = () => {
    try {
      setError(null);
      return JSON.parse(config) as Record<string, unknown>;
    } catch (e) {
      setError(`配置不是合法 JSON：${(e as Error).message}`);
      return null;
    }
  };

  return (
    <AdminPage title="新建信源" subtitle="先判重、先预览：优先 RSS/JSON 等稳定协议；首抓成功且有真实条目才算接入完成。一手身份要有运营主体或官方交叉链接证据。">
      <p className="mb-4 rounded-card bg-bg-sunk px-3 py-2 text-[12.5px] leading-relaxed text-ink-3">新信源创建后默认暂停，须核实采集许可、原标题与日期后在详情页手动启用；候选发现和预览本身不入库。</p>
      {wechat && <Card title="公众号 RSS · WeRSS">
        <p className="mb-3 text-[13px] text-ink-3">先在 WeRSS 扫码登录，搜索并添加公众号，再复制该账号的 RSS 链接。填入下面后点“预览抓取”，核对真实标题、发布日期和原文链接。</p>
        <Field label="公众号 RSS 地址" hint="可直接粘贴 WeRSS 中复制的单个账号订阅链接，系统会转换为 YiHot 可读取的地址。">
          <Input placeholder="粘贴公众号 RSS 链接" onChange={e => {
            let feedUrl = e.target.value.trim();
            try {
              const u = new URL(feedUrl);
              if (/^\/feed\/[A-Za-z0-9_-]+\.(?:rss|xml|atom)$/.test(u.pathname)) feedUrl = `http://werss:8001${u.pathname}${u.search}`;
            } catch { /* Keep incomplete input for the preview's validation. */ }
            setConfig(JSON.stringify({ feedUrl }, null, 2));
            setForm(f => ({ ...f, kind: "rss" })); setPreview(null);
          }} />
        </Field>
      </Card>}
      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <Card title="信源定义">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ID" hint="小写字母、数字和连字符，创建后不可改">
              <Input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value.toLowerCase() })} placeholder="one-foundation" />
            </Field>
            <Field label="名称">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="壹基金官网" />
            </Field>
            <Field label="类型">
              <Select
                value={form.kind}
                onChange={(e) => {
                  setForm({ ...form, kind: e.target.value });
                  setConfig(JSON.stringify(TEMPLATES[e.target.value] ?? {}, null, 2));
                  setPreview(null);
                }}
              >
                {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="采集间隔（分钟）">
              <Input type="number" min={1} max={1440} value={form.interval_minutes} onChange={(e) => setForm({ ...form, interval_minutes: Number(e.target.value) })} />
            </Field>
            <Field label="参与方式">
              <Select value={form.participation_mode} onChange={(e) => setForm({ ...form, participation_mode: e.target.value })}>
                {Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="等级">
              <Select value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}>
                {Object.entries(TIER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="标签（逗号分隔）">
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            </Field>
            <div className="flex flex-col justify-end gap-2 text-[13px] text-ink-2">
              {([
                ["first_party", "一手信源"],
                ["site_fulltext", "站内可展示全文"],
                ["syndicate_fulltext", "对外接口可带全文"],
              ] as const).map(([k, label]) => (
                <label key={k} className="inline-flex items-center gap-2">
                  <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.checked })} />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <Field label="采集配置（JSON）">
              <Textarea className="font-mono !text-[12px]" rows={10} value={config} onChange={(e) => setConfig(e.target.value)} spellCheck={false} />
            </Field>
            {error && <div className="mt-1 text-[12.5px] text-hot">{error}</div>}
          </div>
          {duplicate && (
            <div className="mt-4 rounded-card bg-amber/10 px-4 py-3 text-[13px] text-ink-2 ring-1 ring-amber/25">
              这个地址已经在监控：<Link className="font-medium text-accent" to={`/admin/sources/${encodeURIComponent(duplicate.id)}`}>{duplicate.name}</Link>（{duplicate.id}）。没有新建。
            </div>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button
              busy={pending === "preview"}
              onClick={async () => {
                const c = parsed();
                if (!c) return;
                const r = await run<Preview>("POST", "/api/admin/sources/preview", { id: form.id || "draft", kind: form.kind, config: c }, { label: "preview", revalidate: false });
                if (r) setPreview(r);
              }}
            >
              预览抓取
            </Button>
            <Button
              tone="primary"
              busy={pending === "create"}
              disabled={!form.id || !form.name}
              onClick={async () => {
                const c = parsed();
                if (!c) return;
                const r = await run<{ created: boolean; duplicate?: { id: string; name: string }; source?: { id: string } }>(
                  "POST",
                  "/api/admin/sources",
                  { ...form, tags: form.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean), config: c },
                  { label: "create", revalidate: false },
                );
                if (!r) return;
                if (!r.created && r.duplicate) setDuplicate(r.duplicate);
                else if (r.source) navigate(`/admin/sources/${encodeURIComponent(r.source.id)}`);
              }}
            >
              创建
            </Button>
          </div>
        </Card>
        <Card title={preview ? `预览：${preview.count} 条（${preview.ms}ms）` : "预览"}>
          {!preview ? (
            <Empty>填好配置后点“预览抓取”，这里显示将会采集到的条目（不入库）。</Empty>
          ) : preview.items.length ? (
            <ul className="space-y-3">
              {preview.items.map((i) => (
                <li key={i.url} className="text-[13px]">
                  <a href={i.url} target="_blank" rel="noreferrer" className="font-medium text-ink hover:text-accent">{i.title}</a>
                  <div className="text-[12px] text-ink-4">{i.publishedAt ? bj(i.publishedAt, true) : "无发布时间"}</div>
                  {i.excerpt && <div className="mt-0.5 line-clamp-2 text-[12.5px] text-ink-3">{i.excerpt}</div>}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>没有抓到条目。</Empty>
          )}
        </Card>
      </div>
    </AdminPage>
  );
}
