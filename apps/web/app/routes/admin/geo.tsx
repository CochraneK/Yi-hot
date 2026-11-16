import { useState, type FormEvent } from "react";
import { Form, Link } from "react-router";
import type { Route } from "./+types/geo";
import type { GeoReviewPage, GeoReviewRow, GeoReviewPlace } from "@aihot/contracts/geo-review";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { AdminPage, Badge, Button, Card, Empty, Field, Input, Select, Textarea } from "../../features/admin/ui";

const ROLES = { event: "事件发生地", affected: "服务或受影响地区", publisher: "主体机构所在地", mentioned: "仅提及或未能判断" };
const STATUSES = { pending: "待审核", verified: "已通过", rejected: "已驳回" };
export async function loader({ request }: Route.LoaderArgs) {
  const u = new URL(request.url), sp = new URLSearchParams();
  for (const k of ["status", "role", "q", "placeQ", "page", "stale"]) { const v=u.searchParams.get(k); if(v)sp.set(k,v); }
  return adminGet<GeoReviewPage>(request, `/api/admin/geo?${sp}`);
}
export function headers() { return { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" }; }

function Candidate({ row, places }: { row: GeoReviewRow; places: GeoReviewPlace[] }) {
  const [placeId,setPlaceId] = useState(row.placeId ?? "");
  const [reason,setReason] = useState("");
  const [confirmed,setConfirmed] = useState(false);
  const { run, busy } = useAdminAction();
  const selectedPlace = places.find(p=>p.id===placeId);
  const current = row.inputRevision === row.currentRevision && row.currentAnalysis;
  const command = async (action: "approve"|"reject"|"reopen") => {
    if(reason.trim().length < 4 || (action === "approve" && (!confirmed || !selectedPlace || !current))) return;
    await run("POST",`/api/admin/geo/${row.id}/review`,{action,reason,...(action==="approve"?{placeId}: {})},{success:action==="approve"?"已记录审核；只有事件发生地进入公开索引":action==="reject"?"已驳回候选":"已重新打开，原审批仍保留在审计记录中"});
  };
  const source = /^https?:\/\//i.test(row.url) ? row.url : null;
  return <Card>
    <div className="flex flex-wrap items-center gap-2"><Badge tone={row.status==="pending"?"warn":row.status==="verified"?"ok":"muted"}>{STATUSES[row.status]}</Badge><Badge>{ROLES[row.role]}</Badge>{!current&&<Badge tone="bad">旧版本或非当前分析</Badge>}</div>
    <h2 className="mt-3 break-words text-[15px] font-semibold text-ink">{row.title}</h2>
    <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-ink-3">
      {source&&<a href={source} target="_blank" rel="noreferrer" className="text-accent underline">打开原文</a>}
      <Link to={`/admin/content/${encodeURIComponent(row.articleId)}`} className="text-accent">内容诊断</Link>
      <span>原文版本 {row.inputRevision} / 当前 {row.currentRevision}</span>
      <span>{row.visibility ?? "未发布"}{row.eligible?" · 在动态池中":" · 未进入动态池"}</span>
    </div>
    <div className="my-3 rounded-control bg-bg-sunk p-3 text-[13px] leading-relaxed text-ink-2"><p className="font-medium">候选地名：{row.placeText}</p><blockquote className="mt-1 whitespace-pre-wrap break-words">{row.evidence}</blockquote></div>
    <p className="mb-3 text-[12px] text-ink-4">引文存在不等于角色正确。请核对事件地点、机构地址、服务覆盖范围及同名地区；只有“事件发生地”通过后才进入已审核新闻索引。</p>
    {row.reviewedBy&&<p className="mb-3 text-[12px] text-ink-3">上次审核：{row.reviewedBy} · {row.reviewReason}</p>}
    {row.status==="pending"&&<Field label="对应的已登记地点"><Select aria-label={`候选${row.id}对应地点`} value={selectedPlace?.id ?? ""} onChange={e=>setPlaceId(e.target.value)}><option value="">请选择；未登记时先在下方创建</option>{places.map(p=><option key={p.id} value={p.id}>{p.name} · {[p.countryCode,p.region,p.city].filter(Boolean).join(" / ")} · {p.id}</option>)}</Select></Field>}
    {placeId&&places.find(p=>p.id===placeId)&&<p className="mt-2 text-[12px] text-ink-3">代表坐标 {places.find(p=>p.id===placeId)!.lat}, {places.find(p=>p.id===placeId)!.lon}；<a href={places.find(p=>p.id===placeId)!.sourceUrl} target="_blank" rel="noreferrer" className="underline">核对地点来源</a></p>}
    <div className="mt-3"><Field label={row.status==="pending"?"审核理由（至少4字）":"重新打开的理由（至少4字）"}><Textarea aria-label={`候选${row.id}审核理由`} value={reason} maxLength={800} onChange={e=>setReason(e.target.value)} placeholder="说明依据、地点角色与核对结果" /></Field></div>
    {row.status==="pending"&&<label className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-ink-3"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1"/>已打开原文并核对地名、角色和地点来源</label>}
    <div className="mt-3 flex flex-wrap gap-2">
      {row.status==="pending"?<><Button disabled={busy||!current||!selectedPlace||!confirmed||reason.trim().length<4} onClick={()=>void command("approve")}>通过审核</Button><Button tone="ghost" disabled={busy||reason.trim().length<4} onClick={()=>void command("reject")}>驳回</Button></>:<Button disabled={busy||reason.trim().length<4} onClick={()=>void command("reopen")}>重新打开审核</Button>}
    </div>
  </Card>;
}
function NewPlace() {
  const {run,busy}=useAdminAction();
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form=e.currentTarget;const f=Object.fromEntries(new FormData(form));
    const result=await run("POST","/api/admin/geo/places",{...f,lat:Number(f.lat),lon:Number(f.lon),countryCode:String(f.countryCode).trim().toUpperCase()},{success:"地点已登记，来源和创建理由已记入审计"});
    if(result)form.reset();
  }
  return <details className="rounded-panel bg-surface p-4 ring-1 ring-line"><summary className="cursor-pointer text-[14px] font-medium text-ink">登记新的标准地点</summary>
    <p className="my-3 text-[12px] text-ink-3">这里只登记有来源的城市或行政区域代表坐标，不代表已经证明任何新闻发生在这里。已有地点不可覆盖，请直接在候选中选用。</p>
    <form onSubmit={e=>void submit(e)} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="地点 ID（英文、数字、连字符）"><Input name="id" required pattern="[a-z0-9][a-z0-9-]{1,79}" maxLength={80} placeholder="例如 chengdu"/></Field>
      <Field label="地点名称"><Input name="name" required maxLength={120}/></Field>
      <Field label="国家或地区代码（ISO 两位）"><Input name="countryCode" required pattern="[A-Za-z]{2}" maxLength={2} placeholder="CN"/></Field>
      <Field label="代表点精度"><Select name="precision" defaultValue="city"><option value="city">城市代表点</option><option value="region">省或区域代表点</option><option value="country">国家代表点</option></Select></Field>
      <Field label="省或区域"><Input name="region" maxLength={120}/></Field><Field label="城市"><Input name="city" maxLength={120}/></Field>
      <Field label="纬度（WGS84，-90 至90）"><Input name="lat" type="number" step="any" min={-90} max={90} required/></Field>
      <Field label="经度（WGS84，-180 至180）"><Input name="lon" type="number" step="any" min={-180} max={180} required/></Field>
      <Field label="坐标及行政实体的公开来源 HTTPS URL"><Input name="sourceUrl" type="url" required maxLength={2000}/></Field>
      <Field label="登记与核验理由"><Input name="reason" required minLength={4} maxLength={800}/></Field>
      <div><Button type="submit" disabled={busy}>登记地点</Button></div>
    </form>
  </details>;
}
export default function GeoReview({loaderData:d}:Route.ComponentProps) {
  const f=d.filters;
  const href=(page:number)=>{const sp=new URLSearchParams({status:f.status,page:String(page)});if(f.role)sp.set("role",f.role);if(f.q)sp.set("q",f.q);if(f.placeQ)sp.set("placeQ",f.placeQ);if(f.includeStale)sp.set("stale","1");return `/admin/geo?${sp}`;};
  return <AdminPage title="地点审核" subtitle="查看已有 AI 地理候选，核对原文后作出人工判断；这里不会调用模型，也不会自动批准。">
    <div className="space-y-4"><Card><Form method="get" className="flex flex-wrap items-end gap-3">
      <Field label="状态"><Select name="status" defaultValue={f.status}>{Object.entries(STATUSES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select></Field>
      <Field label="候选角色"><Select name="role" defaultValue={f.role??""}><option value="">全部角色</option>{Object.entries(ROLES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select></Field>
      <Field label="查找地名或新闻标题"><Input name="q" defaultValue={f.q} maxLength={120}/></Field>
      <Field label="缩小地点选项"><Input name="placeQ" defaultValue={f.placeQ} maxLength={120} placeholder="已登记地点名称或 ID"/></Field>
      <label className="flex items-center gap-2 text-[12px] text-ink-3"><input type="checkbox" name="stale" value="1" defaultChecked={f.includeStale}/>包含旧版本候选</label>
      <Button type="submit">筛选</Button>
    </Form><p className="mt-3 text-[12px] text-ink-4">{d.total} 条匹配候选 · 每页25条。{d.total>25000?"最多显示前25000条，请缩小筛选范围。":""}{d.placesTruncated?"地点选项超过500项，请用地点搜索缩小范围。":""}</p></Card>
    {d.rows.length?d.rows.map(row=><Candidate key={`${row.id}:${row.status}`} row={row} places={d.places}/>):<Empty>当前范围没有候选。尚无 AI 地理输出的文章不会凭空出现在这里；已有历史输出可先按离线回填流程恢复待审队列。</Empty>}
    <nav aria-label="地点审核分页" className="flex items-center justify-between gap-3 text-[13px] text-ink-3"><span>第 {d.page} / {d.pageCount} 页</span><div className="flex gap-4">{d.page>1&&<Link to={href(d.page-1)} className="text-accent">上一页</Link>}{d.page<d.pageCount&&<Link to={href(d.page+1)} className="text-accent">下一页</Link>}</div></nav>
    <NewPlace/></div>
  </AdminPage>;
}
