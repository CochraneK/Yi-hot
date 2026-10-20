import { redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/records";
import type { RegulatoryRecordsPage } from "@aihot/contracts/records";
import { apiGet } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { RecordsPage } from "../features/records/RecordsPage";

export async function loader({ params, request }: Route.LoaderArgs) {
  const sp = new URL(request.url).searchParams;
  const page = params.page ? Number(params.page) : 1;
  if (params.page !== undefined && (!/^\d+$/.test(params.page) || page < 1)) throw new Response("Not found", { status: 404 });
  if (params.page === "1") throw redirect("/records", 308);
  sp.set("page", String(Math.min(page, 500)));
  const data = await apiGet<RegulatoryRecordsPage>(`/api/site/records?${sp.toString()}`, { signal: request.signal });
  return { data };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const page = loaderData?.data.page ?? 1;
  const total = loaderData?.data.stats.total ?? 0;
  return pageMeta({
    title: page > 1 ? `监管记录 · 第 ${page} 页` : "监管记录",
    description: total
      ? `民政部行政处罚与全国社会组织活动异常名录、严重违法失信名单公告，已汇集 ${total} 条，每天同步一次。`
      : "民政部行政处罚与全国社会组织活动异常名录、严重违法失信名单公告，每天同步一次。",
    path: page > 1 ? `/records/page/${page}` : "/records",
    image: "/og/pages/records.png",
    noindex: page > 1,
  });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" };
}

export default function RecordsRoute() {
  const { data } = useLoaderData<typeof loader>();
  return <RecordsPage data={data} />;
}
