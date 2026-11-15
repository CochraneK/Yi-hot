// 公开机器接口的额度表。放在 contracts 而不是 api 里，是因为 /llms.txt 要念出同一组数字：
// 「说明书说一套、执行是另一套」上一轮在爬虫名单上已经踩过——robots 声明禁止 ChatGPT-User，
// 而 llms.txt 正在请它来读。额度同理，写错不会报错，只会让照着文档写代码的人撞墙。

export interface RateRule {
  /** 计数分档名，也是 429 文案里的主语。 */
  readonly scope: string;
  /** 一个窗口内允许的请求数。 */
  readonly limit: number;
  readonly windowMs: number;
}

export interface RateLimitEntry {
  /** 文档里展示的路径写法。 */
  readonly path: string;
  readonly test: (pathname: string) => boolean;
  readonly rule: RateRule;
}

const MINUTE = 60_000;

/**
 * 分档而不是一刀切：MCP 每次调用可能触发一次搜索，markdown 会导出整篇正文，两者都比读一页
 * 列表重得多。feed 与 sitemap 的读者是爬虫与 RSS 客户端，刷新有节律，给得比列表紧一点。
 * 额度按「一个正常的自动化调用方用不完、一台机器狂抓会撞墙」定，不是防 DDoS——那要靠上游。
 */
export const RATE_LIMITS: readonly RateLimitEntry[] = [
  { path: "/api/v1/*", test: (p) => p === "/api/v1" || p.startsWith("/api/v1/"), rule: { scope: "API", limit: 180, windowMs: MINUTE } },
  { path: "/api/mcp", test: (p) => p === "/api/mcp" || p === "/api/mcp/", rule: { scope: "MCP", limit: 60, windowMs: MINUTE } },
  { path: "/feed/* 与 /sitemap.xml", test: (p) => p === "/feed.xml" || p.startsWith("/feed/") || p === "/sitemap.xml", rule: { scope: "feed", limit: 60, windowMs: MINUTE } },
  { path: "/items/{id}/markdown", test: (p) => /^\/items\/[^/]+\/markdown$/.test(p), rule: { scope: "markdown", limit: 30, windowMs: MINUTE } },
];

export function rateRuleFor(pathname: string): RateRule | null {
  for (const entry of RATE_LIMITS) if (entry.test(pathname)) return entry.rule;
  return null;
}

/** 给 /llms.txt 用：一行一档，数字直接来自上面的表。 */
export function rateLimitSummary(): string[] {
  return RATE_LIMITS.map(
    (entry) => `- \`${entry.path}\` 每分钟 ${entry.rule.limit} 次（滑动窗口，按来源地址计）`,
  );
}
