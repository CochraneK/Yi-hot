// A retired or mistyped model name must not silently disappear from the admin view.
import "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { CAPABILITIES, invalidateModelCache, modelFor, modelSources } from "@aihot/backend/editorial/models";
import { modelsOverview } from "@aihot/backend/admin/models";

after(closeDb);

test("invalid environment/admin model remains visible while calls use a valid fallback", async () => {
  const capability = "monitor";
  const key = "models.monitor";
  const envName = CAPABILITIES.monitor.env;
  const originalEnv = process.env[envName];
  const [original] = await sql<{ value: unknown; updated_by: string; updated_at: Date }[]>`SELECT value,updated_by,updated_at FROM settings WHERE key=${key}`;
  const setSwitch = async (model: string | null) => {
    if (model === null) await sql`DELETE FROM settings WHERE key=${key}`;
    else await sql`INSERT INTO settings(key,value,updated_by) VALUES (${key},${sql.json({ model })},'test')
      ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by`;
    invalidateModelCache();
  };
  try {
    await setSwitch(null);
    process.env[envName] = "model-removed-from-registry";
    assert.deepEqual((await modelSources()).monitor,
      { model: CAPABILITIES.monitor.default, source: "default", invalid: "model-removed-from-registry" });
    assert.equal(await modelFor(capability), CAPABILITIES.monitor.default);

    process.env[envName] = "deepseek-flash";
    await setSwitch("old-admin-model");
    assert.deepEqual((await modelSources()).monitor,
      { model: "deepseek-flash", source: "env", invalid: "old-admin-model" });
    assert.equal(await modelFor(capability), "deepseek-flash");
    const overview = await modelsOverview(1);
    assert.deepEqual(overview.capabilities.find(c => c.key === capability)?.current,
      { model: "deepseek-flash", source: "env", invalid: "old-admin-model" });

    process.env[envName] = "env-no-longer-registered";
    await setSwitch("deepseek-flash");
    assert.deepEqual((await modelSources()).monitor, { model: "deepseek-flash", source: "admin" });
    assert.equal(await modelFor(capability), "deepseek-flash");

    await setSwitch(null);
    process.env[envName] = "deepseek-flash";
    assert.deepEqual((await modelSources()).monitor, { model: "deepseek-flash", source: "env" });
  } finally {
    if (original) {
      await sql`INSERT INTO settings(key,value,updated_by,updated_at)
        VALUES (${key},${sql.json(original.value as never)},${original.updated_by},${original.updated_at})
        ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at`;
    } else await sql`DELETE FROM settings WHERE key=${key}`;
    if (originalEnv === undefined) delete process.env[envName];
    else process.env[envName] = originalEnv;
    invalidateModelCache();
  }
});
