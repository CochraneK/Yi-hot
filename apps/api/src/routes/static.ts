// Discovery and static files: sitemap, llms.txt, robots, security.txt, the web manifest, the OpenAPI
// document, icons, the IndexNow key, leaderboard logos and the about page's contact codes.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { SITE } from "@aihot/industry/site";
import { FEATURES } from "@aihot/industry/features";
import { CATEGORY_KEYS } from "@aihot/contracts/taxonomy";
import { RETRIEVAL_BOTS, SCRIPT_CLIENT_BOTS, SEO_BOTS, TRAINING_BOTS } from "@aihot/contracts/bot-policy";
import { REPO_ROOT, config } from "@aihot/backend/config";
import { applyPublicHeaders, sendTextWithEtag } from "../http/respond.ts";
import { sitemapXml } from "@aihot/backend/publication/sitemap";
import { llmsTxt, loadLlmsAvailability } from "@aihot/backend/publication/llms";

const REF = path.join(REPO_ROOT, "reference");
const ASSETS = path.join(REPO_ROOT, "assets");
const BRAND = path.join(REPO_ROOT, "industry/brand");
/** 关于页下方的「公众号内容分析」报告：一个自包含静态页 + 本地图表库（不依赖 CDN）。 */
const DASHBOARD = path.join(REPO_ROOT, "industry/dashboard");

const TYPES: Record<string, string> = {
  ".json": "application/json; charset=UTF-8",
  ".txt": "text/plain; charset=UTF-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

const fileCache = new Map<string, { body: Buffer; etag: string; mtime: number }>();

async function loadFile(file: string) {
  const s = await stat(file);
  const cached = fileCache.get(file);
  if (cached && cached.mtime === s.mtimeMs) return cached;
  const body = await readFile(file);
  const entry = { body, etag: `W/"${createHash("sha256").update(body).digest("hex").slice(0, 16)}"`, mtime: s.mtimeMs };
  fileCache.set(file, entry);
  return entry;
}

async function sendFile(req: FastifyRequest, reply: FastifyReply, file: string, opts: { type?: string; cacheControl: string }) {
  let entry;
  try {
    entry = await loadFile(file);
  } catch {
    return reply.code(404).type("text/plain; charset=utf-8").send("Not found");
  }
  reply.header("Content-Type", opts.type ?? TYPES[path.extname(file)] ?? "application/octet-stream");
  reply.header("Cache-Control", opts.cacheControl);
  reply.header("ETag", entry.etag);
  if (req.headers["if-none-match"] === entry.etag) return reply.code(304).send();
  return reply.send(entry.body);
}

/**
 * robots.txt. 四组 UA 与 apps/web/server.ts 的 403 判定读同一份名单（@aihot/contracts/bot-policy），
 * 声明和实际执行不会再分叉。分开写的代价上一版已经付过：这里禁了 ChatGPT-User，而 llms.txt 正在邀请
 * Agent 来读——门口写着欢迎，报上名就被拒。
 */
function robotsTxt(): string {
  const group = (comment: string, agents: readonly string[], rules: string[]) =>
    [`# ${comment}`, ...agents.map((agent) => `User-agent: ${agent}`), ...rules, ""].join("\n");

  // 普通搜索引擎：正文照常收录，只把后台、私人和反垃圾页面藏起来——接口返回 JSON，进索引没有意义。
  const search = [
    "User-agent: *",
    // 内容对搜索与 AI 检索开放，但明确不作为训练语料；与下面三组 UA 表达的是同一件事。
    "Content-Signal: search=yes, ai-input=yes, ai-train=no",
    "Allow: /",
    "",
    "Disallow: /api/",
    "Disallow: /admin/",
    "Disallow: /starred",
    "Disallow: /feedback",
    "",
    `Sitemap: ${config.siteUrl}/sitemap.xml`,
    "",
  ].join("\n");

  // 两类程序客户端拿到同一份放行清单：接口全开，页面不给。结构化数据走 API 就够了，
  // 而「程序调接口」本来就是本站的用途之一，不该在 403 上拦（频率由限流管）。
  const machineSurfaces = [
    "Allow: /llms.txt",
    "Allow: /api/",
    "Allow: /feed",
    "Allow: /openapi-v1.json",
    "Allow: /sitemap.xml",
    "Allow: /items/",
    "Disallow: /",
  ];

  // 训练型读不到 llms.txt：一份站点地图只对放进来的人有用。
  const training = group("训练型：禁止把本站内容用作训练语料（应用层同样返回 403）。", TRAINING_BOTS, ["Disallow: /"]);

  // 检索型是「用户当场提问」才来的，不是训练。
  const retrieval = group("检索型：用户提问时现抓，可以读接口，不要去啃页面。", RETRIEVAL_BOTS, machineSurfaces);

  // 脚本客户端：Python / Go / Java 这类库。它们只是程序的默认 UA，不是滥用。
  const scripts = group("脚本客户端：程序调 API 用，接口全开、页面不给。", SCRIPT_CLIENT_BOTS, machineSurfaces);

  const seo = group("SEO 审计：只要 HTML 且抓得很凶，接口对他们没有意义。", SEO_BOTS, ["Disallow: /"]);

  return search + training + retrieval + scripts + seo;
}

function manifest() {
  return {
    name: `${SITE.name} — ${SITE.tagline}`,
    short_name: SITE.name,
    description: SITE.description,
    lang: SITE.locale,
    id: "/yihot/",
    start_url: "/yihot/",
    scope: "/yihot/",
    display: "standalone",
    background_color: "#13191c",
    theme_color: "#13191c",
    // 图标必须带 `/yihot/` 前缀，理由同 web 端 root.tsx 的 links：manifest 里的相对地址
    // 是按站点根解析的，写 `/icon.png` 会让安装到桌面的应用去根路径取图——那里不属于本站。
    icons: [
      { src: "/yihot/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/yihot/icon.png", sizes: "512x512", type: "image/png" },
    ],
  };
}

/** The OpenAPI document with this deployment's name, address and categories. */
let openApi: string | null = null;
async function openApiJson(): Promise<string> {
  if (openApi) return openApi;
  const raw = (await readFile(path.join(REF, "public-v1.openapi.json"), "utf8"))
    .replaceAll("{{siteName}}", SITE.name)
    .replaceAll("{{siteUrl}}", config.siteUrl)
    .replaceAll("{{categoryList}}", CATEGORY_KEYS.join(", "));
  const doc = JSON.parse(raw) as { paths: Record<string, unknown>; components?: { parameters?: Record<string, { schema?: { enum?: string[] } }> } };
  // Categories follow the industry pack.
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    for (const key of ["enum", "examples"]) if (Array.isArray(o[key]) && (o[key] as unknown[]).includes("{{categories}}")) o[key] = [...CATEGORY_KEYS];
    for (const v of Object.values(o)) walk(v);
  };
  walk(doc);
  if (!FEATURES.codexResetMonitor) for (const p of Object.keys(doc.paths)) if (p.startsWith("/api/v1/codex-resets")) delete doc.paths[p];
  openApi = JSON.stringify(doc, null, 2);
  return openApi;
}

export function registerStatic(app: FastifyInstance) {
  app.get("/sitemap.xml", async (req, reply) => {
    try {
      const xml = await sitemapXml();
      return sendTextWithEtag(req, reply, xml, { etagPrefix: "sitemap", cacheControl: "public, max-age=0, s-maxage=300, must-revalidate", contentType: "application/xml" });
    } catch (error) {
      req.log.error({ err: error }, "sitemap unavailable");
      return reply.code(503).header("Retry-After", "300").header("Cache-Control", "no-store").send("Sitemap temporarily unavailable");
    }
  });

  app.get("/llms.txt", async (req, reply) => {
    const text = llmsTxt(await loadLlmsAvailability());
    applyPublicHeaders(reply, { cors: false });
    return sendTextWithEtag(req, reply, text, { etagPrefix: "llms", cacheControl: "public, s-maxage=3600, stale-while-revalidate=86400", contentType: "text/plain; charset=utf-8" });
  });

  app.get("/robots.txt", (req, reply) => sendTextWithEtag(req, reply, robotsTxt(), { etagPrefix: "robots", cacheControl: "public, max-age=3600", contentType: "text/plain; charset=utf-8" }));

  app.get("/.well-known/security.txt", (req, reply) => {
    if (!SITE.contactEmail) return reply.code(404).type("text/plain; charset=utf-8").send("Not found");
    const expires = new Date(Date.now() + 180 * 86400_000).toISOString();
    const text = `Contact: mailto:${SITE.contactEmail}\nExpires: ${expires}\nPreferred-Languages: zh, en\nCanonical: ${config.siteUrl}/.well-known/security.txt\n`;
    return sendTextWithEtag(req, reply, text, { etagPrefix: "security", cacheControl: "public, max-age=86400", contentType: "text/plain; charset=utf-8" });
  });

  app.get("/manifest.webmanifest", (req, reply) =>
    sendTextWithEtag(req, reply, JSON.stringify(manifest()), { etagPrefix: "manifest", cacheControl: "public, max-age=86400", contentType: "application/manifest+json" }));

  app.get("/openapi-v1.json", async (req, reply) => {
    applyPublicHeaders(reply);
    return sendTextWithEtag(req, reply, await openApiJson(), { etagPrefix: "openapi", cacheControl: "public, max-age=300, stale-while-revalidate=3600", contentType: "application/json; charset=utf-8" });
  });

  // IndexNow proves the key by a file at the site root named after it (INDEXNOW_KEY).
  if (config.indexNowKey) {
    app.get(`/${config.indexNowKey}.txt`, (req, reply) => sendTextWithEtag(req, reply, config.indexNowKey!, { etagPrefix: "indexnow", cacheControl: "public, max-age=3600", contentType: "text/plain; charset=utf-8" }));
  }

  // Icons from the industry pack (industry/brand/).
  for (const icon of ["favicon.ico", "icon.png", "icon-192.png", "apple-icon.png", "logo.svg"]) {
    app.get(`/${icon}`, (req, reply) => sendFile(req, reply, path.join(BRAND, icon), { cacheControl: "public, max-age=86400, stale-while-revalidate=604800" }));
  }

  if (FEATURES.leaderboard) {
    for (const dir of ["model-providers", "leaderboard-sources"]) {
      app.get(`/${dir}/:file`, (req, reply) => {
        const file = (req.params as { file: string }).file;
        if (!/^[a-z0-9-]+\.(svg|png)$/.test(file)) return reply.code(404).send();
        return sendFile(req, reply, path.join(ASSETS, dir, file), { cacheControl: "public, max-age=604800" });
      });
    }
  }

  // Contact codes on the about page: uploaded in the admin (content-hashed names), or shipped in the pack.
  app.get("/contact/:file", async (req, reply) => {
    const file = (req.params as { file: string }).file;
    if (!/^[\w.-]+\.(png|jpg|jpeg|webp)$/.test(file)) return reply.code(404).send();
    const hashed = /-[0-9a-f]{8}\./.test(file);
    const cacheControl = hashed ? "public, max-age=31536000, immutable" : "public, max-age=3600";
    const uploaded = path.join(config.dataDir, "uploads", file);
    const target = (await stat(uploaded).then(() => true, () => false)) ? uploaded : path.join(BRAND, "contact", file);
    return sendFile(req, reply, target, { cacheControl });
  });

  /**
   * 公众号内容分析报告（industry/dashboard/，由仓库外的 build_dashboard.py 生成）。
   * 只有这两个文件，白名单写死；页面里的图表库用相对路径引同目录那份，不依赖 CDN。
   */
  const DASH_FILES: Record<string, { file: string; type: string }> = {
    "/about/dashboard": { file: "index.html", type: "text/html; charset=utf-8" },
    "/about/dashboard/": { file: "index.html", type: "text/html; charset=utf-8" },
    "/about/dashboard/echarts.min.js": { file: "echarts.min.js", type: "text/javascript; charset=utf-8" },
  };
  for (const [route, spec] of Object.entries(DASH_FILES)) {
    app.get(route, (req, reply) => sendFile(req, reply, path.join(DASHBOARD, spec.file), { type: spec.type, cacheControl: "public, max-age=600" }));
  }
}
