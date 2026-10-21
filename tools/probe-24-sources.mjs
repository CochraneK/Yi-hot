// 对 proposals-child-rights 里 status=no_rss 的站点逐个做只读结构探测：
// GET 一次给定 URL（带浏览器 UA），统计 a 标签的「路径模式」分布，找出最像列表的那个模式。
// 只读、不绕访问控制、不伪造身份。输出供人工判断，不自动写配置。
import { readFileSync } from "node:fs";
import * as cheerio from "cheerio";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const backlog = JSON.parse(readFileSync("/app/data/source-registry/proposals-child-rights-2026-10-21.json", "utf8"));
const targets = backlog.pending.filter((x) => x.status === "no_rss");

/** 把 URL 归一成「模式」：数字段换成 {n}，长的十六进制换成 {id}，只留前两段路径。 */
function patternOf(href, base) {
  let u;
  try { u = new URL(href, base); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  if (u.hostname !== new URL(base).hostname.replace(/^www\./, "") && !u.hostname.endsWith(new URL(base).hostname.replace(/^www\./, ""))) return null;
  const segs = u.pathname.split("/").filter(Boolean).slice(0, 4);
  if (!segs.length) return null;
  return segs.map((s) => (/^\d+$/.test(s) ? "{n}" : /^[0-9a-f]{8,}$/i.test(s) ? "{id}" : s)).join("/");
}

const out = [];
for (const t of targets) {
  const rec = { id: t.id, name: t.name, priority: t.priority, url: t.url };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(t.url, { headers: { "user-agent": UA, accept: "text/html,*/*" }, signal: ctrl.signal, redirect: "follow" });
    clearTimeout(timer);
    rec.status = res.status;
    rec.finalUrl = res.url;
    const html = await res.text();
    rec.bytes = html.length;
    if (res.ok && /html/i.test(res.headers.get("content-type") ?? "")) {
      const $ = cheerio.load(html);
      const buckets = new Map();
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href");
        const text = ($(el).attr("title") || $(el).text() || "").replace(/\s+/g, " ").trim();
        const p = patternOf(href, res.url);
        if (!p || text.length < 8) return; // 导航链接标题都很短
        if (!buckets.has(p)) buckets.set(p, []);
        buckets.get(p).push(text.slice(0, 40));
      });
      rec.patterns = [...buckets.entries()]
        .filter(([, v]) => v.length >= 3)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 3)
        .map(([p, v]) => ({ pattern: p, count: v.length, samples: v.slice(0, 3) }));
      // XHR 线索：内联脚本里出现的接口路径
      rec.xhr = [...new Set(
        [...html.matchAll(/(?:url|api|ajax)\s*[:=]\s*["']([^"']{6,80})["']/gi)].map((m) => m[1]).filter((x) => /api|json|list|index/.test(x)),
      )].slice(0, 3);
    }
  } catch (e) {
    rec.status = "err";
    rec.error = String(e.message ?? e).slice(0, 80);
  }
  out.push(rec);
  console.log(JSON.stringify(rec));
}
console.log("SUMMARY", JSON.stringify({
  total: out.length,
  ok: out.filter((r) => r.status === 200).length,
  listLike: out.filter((r) => (r.patterns ?? []).length > 0).length,
  err: out.filter((r) => typeof r.status !== "number").map((r) => r.id + ":" + r.status),
}));
