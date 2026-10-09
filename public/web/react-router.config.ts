import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  appDirectory: "app",
  buildDirectory: "build",
  // The site lives under /yihot so the host can carry other projects; the web server 301s the bare
  // root and any old unprefixed path here. Trailing slash: React Router's stripBasename handles it,
  // and it keeps the dev-server base check (basename must begin with base) green.
  basename: "/yihot/",
  // The whole route manifest ships with the page: no /__manifest?paths=… requests, whose answers are
  // cacheable for a year while a CDN's page cache would not key them on paths or version.
  routeDiscovery: { mode: "initial" },
} satisfies Config;
