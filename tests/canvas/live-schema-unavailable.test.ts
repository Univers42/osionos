/**
 * The bridge answers an unreachable source with 200 `{ unavailable: true }` instead of a
 * 503, because the browser logs every non-2xx as a console error (the owner's offline
 * Inception databases, 2026-11-04). getLiveSchema must still FAIL for it, with the
 * bridge's message, so every caller keeps its offline state, and must not cache it.
 *
 * liveMountClient reads import.meta.env at module load, so it is loaded with a shim env;
 * the transport is a stubbed global fetch.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

const CLIENT = new URL("../../src/shared/notion-database-sys/src/store/live/liveMountClient.ts", import.meta.url).href;

registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (typeof result === "object" && result && "source" in result && url === CLIENT) {
      const source = typeof result.source === "string" ? result.source : new TextDecoder().decode(result.source);
      return { ...result, source: `import.meta.env ??= { VITE_API_URL: "https://bridge.test" };\n${source}` };
    }
    return result;
  },
});

const { getLiveSchema } = await import("../../src/shared/notion-database-sys/src/store/live/liveMountClient.ts");

const DB = "5d1bbdb5-f6d2-4d0f-83d0-3758309e20ec";

function answer(body: unknown) {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return () => calls;
}

test("getLiveSchema: an unavailable source fails with the bridge's message", async () => {
  answer({ dbId: DB, tables: [], unavailable: true, message: "The database did not answer." });
  await assert.rejects(getLiveSchema(DB), (error: { message: string; status: number; code?: string }) => {
    assert.equal(error.message, "The database did not answer.");
    assert.equal(error.status, 503);
    assert.equal(error.code, "SOURCE_UNAVAILABLE");
    return true;
  });
});

test("getLiveSchema: an unavailable answer is not cached", async () => {
  const calls = answer({ dbId: DB, tables: [], unavailable: true, message: "down" });
  await assert.rejects(getLiveSchema(DB));
  await new Promise((resolve) => setTimeout(resolve, 0));
  await assert.rejects(getLiveSchema(DB));
  assert.equal(calls(), 2);
});

test("getLiveSchema: a reachable source still resolves", async () => {
  answer({ dbId: "11111111-1111-4111-8111-111111111111", tables: [{ name: "t", columns: [] }] });
  const schema = await getLiveSchema("11111111-1111-4111-8111-111111111111");
  assert.equal(schema.tables.length, 1);
});
