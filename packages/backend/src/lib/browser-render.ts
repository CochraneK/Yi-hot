// Headless-browser rendering for sources whose listing is built by client-side JavaScript (SPAs):
// the static HTML carries no post links, so the collectors' normal fetch + parse finds nothing. A
// real browser loads the page, lets the framework mount, and we read back the rendered DOM.
//
// Only sources whose config sets `render: "browser"` use this path; every other source is untouched.
// The chromium binary is the system package (Debian trixie: /usr/bin/chromium), not a bundled
// download, so the image stays reproducible and offline-buildable. A single browser is reused across
// fetches; it is relaunched if it ever dies, and reaped after a quiet stretch (see IDLE_TTL_MS) so
// one-shot CLI runs exit cleanly and the worker does not pin ~300 MB between 12-hourly renders.
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { assertPublicUrl } from "./url.ts";

const EXECUTABLE = process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium";

/** Close the shared browser after this long with no render; re-launch on the next one. */
const IDLE_TTL_MS = 60_000;

let browserPromise: Promise<Browser> | null = null;
let idleTimer: NodeJS.Timeout | null = null;

async function launch(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer
      .launch({
        executablePath: EXECUTABLE,
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--no-zygote"],
        protocolTimeout: 60_000,
      })
      .catch((error) => {
        browserPromise = null;
        throw error;
      });
  }
  return browserPromise;
}

/** A browser that died between fetches must not be reused; reset on the next launch. */
function forget(): void {
  browserPromise = null;
}

/** Close the shared browser (if any) and cancel the reaper. Idempotent; never throws. */
export async function closeBrowser(): Promise<void> {
  const pending = browserPromise;
  browserPromise = null;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (!pending) return;
  const browser = await pending.catch(() => null);
  if (!browser) return;
  // A wedged browser must not hold the exit open: close() gets 5s, then we move on.
  await Promise.race([
    browser.close().catch(() => {}),
    new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 5_000);
      t.unref?.();
    }),
  ]);
}

/** Reset the idle reaper: called after every render so an active browser is never reaped mid-batch. */
function scheduleReap(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    void closeBrowser();
  }, IDLE_TTL_MS);
  // The reaper itself must never be what keeps the event loop alive.
  idleTimer.unref();
}

// Node keeps the event loop alive while the browser handle is open. Without this hook a one-shot
// `node scripts/collect.ts <id>` prints its result and then hangs forever (observed: process alive
// 8+ minutes after a 2.2s successful collect). beforeExit fires when the loop drains, so closing the
// browser there lets the process finish naturally. Signal handling is deliberately left to the
// worker's own graceful-shutdown path — force-exiting here could truncate in-flight LLM receipts.
process.on("beforeExit", () => {
  void closeBrowser();
});

export interface RenderOptions {
  /** Page load budget in ms (navigation + settle). Default 30s. */
  timeoutMs?: number;
  /** Wait for this selector to appear before reading the DOM (covers lazy/mounted lists). */
  waitForSelector?: string;
  /** Accept-Language the renderer sends; listings localise on it. */
  acceptLanguage?: string;
}

export interface RenderedPage {
  /** The full rendered HTML (cheerio parses this exactly as a static fetch would). */
  html: string;
  /** The URL after any redirects the SPA performed. */
  url: string;
}

/**
 * Render `url` in headless chromium and return the post-hydration HTML. The URL is guarded the same
 * way outbound fetches are (public http(s) only) because source config is admin-controlled but still
 * untrusted input. Throws on timeout, navigation failure, or a dead browser.
 */
export async function renderBrowser(url: string, opts: RenderOptions = {}): Promise<RenderedPage> {
  assertPublicUrl(url, false, false);
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const browser = await launch();
  let page: Page | undefined;
  try {
    page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    );
    await page.setViewport({ width: 1366, height: 900 });
    if (opts.acceptLanguage) await page.setExtraHTTPHeaders({ "accept-language": opts.acceptLanguage });
    await page.goto(url, { waitUntil: "networkidle2", timeout: timeoutMs });
    if (opts.waitForSelector) {
      try {
        await page.waitForSelector(opts.waitForSelector, { timeout: timeoutMs });
      } catch {
        // The list may have mounted without matching the hint; read whatever rendered.
      }
    }
    const html = await page.content();
    return { html, url: page.url() };
  } catch (error) {
    forget();
    throw error;
  } finally {
    await page?.close().catch(() => {});
    scheduleReap();
  }
}
