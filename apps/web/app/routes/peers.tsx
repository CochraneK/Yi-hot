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
    description: "同系邻域与其他邻域：跨行业信息站、科研数据库和公共资源入口，按方向浏览，点标题直达原站。",
    path: "/peers",
  });
}

export default function PeersRoute() {
  const { data } = useLoaderData<typeof loader>();
  return <PeerDirectoryPage data={data} />;
}
