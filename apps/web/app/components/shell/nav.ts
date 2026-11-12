// Site navigation, one place for the desktop sidebar, the mobile tab bar and the mobile "更多" page.
import { FEATURES } from "@aihot/industry/features";
import type { ReactNode } from "react";
import {
  IconBolt, IconBookmark, IconChart, IconDoc, IconGrid, IconHeart, IconHistory, IconList, IconMenu, IconMessage, IconPlug, IconShield,
} from "../icons";

export interface NavItem {
  to: string;
  label: string;
  icon: (p: { size?: number }) => ReactNode;
  /** Match the path exactly (the home page). */
  end?: boolean;
  /** Shows the unread dot while the changelog has news. */
  changelog?: boolean;
}

export const SIDEBAR: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "内容",
    items: [
      { to: "/weekly", label: "总报", icon: IconDoc },
      ...(FEATURES.selectedFeed ? [{ to: "/", label: "精选", icon: IconBolt, end: true }] : []),
      { to: "/all", label: "动态", icon: IconList },
      { to: "/topics", label: "主题", icon: IconGrid },
      ...(FEATURES.regulatoryRecords ? [{ to: "/records", label: "资料", icon: IconShield }] : []),
    ],
  },
  // The optional AI-only modules (industry/features.ts).
  ...(FEATURES.leaderboard || FEATURES.codexResetMonitor
    ? [
        {
          title: "模型",
          items: [
            ...(FEATURES.leaderboard ? [{ to: "/leaderboard", label: "模型榜", icon: IconChart }] : []),
            ...(FEATURES.codexResetMonitor ? [{ to: "/codex-reset", label: "Tibo重置监控", icon: IconHistory }] : []),
          ],
        },
      ]
    : []),
  {
    title: "我的",
    items: [
      { to: "/starred", label: "收藏", icon: IconBookmark },
      { to: "/more", label: "更多", icon: IconMenu, changelog: true },
    ],
  },
];

// 手机底栏固定四项；热点归入动态，资料和收藏从「更多」进入。
export const TABBAR: NavItem[] = [
  { to: "/weekly", label: "总报", icon: IconDoc },
  { to: "/all", label: "动态", icon: IconList },
  { to: "/topics", label: "主题", icon: IconGrid },
  { to: "/more", label: "更多", icon: IconMenu, changelog: true },
];

/** Shared by the More page; service links no longer expand the desktop sidebar. */
export const MORE_ITEMS: NavItem[] = [
  ...(FEATURES.regulatoryRecords ? [{ to: "/records", label: "资料", icon: IconShield }] : []),
  { to: "/starred", label: "收藏", icon: IconBookmark },
  { to: "/agent", label: "接入", icon: IconPlug },
  { to: "/about", label: "关于", icon: IconHeart },
  { to: "/changelog", label: "更新", icon: IconHistory, changelog: true },
  { to: "/feedback", label: "意见反馈", icon: IconMessage },
  ...(FEATURES.leaderboard ? [{ to: "/leaderboard", label: "模型榜", icon: IconChart }] : []),
  ...(FEATURES.codexResetMonitor ? [{ to: "/codex-reset", label: "Tibo重置监控", icon: IconHistory }] : []),
];

export const MORE_PATHS = ["/more", ...MORE_ITEMS.map((item) => item.to), "/terms", "/privacy", "/subscribe"];

export function tabIsActive(item: NavItem, pathname: string, surface: "mobile" | "desktop" = "mobile"): boolean {
  if (item.end) return pathname === item.to;
  if (item.to === "/more") {
    if (surface === "desktop" && SIDEBAR.some((section) => section.items.some((other) => other.to !== "/more" && tabIsActive(other, pathname)))) return false;
    return MORE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }
  if (item.to === "/weekly") return /^\/(daily|weekly|monthly)(\/|$)/.test(pathname);
  if (item.to === "/all" && (pathname === "/hot" || pathname.startsWith("/hot/"))) return true;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}
