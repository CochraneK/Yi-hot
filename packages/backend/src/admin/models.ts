// Admin "模型与评测": the model each capability uses and where that choice comes from,
// the prompt versions in use, quality / latency / cost of the last days per model, the switch history
// and the SelectBench runs that compare models on the same batch. A switch is audited and applies to
// new work only.
import { sql } from "../db.ts";
import { CAPABILITIES, invalidateModelCache, modelSources, type Capability, type CapabilityKey } from "../editorial/models.ts";
import { MODELS } from "../providers/llm.ts";
import { audit } from "./auth.ts";

interface UsageRow {
  purpose: string;
  model: string | null;
  prompt_version: string | null;
  calls: number;
  ok: number;
  failed: number;
  unknown: number;
  p50: number | null;
  p95: number | null;
  tokens_in: string | null;
  tokens_out: string | null;
  actual_cost: string | null;
  currency: string | null;
}

export async function modelsOverview(days = 7) {
  const since = new Date(Date.now() - days * 86400_000);
  const [sources, usage, prices, history, benches] = await Promise.all([
    modelSources(),
    sql<UsageRow[]>`
      SELECT r.purpose, a.model, r.request->>'promptVersion' AS prompt_version, count(*)::int AS calls,
             count(*) FILTER (WHERE a.status = 'received')::int AS ok,
             count(*) FILTER (WHERE a.status = 'failed')::int AS failed,
             count(*) FILTER (WHERE a.status = 'unknown')::int AS unknown,
             percentile_disc(0.5) WITHIN GROUP (ORDER BY a.latency_ms) AS p50,
             percentile_disc(0.95) WITHIN GROUP (ORDER BY a.latency_ms) AS p95,
             sum((a.usage->>'prompt_tokens')::bigint) AS tokens_in, sum((a.usage->>'completion_tokens')::bigint) AS tokens_out,
             sum(a.cost) FILTER (WHERE a.cost_basis = 'actual') AS actual_cost, max(a.currency) AS currency
      FROM receipt_attempts a JOIN receipts r ON r.id = a.receipt_id
      WHERE a.started_at >= ${since} AND a.origin = 'live' AND a.model IS NOT NULL
      GROUP BY 1, 2, 3 ORDER BY 1, 4 DESC`,
    sql<{ service: string; model: string; currency: string; input_per_mtok: string | null; output_per_mtok: string | null }[]>`
      SELECT service, model, currency, input_per_mtok, output_per_mtok FROM service_prices`,
    sql<{ at: Date; actor: string; subject: string; reason: string | null; before: unknown; after: unknown }[]>`
      SELECT created_at AS at, actor, subject, reason, before, after FROM audit_log WHERE action = 'models.switch' ORDER BY created_at DESC LIMIT 30`,
    sql<{ id: string; label: string; sample_size: number; prompt_version: string | null; models: string[]; summary: unknown; created_at: Date }[]>`
      SELECT id, label, sample_size, prompt_version, models,
             (SELECT coalesce(jsonb_object_agg(key, value - 'sweep'), '{}'::jsonb) FROM jsonb_each(r.summary)) AS summary,
             created_at FROM selectbench_runs r ORDER BY created_at DESC LIMIT 8`,
  ]);
  const serviceOf = (model: string) => Object.values(MODELS).find((m) => m.model === model || m.key === model)?.service ?? null;
  const priced = (u: UsageRow) => {
    const service = u.model ? serviceOf(u.model) : null;
    const p = prices.find((x) => x.service === service && x.model === u.model) ?? prices.find((x) => x.service === service && x.model === "");
    if (!p || (!p.input_per_mtok && !p.output_per_mtok)) return null;
    return { amount: (Number(u.tokens_in ?? 0) / 1e6) * Number(p.input_per_mtok ?? 0) + (Number(u.tokens_out ?? 0) / 1e6) * Number(p.output_per_mtok ?? 0), currency: p.currency };
  };
  const capabilities = (Object.entries(CAPABILITIES) as Array<[CapabilityKey, Capability]>).map(([key, c]) => ({
    key,
    label: c.label,
    env: c.env,
    defaultModel: c.default,
    vision: !!c.vision,
    current: sources[key]!,
    usage: usage
      .filter((u) => c.purposes.includes(u.purpose))
      .map((u) => ({
        purpose: u.purpose,
        model: u.model,
        promptVersion: u.prompt_version,
        calls: u.calls,
        ok: u.ok,
        failed: u.failed,
        unknown: u.unknown,
        p50: u.p50,
        p95: u.p95,
        tokensIn: Number(u.tokens_in ?? 0),
        tokensOut: Number(u.tokens_out ?? 0),
        actualCost: u.actual_cost === null ? null : Number(u.actual_cost),
        currency: u.currency,
        estimate: priced(u),
      })),
  }));
  const choices = Object.values(MODELS).map((m) => ({ key: m.key, service: m.service, vision: !!m.vision }));
  return { days, capabilities, choices, history, benches };
}

/** Switches a capability to another registered model (or back to the environment/default when null). */
export async function switchModel(capability: string, model: string | null, reason: string, actor: string) {
  const c = (CAPABILITIES as Record<string, Capability>)[capability];
  if (!c) throw Object.assign(new Error("unknown capability"), { statusCode: 400 });
  if (!reason.trim()) throw Object.assign(new Error("a reason is required"), { statusCode: 400 });
  if (model !== null) {
    const spec = MODELS[model];
    if (!spec) throw Object.assign(new Error("unknown model"), { statusCode: 400 });
    if (!!c.vision !== !!spec.vision) throw Object.assign(new Error(c.vision ? "this capability needs a vision model" : "a vision-only model cannot do this"), { statusCode: 400 });
  }
  const before = (await modelSources())[capability];
  if (model === null) await sql`DELETE FROM settings WHERE key = ${`models.${capability}`}`;
  else {
    await sql`INSERT INTO settings (key, value, updated_by) VALUES (${`models.${capability}`}, ${sql.json({ model })}, ${actor})
              ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`;
  }
  invalidateModelCache();
  const after = (await modelSources())[capability];
  await audit(actor, "models.switch", `capability:${capability}`, reason, before ?? null, after ?? null);
  return { capability, before, after };
}

/**
 * Unit prices for estimating spend. `service_prices` is operator-entered (imported from the
 * provider's price page), so this is the only way to keep it current without touching SQL.
 *
 * Matching is by (service, model), and `service` is derived from the MODELS registry — a price row
 * whose model is not in the registry is never used, which is why `usageOverview` also reports the
 * model names actually seen in receipts.
 */
export interface PriceInput {
  service: string;
  model: string;
  currency: string;
  inputPerMtok: number | string | null;
  cachedPerMtok: number | string | null;
  outputPerMtok: number | string | null;
  perRequest: number | string | null;
  sourceUrl: string | null;
  verifiedOn: string | null;
  note: string | null;
}

const bad = (detail: string) => Object.assign(new Error(detail), { statusCode: 400 });

/** Empty means "not set"; anything else must be a non-negative finite number. */
function amount(value: number | string | null | undefined, field: string): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw bad(`${field}：请填非负数字，留空表示不适用`);
  return n;
}

/**
 * Creates or replaces one (service, model) row. At least one of the three rates must be filled.
 * `reason` goes to the audit log; `input.note` stays on the row as a human annotation (e.g. "高峰价").
 */
export async function savePrice(input: PriceInput, actor: string, reason = "") {
  const service = String(input.service ?? "").trim();
  if (!service) throw bad("服务名必填（如 llm，见「实际在用」列表）");
  const model = String(input.model ?? "").trim();
  const currency = input.currency === "CNY" ? "CNY" : "USD";
  const row = {
    service,
    model,
    currency,
    input_per_mtok: amount(input.inputPerMtok, "输入单价"),
    cached_per_mtok: amount(input.cachedPerMtok, "缓存命中单价"),
    output_per_mtok: amount(input.outputPerMtok, "输出单价"),
    per_request: amount(input.perRequest, "按次单价"),
    source_url: input.sourceUrl ? String(input.sourceUrl).trim() : null,
    verified_on: input.verifiedOn ? String(input.verifiedOn).trim() : null,
    note: input.note ? String(input.note).trim() : null,
  };
  if (row.input_per_mtok === null && row.output_per_mtok === null && row.per_request === null)
    throw bad("至少填一个价格（输入 / 输出 / 按次）");
  const [before] = await sql`SELECT * FROM service_prices WHERE service = ${service} AND model = ${model}`;
  await sql`
    INSERT INTO service_prices (service, model, currency, input_per_mtok, cached_per_mtok, output_per_mtok, per_request, source_url, verified_on, note)
    VALUES (${row.service}, ${row.model}, ${row.currency}, ${row.input_per_mtok}, ${row.cached_per_mtok}, ${row.output_per_mtok}, ${row.per_request}, ${row.source_url}, ${row.verified_on}, ${row.note})
    ON CONFLICT (service, model) DO UPDATE SET
      currency = EXCLUDED.currency, input_per_mtok = EXCLUDED.input_per_mtok, cached_per_mtok = EXCLUDED.cached_per_mtok,
      output_per_mtok = EXCLUDED.output_per_mtok, per_request = EXCLUDED.per_request, source_url = EXCLUDED.source_url,
      verified_on = EXCLUDED.verified_on, note = EXCLUDED.note, updated_at = now()`;
  await audit(actor, before ? "price.update" : "price.create", `price:${service}/${model || "(兜底)"}`, reason.trim() || row.note || (before ? "修改单价" : "新增单价"), before ?? null, row);
  return { ...row, created: !before };
}

/** Removes one (service, model) row. Returns null when there was nothing to delete (→ 404). */
export async function deletePrice(service: string, model: string, actor: string, reason = "") {
  const s = String(service ?? "").trim();
  const m = String(model ?? "").trim();
  const [before] = await sql`SELECT * FROM service_prices WHERE service = ${s} AND model = ${m}`;
  if (!before) return null;
  await sql`DELETE FROM service_prices WHERE service = ${s} AND model = ${m}`;
  await audit(actor, "price.delete", `price:${s}/${m || "(兜底)"}`, reason.trim() || "删除单价", before, null);
  return { ok: true };
}
