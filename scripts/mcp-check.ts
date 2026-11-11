// Offline MCP transport contract check: initialize, tools/list, tools/call and 256 KiB rejection.
// Uses the site's own tool prefix; never invokes models or paid providers.
import assert from "node:assert/strict";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { MCP_TOOL_NAMES as T } from "@aihot/contracts/mcp";

const url = new URL(process.argv[2] ?? "http://127.0.0.1:3001/api/mcp");
const client = new Client({ name: "yihot-mcp-ci", version: "1.0.0" });
try {
  await client.connect(new StreamableHTTPClientTransport(url));
  const info = client.getServerVersion?.();
  assert.ok(info?.name, "initialize must identify the server");
  console.log("MCP initialize:", JSON.stringify(info));
  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name);
  assert.deepEqual([...names].sort(), Object.values(T).sort(), "all five YiHot tools must be available");
  console.log("MCP tools/list:", names.join(", "));

  const cases: Array<[string, Record<string, unknown>]> = [
    [T.latest, { limit: 2 }],
    [T.search, { q: "公益", limit: 2 }],
    [T.hot, { limit: 2 }],
    [T.daily, {}],
  ];
  const hot = await client.callTool({ name: T.hot, arguments: { limit: 1 } });
  const story = ((hot.structuredContent as { items?: Array<{ links?: { story?: string } }> })?.items?.[0]?.links?.story ?? "").split("/").pop();
  if (story) cases.push([T.story, { public_id: story, report_limit: 2 }]);
  for (const [name, args] of cases) {
    const result = await client.callTool({ name, arguments: args });
    assert.ok(Array.isArray(result.content), name + " must return an MCP content array");
    console.log("MCP tools/call:", name, result.isError ? "(public tool error on empty fixtures)" : "ok");
  }
  // Fastify must bound the incoming raw request, not rely solely on JSON-RPC validation.
  const large = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 100, method: "tools/list", params: { padding: "x".repeat(300_000) } }),
  });
  assert.equal(large.status, 413, "oversized MCP POST must be rejected at HTTP transport");
  console.log("MCP body limit:", large.status);
} finally {
  await client.close();
}
