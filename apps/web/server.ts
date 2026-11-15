// Production web server: built client assets, the shared redirect table and SSR. Api-owned paths are
// proxied to the api process, so one port serves the whole site; a reverse proxy in front may also send
// them to the api directly.
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequestListener } from "@react-router/node";
import { isApiOwned, resolveRedirect } from "@aihot/contracts/http-policy";
import { botBlocked } from "@aihot/contracts/bot-policy";
import { isPrivateAddress, lastForwardedAddress } from "@aihot/contracts/net";

const PORT = Number(process.env.WEB_PORT || process.env.PORT || 3000);
const HOST = process.env.WEB_HOST || "127.0.0.1";
const API = new URL(process.env.API_BASE_URL || "http://127.0.0.1:3001");
/**
 * Whether a reverse proxy in front (Caddy, nginx) records the visitor in X-Forwarded-For.
 * Turning it on is necessary but not sufficient: the header is only read when the TCP peer itself
 * is local or on the container network. A public visitor who writes the header by hand is ignored,
 * so per-address accounting in the api (sign-in attempts, feedback, rate limits) cannot be spoofed.
 */
const TRUST_PROXY = process.env.TRUST_PROXY === "true";
const CLIENT_DIR = path.resolve(import.meta.dirname, "build/client");
/** Browsers keep a page at most this long, so a withdrawal reaches them within minutes. */
const BROWSER_MAX_SECONDS = 300;

const TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
  ".map": "application/json",
};

// Windows: an absolute path passed to import() is parsed as a URL ("d:" scheme) and fails;
// a file:// URL works on every platform.
const build = await import(pathToFileURL(path.resolve(import.meta.dirname, "build/server/index.js")).href);
const ssr = createRequestListener({ build, mode: "production" });

class BadRequest extends Error {}

/** Hashed build assets are immutable; anything else from the client build gets a short cache. */
async function serveStatic(pathname: string, res: import("node:http").ServerResponse): Promise<boolean> {
  if (pathname.includes("..") || pathname.endsWith("/")) return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    throw new BadRequest("malformed percent-encoding");
  }
  const file = path.join(CLIENT_DIR, decoded);
  if (!file.startsWith(CLIENT_DIR)) return false;
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return false;
  const immutable = pathname.startsWith("/assets/");
  res.writeHead(200, {
    "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
    "Content-Length": info.size,
    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });
  createReadStream(file).pipe(res);
  return true;
}

/** The root path is a multi-project portal page, shipped in the source tree next to this server. */
const PORTAL_FILE = path.join(import.meta.dirname, "portal.html");

/**
 * 门户页的图标：深绿底 + 白色拱门（「入口」的图形化）。内联而不是单独放文件，
 * 是为了让 80（本服务）与 443（Caddy 兜底反代到这里）共用同一份字节，
 * 不会再出现「改了容器里的文件、忘了宿主那份」这种分叉。
 */
const PORTAL_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  '<rect width="64" height="64" rx="14" fill="#2f6f4f"/>' +
  '<path d="M18 46V30a14 14 0 0 1 28 0v16h-9V30a5 5 0 0 0-10 0v16z" fill="#fff"/></svg>';

async function servePortal(res: import("node:http").ServerResponse): Promise<boolean> {
  const info = await stat(PORTAL_FILE).catch(() => null);
  if (!info?.isFile()) return false;
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": info.size,
    "Cache-Control": "public, max-age=300",
    "X-Content-Type-Options": "nosniff",
  });
  createReadStream(PORTAL_FILE).pipe(res);
  return true;
}

/**
 * 对外交付的文档（交接说明、使用指南等）：不进任何导航，只凭链接访问。
 * 抓取与索引一律谢绝——noindex 让搜索引擎不收录，no-referrer 让被转走的页面查不到来源。
 * 文件名即链接，只接受小写字母/数字/连字符，杜绝路径穿越与大小写歧义。
 */
const DOCS_DIR = path.join(import.meta.dirname, "docs-public");

async function serveDoc(internal: string, res: import("node:http").ServerResponse): Promise<boolean> {
  if (!internal.startsWith("/doc/")) return false;
  const name = internal.slice("/doc/".length);
  if (!/^[a-z0-9][a-z0-9-]{0,63}\.html$/.test(name)) return false;
  const file = path.join(DOCS_DIR, name);
  if (!file.startsWith(DOCS_DIR + path.sep)) return false;
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return false;
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": info.size,
    "Cache-Control": "private, max-age=300",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  createReadStream(file).pipe(res);
  return true;
}

// One bad request must never take the process down: answer it and keep serving.
const server = createServer((req, res) => {
  handle(req, res).catch((error: unknown) => {
    const bad = error instanceof BadRequest || error instanceof URIError;
    if (!bad) console.error(JSON.stringify({ level: "error", msg: "web request failed", path: (req.url ?? "").split("?")[0]!.slice(0, 200), error: String(error).slice(0, 500) }));
    if (res.headersSent) return res.destroy();
    res.writeHead(bad ? 400 : 500, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end(bad ? "Bad request" : "Internal error");
  });
});

/** Public navigation returns all matched loaders, so `_routes` never changes a cached answer. */
function pageCache(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) {
  const url = new URL(req.url ?? "/", "http://web.local");
  const pathname = decodeURIComponent(url.pathname).replace(/\.data$/, "");
  const publicRead = (req.method === "GET" || req.method === "HEAD") && !/^\/(?:yihot\/)?admin(?:\/|$)/i.test(pathname);
  if (publicRead && url.pathname.endsWith(".data")) {
    url.searchParams.delete("_routes");
    req.url = url.pathname + url.search;
  }

  // React Router uses the same route headers for HTML and single-fetch data. Apply the final
  // status here: a route's successful cache policy must never cache its error or action result.
  const writeHead = res.writeHead.bind(res);
  res.writeHead = ((status: number, messageOrHeaders?: string | import("node:http").OutgoingHttpHeaders, headers?: import("node:http").OutgoingHttpHeaders) => {
    const outgoing = typeof messageOrHeaders === "string" ? headers : messageOrHeaders;
    for (const [name, value] of Object.entries(outgoing ?? {})) if (value !== undefined) res.setHeader(name, value);
    const cc = String(res.getHeader("Cache-Control") ?? "");
    if (!publicRead || status !== 200 || res.hasHeader("Set-Cookie") || !cc || /(?:private|no-store)/i.test(cc)) {
      res.removeHeader("Expires");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Accel-Expires", "0");
    } else {
      const now = new Date();
      const nowSeconds = Math.floor(now.getTime() / 1000);
      const sharedSeconds = Number(cc.match(/(?:^|,)\s*s-maxage=(\d+)/i)?.[1] ?? 0);
      const expires = String(res.getHeader("X-Accel-Expires") ?? `@${nowSeconds + sharedSeconds}`);
      // A sibling loader may have delayed this response after the selected loader set its TTL.
      const seconds = /(?:^|,)\s*no-cache(?:,|$)/i.test(cc) || expires === "0" ? 0
        : Math.max(0, Math.min(sharedSeconds, Number(expires.slice(1)) - nowSeconds));
      res.setHeader("Date", now.toUTCString());
      res.setHeader("X-Accel-Expires", seconds > 0 ? expires : "0");
      // Reuse intent-prefetched data in the browser within the same shared-cache deadline (capped).
      // Never serve it beyond that deadline, including while revalidating or on an error.
      const directives = cc.split(",").map((value) => value.trim()).filter((value) => !/^(?:max-age|s-maxage|stale-while-revalidate|stale-if-error|must-revalidate)(?:=|$)/i.test(value));
      res.setHeader("Cache-Control", seconds > 0
        ? `${directives.join(", ")}, max-age=${Math.min(seconds, BROWSER_MAX_SECONDS)}, s-maxage=${seconds}, must-revalidate`
        : "no-cache");
    }
    return typeof messageOrHeaders === "string" ? writeHead(status, messageOrHeaders) : writeHead(status);
  }) as typeof res.writeHead;
}

/** The app lives under this prefix so the host can carry other projects. */
const PREFIX = "/yihot";

/**
 * 爬虫名单与判定在 @aihot/contracts/bot-policy：robots.txt 的声明和这里的 403 读同一份，
 * 两边不会再各写一遍然后对不上（上一版把 ChatGPT-User 也拒了，而 llms.txt 正在邀请 Agent 来读）。
 * 常规搜索引擎（Googlebot / Bingbot / Baiduspider）不在名单里，照常收录。
 */

/** Optional second app on the same public IP, via an isolated Docker-only network.
 * Never expose the FutureMe container directly or reuse the YiHot API namespace.
 * Only a container DNS name on port 8766 is accepted (no arbitrary remote proxy).
 */
const FUTUREME_UPSTREAM = (() => {
  const value = (process.env.FUTUREME_UPSTREAM_URL ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" || url.port !== "8766" || url.username || url.password ||
        url.pathname !== "/" || url.search || url.hash ||
        !/^[a-z][a-z0-9-]{0,62}$/.test(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
})();

async function handle(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) {
  const raw = req.url ?? "/";
  const qi = raw.indexOf("?");
  const pathname = qi >= 0 ? raw.slice(0, qi) : raw;
  const search = qi >= 0 ? raw.slice(qi) : "";

  // 安全响应头：让 80 与 443 拿到同一份。此前只有 443 的 Caddy 补过三个头，而 canonical 现在
  // 写的正是 http——走 80 就一个都没有。
  //
  // 但这里必须分路：443 的 Caddy（/home/ubuntu/futureme 的 Caddyfile）用的是追加语义，不是覆盖，
  // 应用再设一遍就成了 "nosniff, nosniff"——浏览器按整串比较，等于把这条规则废掉。实测如此。
  // 所以 TLS 边缘来的请求交给 Caddy，直连 80 的由这里补；取值与它逐字一致。
  // 哪天想让应用当唯一来源，在那边 header 前加 `?`（仅当不存在时才设）即可。
  const viaTlsEdge = String(req.headers["x-forwarded-proto"] ?? "").toLowerCase() === "https";
  if (!viaTlsEdge) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(self)");
  }
  // Caddy 不管这两个，两条路都从这里出，不会重复。
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'self'");

  // What the app sees: the path with the prefix stripped. Api-owned resources (api/, feed, icons,
  // sitemaps) stay reachable at the root too — browser fetches and api-generated absolute links hit
  // them there — so they are matched before anything below is moved under the prefix.
  const prefixed = pathname === PREFIX || pathname.startsWith(PREFIX + "/");
  const internal = prefixed ? (pathname.slice(PREFIX.length) || "/") : pathname;
  /** 机器接口：API、feed、llms.txt、openapi、sitemap。检索型爬虫只在这里放行。 */
  const agentSurface = isApiOwned(internal);

  // 反训练的第二个信号：robots 是「请别来」，这个是「来了也别当训练语料」。只落在页面上——
  // 接口本来就是给 Agent 用的，给 JSON 贴 noai 只会自相矛盾。
  if (!agentSurface) res.setHeader("X-Robots-Tag", "noai, noimageai");

  // 反爬：在请求进入路由 / 代理之前拦截。robots.txt 对所有 UA 放行，否则对方读不到「不许来」这句声明本身。
  const ua = req.headers["user-agent"] ?? "";
  if (internal !== "/robots.txt" && botBlocked(ua, agentSurface)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end("Access denied");
    return;
  }

  // 「项目入口」的图标。门户页（portal.html）声明它，443 上的 Caddy 不单独接管，
  // 让这条路径落到兜底反代——80 与 443 于是共用这一份，不会出现两边不一致。
  if (pathname === "/portal-icon.svg") {
    res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" });
    return res.end(PORTAL_ICON);
  }

  // 根路径的 tab 图标不属于任何子站。这台机器的根是「项目入口」门户，而 /futureme/
  // 也由本服务反代（80 直连、443 经 Caddy 兜底转进来，规则只此一份）。浏览器给
  // 「页面没声明图标」的情况自动请求根 /favicon.ico —— 此前它返回本项目的徽章，
  // 于是门户和 FutureMe 的标签页都挂上了 Yi-Hot 的标。回 204 让它们用浏览器默认图标。
  // 本项目自己的图标已改走 /yihot/ 前缀（见 root.tsx），不受影响。
  if (pathname === "/favicon.ico" || pathname === "/apple-touch-icon.png" || pathname === "/apple-touch-icon-precomposed.png") {
    res.writeHead(204, { "Cache-Control": "public, max-age=3600" });
    return res.end();
  }

  if (pathname === "/") {
    // The bare root is the multi-project portal page; fall back to the old redirect if it is gone.
    if (await servePortal(res)) return;
    res.writeHead(301, { Location: PREFIX + "/", "Cache-Control": "public, max-age=86400" });
    return res.end();
  }
  if (pathname === PREFIX) {
    res.writeHead(301, { Location: PREFIX + "/", "Cache-Control": "public, max-age=86400" });
    return res.end();
  }

  // A public portal card links to /futureme/; the apps stay in separate containers.
  // Prefix is stripped only for FutureYou, keeping its /api/* off YiHot's API router.
  if (pathname === "/futureme") {
    res.writeHead(308, { Location: "/futureme/" + search, "Cache-Control": "no-store" });
    return res.end();
  }
  if (pathname.startsWith("/futureme/")) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    // Even without a domain, microphone/camera are only safe on a trusted HTTPS
    // origin (the IP can later get its own certificate). Never claim HTTP is secure.
    if (!FUTUREME_UPSTREAM) {
      res.writeHead(503, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FutureMe · 接入中</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f6f2;color:#201f1b;font-family:system-ui,"PingFang SC",sans-serif}main{max-width:420px;padding:32px}h1{font-size:24px}p{color:#6d6a60;line-height:1.8}a{color:#2f6f4f;text-decoration:none}</style><main><h1>FutureMe 正在接入</h1><p>独立服务尚未准备好。可以先体验 YiHot；FutureMe 联通后会自动从这个入口打开。</p><a href="/">← 返回项目入口</a></main></html>`);
    }
    const clientIp = req.socket.remoteAddress ?? "unknown";
    const proxyPath = pathname.slice("/futureme".length) + search;
    // The visitor cannot override the upstream Host or trusted client address.
    const { host: _host, connection: _connection, ...headers } = req.headers;
    headers["host"] = FUTUREME_UPSTREAM.host;
    headers["x-real-ip"] = clientIp;
    headers["x-forwarded-for"] = clientIp;
    headers["x-forwarded-proto"] = "http"; // TLS edge will set this after IP HTTPS is configured.
    const upstream = httpRequest({
      hostname: FUTUREME_UPSTREAM.hostname,
      port: FUTUREME_UPSTREAM.port,
      path: proxyPath,
      method: req.method,
      headers,
      timeout: 120_000,
    }, (up) => {
      // Keep admin's WWW-Authenticate, cookies and response codes intact.
      const { connection: _upConn, ...responseHeaders } = up.headers;
      res.writeHead(up.statusCode ?? 502, {
        ...responseHeaders,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      });
      up.pipe(res);
    });
    upstream.on("timeout", () => upstream.destroy(new Error("FutureMe upstream timed out")));
    upstream.on("error", () => {
      if (res.headersSent) return res.destroy();
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      res.end("FutureMe temporarily unavailable");
    });
    req.pipe(upstream);
    return;
  }

  // 交付文档没有导航入口，也不属于旧布局：在重定向表之前拦下，避免被当成历史路径挪走。
  if ((req.method === "GET" || req.method === "HEAD") && (await serveDoc(internal, res))) return;

  const decision = resolveRedirect(internal, search);
  if (decision) {
    for (const [k, v] of Object.entries(decision.headers)) res.setHeader(k, v);
    // Redirect locations in the shared table are root-anchored; point them back under the prefix.
    if (decision.location) res.setHeader("Location", decision.location.startsWith("/") ? PREFIX + decision.location : decision.location);
    res.statusCode = decision.status;
    return res.end(decision.location ? undefined : decision.status === 410 ? "Gone" : "Not found");
  }

  if (isApiOwned(internal)) {
    // 访客地址在这里裁定。TRUST_PROXY 打开只说明「前面可能有反代」，不等于任何来源的
    // X-Forwarded-For 都可信：只有当连接本身来自本机 / 容器网段（Caddy 经 docker-proxy 进来
    // 就是这个形态）时才采纳它的最后一跳，其余一律用 TCP 源地址。否则任何人加一个请求头
    // 就能自称另一个地址，api 那边按地址记账的限流会整体失效——而失效是静默的，不会报错。
    const peer = req.socket.remoteAddress ?? "";
    const forwarded = lastForwardedAddress(req.headers["x-forwarded-for"]);
    const client = TRUST_PROXY && isPrivateAddress(peer) && forwarded ? forwarded : peer;
    const headers = { ...req.headers, "x-forwarded-for": client, "x-real-ip": client };
    const upstream = httpRequest({ hostname: API.hostname, port: API.port, path: internal + search, method: req.method, headers }, (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    });
    upstream.on("error", () => {
      res.statusCode = 502;
      res.end("api unavailable");
    });
    return req.pipe(upstream);
  }

  // Unprefixed paths that are not api resources are the old site layout (or old cached asset urls):
  // move them under the prefix so existing links keep working.
  if (!prefixed) {
    res.writeHead(301, { Location: PREFIX + pathname + search, "Cache-Control": "public, max-age=86400" });
    return res.end();
  }

  if ((req.method === "GET" || req.method === "HEAD") && internal.includes(".") && (await serveStatic(internal, res))) return;
  pageCache(req, res);
  return ssr(req, res);
}

process.on("unhandledRejection", (reason) => {
  console.error(JSON.stringify({ level: "error", msg: "unhandled rejection", error: String(reason).slice(0, 500) }));
});

server.keepAliveTimeout = 65_000;
server.listen(PORT, HOST, () => console.log(JSON.stringify({ level: "info", msg: "web started", port: (server.address() as import("node:net").AddressInfo).port, pid: process.pid })));

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
