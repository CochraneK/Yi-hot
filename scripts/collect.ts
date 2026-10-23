// Runs collection for given sources now (development / operations helper).
// node --env-file=.env scripts/collect.ts rss-openai-news rss-hugging-face ...
import { closeDb } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { closeBrowser } from "@aihot/backend/lib/browser-render";
import { collectSource } from "@aihot/backend/sources/collect";

for (const id of process.argv.slice(2)) {
  const started = Date.now();
  const r = await collectSource(id, { force: true });
  console.log(JSON.stringify({ ...r, ms: Date.now() - started }));
}
await stopBoss();
// A one-shot CLI must not wait on the renderer's idle reaper: an open browser handle keeps the
// event loop alive, so without this the process hangs ~IDLE_TTL_MS after printing its result.
await closeBrowser();
await closeDb();
