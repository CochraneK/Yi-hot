import { SITE } from "@aihot/industry/site";
import { useState } from "react";
import { Form, Link } from "react-router";
import type { Route } from "./+types/source-candidates";
import { adminGet } from "../../lib/admin.server";
import { findLegacyCandidates, legacySourceTotal } from "../../lib/source-registry.server";
import { useAdminAction } from "../../features/admin/action";
import { AdminPage, Badge, Button, ButtonLink, Card, Empty, Input } from "../../features/admin/ui";

type ExistingSource = { id: string; name: string; kind: string; enabled: boolean; health: string };
type Feed = { url: string; format: "rss" | "atom" | "json"; title: string; sameHost: boolean; verified: false };
type Discovery = { requestedUrl: string; pageUrl: string; pageTitle: string | null; suggestions: Feed[]; note: string };

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 250);
  let lookup = query;
  try { lookup = new URL(query).hostname.replace(/^www\./, ""); } catch { /* keyword search */ }
  const existing = await adminGet<{ rows: ExistingSource[] }>(request, `/api/admin/sources?q=${encodeURIComponent(lookup)}&page=1`);
  return {
    query,
    existing: existing.rows.slice(0, query ? 15 : 5),
    candidates: findLegacyCandidates(query),
    candidateTotal: legacySourceTotal,
  };
}

export const meta: Route.MetaFunction = () => [{ title: `候选信源 · ${SITE.name} 后台` }];

function draftLink(url: string, name: string, isFeed: boolean) {
  return `/admin/sources/new?${new URLSearchParams({ url, name, kind: isFeed ? "rss" : "web_list" })}`;
}

export default function SourceCandidates({ loaderData }: Route.ComponentProps) {
  const { query, candidates, candidateTotal, existing } = loaderData;
  const [url, setUrl] = useState(query.startsWith("http") ? query : "");
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const { run, pending } = useAdminAction();

  const inspect = async (address: string) => {
    setUrl(address);
    setDiscovery(null);
    const result = await run<Discovery>(
      "POST", "/api/admin/sources/discover", { url: address }, { label: "discover", revalidate: false },
    );
    if (result) setDiscovery(result);
  };

  return (
    <AdminPage
      title="候选信源"
      subtitle="先查重，再发现订阅源，最后到现有页面试抓。这里只读，不会自动新增或启用来源。"
      actions={<ButtonLink to="/admin/sources">返回信源管理</ButtonLink>}
    >
      <div className="space-y-4">
        <Card>
          <Form method="get" className="flex flex-wrap gap-2">
            <div className="min-w-[220px] flex-1">
              <Input key={query} name="q" defaultValue={query} aria-label="查找网站或公众号" placeholder="输入机构、公众号名称或网站 URL" />
            </div>
            <button type="submit" className="rounded-control bg-ink px-4 py-2 text-[13px] font-medium text-bg hover:opacity-90">查找</button>
          </Form>
          <p className="mt-2 text-[12px] text-ink-4">已载入 NewsMail 历史候选 {candidateTotal} 条；还会比对当前 YiHot 数据库。历史清单不代表可用或有采集授权。</p>
        </Card>

        {existing.length > 0 && (
          <Card title={query ? "YiHot 中的相似信源" : "YiHot 当前信源（示例）"}>
            <div className="space-y-2">
              {existing.map((source) => (
                <div key={source.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 py-2 last:border-0">
                  <div className="min-w-0">
                    <Link className="text-[13px] font-medium text-ink hover:text-accent" to={`/admin/sources/${encodeURIComponent(source.id)}`}>{source.name}</Link>
                    <div className="font-mono text-[11px] text-ink-4">{source.id}</div>
                  </div>
                  <Badge tone={source.enabled ? "ok" : "muted"}>{source.enabled ? "已在管理" : "已暂停"}</Badge>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card title={query ? `历史候选 · ${candidates.length} 条匹配` : "历史候选 · 先看部分来源"}>
          {candidates.length ? (
            <div className="divide-y divide-line/70">
              {candidates.map((candidate) => (
                <div key={candidate.legacy_id} className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-medium text-ink">{candidate.name}</span>
                      <Badge>{candidate.kind_label}</Badge>
                      <Badge tone="warn">待核查</Badge>
                    </div>
                    <div className="break-all text-[12px] text-ink-4">{candidate.url ?? `关键词：${candidate.locator}`}</div>
                    <div className="text-[11px] text-ink-4">来自 NewsMail · 第 {candidate.source_line} 行；不视作自动采集许可</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {candidate.url && (
                      <>
                        <Button tone="ghost" busy={pending === "discover" && url === candidate.url} onClick={() => void inspect(candidate.url!)}>寻找 RSS</Button>
                        <ButtonLink to={draftLink(candidate.url, candidate.name, candidate.kind_label === "RSS")}>带入新建</ButtonLink>
                      </>
                    )}
                    {!candidate.url && <Badge tone="muted">仅发现线索</Badge>}
                  </div>
                </div>
              ))}
            </div>
          ) : <Empty>旧清单没有匹配项。可以尝试输入网站网址来发现 RSS；公众号名称尚不支持从微信实时检索。</Empty>}
        </Card>

        <Card title="发现 RSS / Atom">
          <div className="flex flex-wrap gap-2">
            <div className="min-w-[220px] flex-1">
              <Input aria-label="网站 URL" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.org/news" />
            </div>
            <Button busy={pending === "discover"} disabled={!/^https?:\/\//i.test(url)} onClick={() => void inspect(url)}>检查网页</Button>
          </div>
          <p className="mt-2 text-[12px] text-ink-4">仅请求公开网页并读取其声明的订阅链接；不猜测 RSS、不绕验证码、不自动抓正文。访问外站可能产生日志及少量网络请求。</p>
          {discovery && (
            <div className="mt-4 space-y-3 border-t border-line pt-3">
              <div className="text-[12px] text-ink-3">{discovery.pageTitle ?? "页面"} · {discovery.suggestions.length} 个候选订阅链接</div>
              {discovery.suggestions.length ? discovery.suggestions.map((feed) => (
                <div key={feed.url} className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="info">{feed.format.toUpperCase()}</Badge>
                      {!feed.sameHost && <Badge tone="warn">跨域来源</Badge>}
                      <Badge>尚未试抓</Badge>
                    </div>
                    <div className="mt-1 break-all font-mono text-[12px] text-ink-2">{feed.url}</div>
                  </div>
                  <ButtonLink to={draftLink(feed.url, discovery.pageTitle ?? "待确认来源", feed.format !== "json")}>带入试抓</ButtonLink>
                </div>
              )) : <Empty>网页没有声明 RSS/Atom/JSON Feed。可以换新闻栏目地址，或使用 YiHot 现有 web_list 类型配置专用解析器。</Empty>}
            </div>
          )}
        </Card>
      </div>
    </AdminPage>
  );
}
