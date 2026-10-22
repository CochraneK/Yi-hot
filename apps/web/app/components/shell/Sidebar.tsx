import { SITE } from "@aihot/industry/site";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import stcLogo from "@aihot/industry/brand/save-the-children.svg?url&no-inline";
import { useChangelogSeen } from "../../lib/local-state";
import { SIDEBAR, tabIsActive, type NavItem } from "./nav";
import { ThemeSwitch } from "./ThemeSwitch";
import { Wordmark } from "../../components/Logo";
import { IconMail } from "../icons";

/** True while the changelog has an entry newer than the one this reader last opened. */
export function useChangelogDot(latestVersion: string | null): boolean {
  const seen = useChangelogSeen();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !latestVersion) return false;
  return !seen || seen < latestVersion;
}

function SideLink({ item, dot }: { item: NavItem; dot: boolean }) {
  const { pathname } = useLocation();
  // Weekly and monthly reports belong to the daily report entry, as the phone tab bar has it.
  const isActive = tabIsActive(item, pathname);
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      prefetch="intent"
      aria-current={isActive ? "page" : undefined}
      className={`flex h-10 items-center gap-2.5 rounded-control px-2.5 text-[14px] transition-colors duration-150 ${
        isActive ? "bg-accent/10 font-semibold text-ink dark:bg-accent-soft" : "font-medium text-ink-3 hover:bg-bg-sunk hover:text-ink"
      }`}
    >
      <span className={`flex w-[22px] shrink-0 justify-center ${isActive ? "text-accent" : ""}`}>
        <Icon size={17} />
      </span>
      <span className="min-w-0 truncate">{item.label}</span>
      {dot && item.changelog && <span className="ml-auto size-1.5 shrink-0 rounded-full bg-hot" aria-label="有新的更新" />}
    </Link>
  );
}

export function Sidebar({ changelogVersion }: { changelogVersion: string | null }) {
  const dot = useChangelogDot(changelogVersion);
  return (
    <aside className="sticky top-0 hidden h-dvh w-[180px] shrink-0 flex-col border-r border-line bg-sidebar px-3 pb-3.5 pt-6 lg:flex">
      <Link to="/all" className="mb-1 flex h-[74px] flex-col items-start justify-center gap-2 px-1" aria-label={`${SITE.name} 首页`}>
        <img src={stcLogo} alt="救助儿童会 Save the Children" className="h-7 w-auto max-w-[120px] rounded-md bg-white px-1.5 py-1 ring-1 ring-line-soft" />
        <Wordmark size={21} />
      </Link>
      <nav className="-mx-1 flex-1 overflow-y-auto px-1" aria-label="主导航">
        {SIDEBAR.map((section) => (
          <div key={section.title}>
            <div className="px-2.5 pb-1 pt-3.5 text-[11px] text-ink-4">{section.title}</div>
            <div className="flex flex-col gap-1">
              {section.items.map((item) => (
                <SideLink key={item.to} item={item} dot={dot} />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="mt-2 space-y-2.5 px-1 pt-1">
        {/* 手机上「订阅」常驻在品牌行右侧，桌面这一颗是它的对等入口。
            原先只是一行 11px 灰字压在侧栏最底部，读者基本看不见，所以改成和手机一致的实色按钮。 */}
        <Link
          to="/subscribe"
          className="flex h-9 items-center justify-center gap-1.5 rounded-control bg-accent text-[13px] font-medium text-accent-contrast transition-opacity hover:opacity-90"
        >
          <IconMail size={14} />
          订阅更新
        </Link>
        <a href="/feed.xml" className="block text-center text-[10.5px] text-ink-4 transition-colors hover:text-ink-3">
          或用 RSS 订阅
        </a>
        <ThemeSwitch className="mx-1" />
        {SITE.icp && (
          <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" className="block px-2 text-[10px] text-ink-4 hover:text-ink-3">
            {SITE.icp}
          </a>
        )}
      </div>
    </aside>
  );
}
