import { SITE } from "@aihot/industry/site";
import { FEATURES } from "@aihot/industry/features";
import type { ReactNode } from "react";
import { Link, useRouteLoaderData } from "react-router";
import type { loader as rootLoader } from "../root";
import { useChangelogDot } from "../components/shell/Sidebar";
import { pageMeta } from "../lib/seo";
import { ThemeSwitch } from "../components/shell/ThemeSwitch";
import { IconBookmark, IconChart, IconChevronRight, IconFlame, IconGrid, IconHeart, IconHistory, IconMail, IconMessage, IconMoon, IconPlug, IconShield } from "../components/icons";

/** Shared caches may keep this page for five minutes. */
export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" };
}

export function meta() {
  return pageMeta({ title: "更多", path: "/more", noindex: true });
}

type Row = { to: string; label: string; icon: ReactNode };

const GROUPS: Array<{ title: string; rows: Row[] }> = [
  {
    title: "内容",
    rows: [
      { to: "/topics", label: "主题索引", icon: <IconGrid size={18} /> },
      ...(FEATURES.regulatoryRecords ? [{ to: "/records", label: "监管", icon: <IconShield size={18} /> }] : []),
      ...(FEATURES.leaderboard ? [{ to: "/leaderboard", label: "模型榜", icon: <IconChart size={18} /> }] : []),
      ...(FEATURES.codexResetMonitor ? [{ to: "/codex-reset", label: "Tibo重置监控", icon: <IconHistory size={18} /> }] : []),
      { to: "/agent", label: "Agent", icon: <IconPlug size={18} /> },
    ],
  },
  {
    title: "偏好",
    rows: [
      { to: "/hot", label: "热点", icon: <IconFlame size={18} /> },
      { to: "/starred", label: "收藏", icon: <IconBookmark size={18} /> },
    ],
  },
  {
    title: "关于",
    rows: [
      { to: "/about", label: `关于 ${SITE.name}`, icon: <IconHeart size={18} /> },
      { to: "/changelog", label: "更新", icon: <IconHistory size={18} /> },
      { to: "/feedback", label: "意见反馈", icon: <IconMessage size={18} /> },
    ],
  },
];

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <div className="px-4 pb-1 pt-3 text-[11.5px] text-ink-4">{title}</div>
      <ul className="divide-y divide-line-soft">{children}</ul>
    </section>
  );
}

export default function MorePage() {
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const changelogDot = useChangelogDot(root?.changelogVersion ?? null);
  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-8">
      <h1 className="pb-4 pt-5 text-[22px] font-bold text-ink lg:pt-1">更多</h1>
      {/* 订阅入口：不单独占一个导航模块，而是置顶在「更多」页——手机和桌面都能一眼看到，
          又不会挤进侧栏「内容」分组。底部页脚另有「邮件订阅 / RSS」常驻链接。 */}
      <Link to="/subscribe" className="card mb-3 flex items-center gap-3 p-4 transition-colors active:bg-bg-sunk hover:bg-bg-sunk">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-contrast"><IconMail size={20} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">订阅公益总报</span>
          <span className="block truncate text-[12.5px] text-ink-3">日报、周报、月报直接发到邮箱</span>
        </span>
        <IconChevronRight size={16} className="shrink-0 text-ink-4" />
      </Link>
      <div className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0 2xl:grid-cols-3">
        {GROUPS.map((g) => (
          <Group key={g.title} title={g.title}>
            {g.rows.map((r) => (
              <li key={r.to}>
                <Link to={r.to} className="flex h-[50px] items-center gap-3 px-4 text-[15px] font-medium text-ink transition-colors active:bg-bg-sunk lg:hover:bg-bg-sunk">
                  <span className="text-ink-3">{r.icon}</span>
                  <span className="flex flex-1 items-center gap-2">{r.label}{r.to === "/changelog" && changelogDot && <span className="size-1.5 rounded-full bg-hot" aria-label="有新的更新" />}</span>
                  <IconChevronRight size={16} className="text-ink-4" />
                </Link>
              </li>
            ))}
            {g.title === "偏好" && (
              <li className="flex h-[58px] items-center gap-3 px-4 text-[15px] font-medium text-ink">
                <span className="text-ink-3">
                  <IconMoon size={18} />
                </span>
                <span className="flex-1">外观</span>
                <ThemeSwitch className="w-[124px]" />
              </li>
            )}
          </Group>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[12px] text-ink-4">
        <Link to="/subscribe" className="hover:text-ink-2">邮件订阅</Link>
        <a href="/feed.xml" className="hover:text-ink-2">RSS</a>
        <Link to="/terms" className="hover:text-ink-2">使用规则</Link>
        <Link to="/privacy" className="hover:text-ink-2">隐私说明</Link>
        {SITE.icp && <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" className="hover:text-ink-2">{SITE.icp}</a>}
      </div>
    </div>
  );
}
