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

const PORT = Number(process.env.WEB_PORT || process.env.PORT || 3000);
const HOST = process.env.WEB_HOST || "127.0.0.1";
const API = new URL(process.env.API_BASE_URL || "http://127.0.0.1:3001");
/**
 * Whether a reverse proxy in front (Caddy, nginx) records the visitor in X-Forwarded-For. Without one
 * the header is never believed: a visitor could name any address and slip past the api's per-visitor
 * limits (sign-in attempts, feedback).
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
 * AI 训练 / 抓取型爬虫的 User-Agent 特征。命中即在应用边缘返回 403，既不进入 SSR 也不会代理给 API。
 * 常规搜索引擎（Googlebot / Bingbot / Baiduspider 等）不在此列，仍可正常收录。robots.txt（由 API 提供）
 * 已声明禁止这些 UA；这里是不守规矩者的强制兜底。要收紧/放宽，改这一个正则即可。
 */
const AI_CRAWLER_RE = /(?:gptbot|chatgpt-user|claudebot|anthropic-ai|claude-web|google-extended|ccbot|bytespider|omgilibot|omgili|applebot-extended|diffbot|petalbot|mj12bot|semrushbot|ahrefsbot|dotbot|dataforseobot|blexbot|scrapy|python-requests|python-urllib|go-http-client|java\/|okhttp|apache-httpclient|headlesschrome|phantomjs)/i;

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

  // 反爬：在请求进入路由 / 代理之前拦截已知 AI 训练与抓取型爬虫。robots.txt 自身放行，便于其读取策略。
  const ua = req.headers["user-agent"] ?? "";
  const isRobots = pathname === "/robots.txt" || pathname === PREFIX + "/robots.txt";
  if (!isRobots && AI_CRAWLER_RE.test(ua)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end("Access denied");
    return;
  }

  // What the app sees: the path with the prefix stripped. Api-owned resources (api/, feed, icons,
  // sitemaps) stay reachable at the root too — browser fetches and api-generated absolute links hit
  // them there — so they are matched before anything below is moved under the prefix.
  const prefixed = pathname === PREFIX || pathname.startsWith(PREFIX + "/");
  const internal = prefixed ? (pathname.slice(PREFIX.length) || "/") : pathname;

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

  const decision = resolveRedirect(internal, search);
  if (decision) {
    for (const [k, v] of Object.entries(decision.headers)) res.setHeader(k, v);
    // Redirect locations in the shared table are root-anchored; point them back under the prefix.
    if (decision.location) res.setHeader("Location", decision.location.startsWith("/") ? PREFIX + decision.location : decision.location);
    res.statusCode = decision.status;
    return res.end(decision.location ? undefined : decision.status === 410 ? "Gone" : "Not found");
  }

  if (isApiOwned(internal)) {
    // The visitor's address, decided here: the one the trusted proxy saw (the last X-Forwarded-For
    // entry), or this connection's own. Both headers carry only that.
    const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",").map((v) => v.trim()).filter(Boolean);
    const client = TRUST_PROXY && forwarded.length ? forwarded[forwarded.length - 1]! : (req.socket.remoteAddress ?? "");
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
