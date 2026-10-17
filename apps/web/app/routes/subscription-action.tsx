import { useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { IconCheck } from "../components/icons";
import { RingMark } from "../components/Logo";
import { ReadingLayout } from "../components/ui/Page";
import { pageMeta } from "../lib/seo";

export function meta() { return pageMeta({ title: "管理邮件订阅", path: "/subscribe", noindex: true }); }
export function headers() { return { "Cache-Control": "no-store" }; }

export default function SubscriptionActionPage() {
  const { pathname } = useLocation(); const [params] = useSearchParams();
  const confirm = pathname.endsWith("/confirm");
  const [state, setState] = useState<"idle"|"sending"|"done"|"error">("idle");
  const act = async () => {
    setState("sending");
    try {
      const response = await fetch(`/api/site/newsletter/${confirm ? "confirm" : "unsubscribe"}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: params.get("token") ?? "" }) });
      const data = await response.json().catch(()=>({}));
      setState(response.ok && data.ok ? "done" : "error");
    } catch { setState("error"); }
  };
  return <ReadingLayout><div className="card px-6 py-14 text-center">
    {state === "done" ? <><div className="mx-auto grid size-12 place-items-center rounded-full bg-accent text-accent-contrast"><IconCheck size={24}/></div><h1 className="mt-5 text-[21px] font-semibold">{confirm ? "订阅已确认" : "已经退订"}</h1><p className="mt-2 text-[14px] text-ink-3">{confirm ? "下一期公益总报发布后会发送到你的邮箱。" : "该地址不会再收到公益总报。以后仍可重新订阅。"}</p></> : <><h1 className="text-[21px] font-semibold">{confirm ? "确认邮件订阅" : "退订公益总报"}</h1><p className="mx-auto mt-2 max-w-sm text-[14px] leading-7 text-ink-3">{state === "error" ? "链接无效、已经使用或已过期。" : confirm ? "确认后才会开始接收你选择的周报、月报。" : "确认后会立即停止后续邮件。"}</p><button onClick={act} disabled={state === "sending"} className={`mt-6 inline-flex h-10 items-center gap-2 rounded-full px-6 text-[14px] font-medium ${confirm ? "bg-accent text-accent-contrast" : "bg-hot text-white"}`}>{state === "sending" && <RingMark className="size-4" spinning/>}{confirm ? "确认订阅" : "确认退订"}</button></>}
    <div className="mt-7"><Link to="/" className="text-[13px] text-accent hover:underline">返回 Yi-Hot</Link></div>
  </div></ReadingLayout>;
}
