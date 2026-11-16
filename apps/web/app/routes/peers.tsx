import { useLoaderData } from "react-router";
import type { Route } from "./+types/peers";
import type { PeerDirectory } from "@aihot/contracts/peers";
import { FEATURES } from "@aihot/industry/features";
import { apiGet } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { PeerDirectoryPage } from "../features/peers/PeerDirectoryPage";

/** Shared caches may keep this page for five minutes. */
export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" };
}

export async function loader({ request }: Route.LoaderArgs) {
  if (!FEATURES.peerDirectory) throw new Response("Not found", { status: 404 });
  // 目录页不该因为一家站挂了就整页 500：接口异常时按空目录渲染，页脚仍然给出说明。
  const data = await apiGet<PeerDirectory>("/api/site/peers", { signal: request.signal }).catch(
    (): PeerDirectory => ({ sites: [], totalItems: 0, updatedAt: null }),
  );
  return { data };
}

export function meta() {
  return pageMeta({
    title: "邻域",
    description: "按领域浏览独立信息聚合站：候选与正式站按主题展示，点击站名查看原站，点最新条目阅读原文。",
    path: "/peers",
  });
}

export default function PeersRoute() {
  const { data } = useLoaderData<typeof loader>();
  return <PeerDirectoryPage data={data} />;
}
