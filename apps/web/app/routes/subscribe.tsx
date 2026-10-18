import { useState } from "react";
import { Link } from "react-router";
import { SITE } from "@aihot/industry/site";
import { RingMark } from "../components/Logo";
import { IconCheck } from "../components/icons";
import { ReadingLayout, AsideCard } from "../components/ui/Page";
import { pageMeta } from "../lib/seo";

export function meta() { return pageMeta({ title: "邮件订阅", description: "订阅 Yi-Hot 公益周报与月报。", path: "/subscribe", noindex: true }); }
export function headers() { return { "Cache-Control": "public, max-age=0, s-maxage=300" }; }

export default function SubscribePage() {
  const [email, setEmail] = useState("");
  const [weekly, setWeekly] = useState(true);
  const [monthly, setMonthly] = useState(true);
  const [daily, setDaily] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setState("sending"); setMessage("");
    try {
      const response = await fetch("/api/site/newsletter/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, weekly, monthly, daily }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setState("error"); setMessage(data.detail ?? "提交失败，请稍后再试。"); return; }
      setState("done"); setMessage(data.state === "active" ? "订阅偏好已更新。" : "确认邮件已经发出，请在 48 小时内点击邮件中的确认链接。");
    } catch { setState("error"); setMessage("网络暂时不可用，请稍后再试。"); }
  };
  const field = "w-full rounded-card bg-bg-sunk px-4 text-ink outline-none ring-1 ring-inset ring-line-soft focus:bg-surface focus:ring-accent";
  return <ReadingLayout aside={<AsideCard title="发送规则"><p className="text-[13px] leading-7 text-ink-3">只有完成邮件确认后才会发送。每封邮件都带有一键退订入口；连续退信会自动停发。</p></AsideCard>}>
    <header><h1 className="text-[24px] font-semibold text-ink">订阅公益总报</h1><p className="mt-2 text-[14px] leading-7 text-ink-3">把 {SITE.name} 已发布的日报、周报、月报发送到你的邮箱。邮件与网站内容一致，不额外生成另一份简报。</p></header>
    {state === "done" ? <div className="card mt-6 px-6 py-12 text-center"><div className="mx-auto grid size-12 place-items-center rounded-full bg-accent text-accent-contrast"><IconCheck size={24}/></div><h2 className="mt-5 text-[19px] font-semibold">请查看邮箱</h2><p className="mt-2 text-[14px] leading-7 text-ink-3">{message}</p></div> :
    <form onSubmit={submit} className="card mt-6 space-y-5 p-5 sm:p-6">
      <div><label htmlFor="subscription-email" className="mb-2 block text-[13px] font-semibold">邮箱</label><input id="subscription-email" type="email" required maxLength={254} value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="name@example.com" className={`${field} h-11`}/></div>
      <fieldset><legend className="mb-2 text-[13px] font-semibold">接收内容</legend><div className="flex flex-wrap gap-4 text-[14px] text-ink-2"><label className="flex items-center gap-2"><input type="checkbox" checked={daily} onChange={(e)=>setDaily(e.target.checked)}/>公益日报</label><label className="flex items-center gap-2"><input type="checkbox" checked={weekly} onChange={(e)=>setWeekly(e.target.checked)}/>公益周报</label><label className="flex items-center gap-2"><input type="checkbox" checked={monthly} onChange={(e)=>setMonthly(e.target.checked)}/>公益月报</label></div></fieldset>
      {state === "error" && <p role="alert" className="rounded-tile bg-hot-soft px-3.5 py-2.5 text-[13px] text-hot">{message}</p>}
      <button type="submit" disabled={state === "sending" || !email || (!daily && !weekly && !monthly)} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-accent px-6 text-[14px] font-medium text-accent-contrast disabled:opacity-45">{state === "sending" && <RingMark className="size-4" spinning/>}发送确认邮件</button>
      <p className="text-[12px] leading-6 text-ink-4">提交表示你同意按所选频率接收公益总报，并知悉邮箱地址将按<Link to="/privacy" className="text-accent hover:underline">隐私说明</Link>处理。未确认的地址不会收到总报。</p>
    </form>}
  </ReadingLayout>;
}
