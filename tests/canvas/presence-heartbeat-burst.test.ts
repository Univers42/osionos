/**
 * The bridge allows 10 heartbeats a minute per user, counted across every tab and device
 * (scripts/bridge-presence.mjs). Each remount of a consumer used to beat at once, so
 * route changes plus a few open sessions answered 429 (beta sweep, 2026-11-04). A remount
 * within 15 s of the last beat no longer beats; a presence choice still beats at once.
 *
 * The api client reads import.meta.env (Vite-only), so it is loaded with a shim env; the
 * transport is a stubbed global fetch.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

const CLIENT = new URL("../../src/shared/api/client.ts", import.meta.url).href;
const UI_STUB = `export const useToastStore = { getState: () => ({ push() {} }) };`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/shared/ui") return { url: `data:text/javascript,${encodeURIComponent(UI_STUB)}`, shortCircuit: true };
    const resolved = nextResolve(specifier, context);
    if (resolved.url.endsWith("/src/shared/ui/index.ts")) return { url: `data:text/javascript,${encodeURIComponent(UI_STUB)}`, shortCircuit: true };
    return resolved;
  },
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (typeof result === "object" && result && "source" in result && url === CLIENT) {
      const source = typeof result.source === "string" ? result.source : new TextDecoder().decode(result.source);
      return { ...result, source: `import.meta.env ??= { VITE_API_URL: "https://bridge.test" };\n${source}` };
    }
    return result;
  },
});

Reflect.set(globalThis, "__playgroundUserStore", {
  getState: () => ({ activeJwt: () => "gotrue.jwt", activePageJwt: () => "osionos_v1.tok", handleSessionRevoked: () => undefined }),
  subscribe: () => () => undefined,
});
const beats: string[] = [];
globalThis.fetch = (async (input: string) => {
  beats.push(String(input));
  return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

const { beatOnMount, setPresenceSetting } = await import("../../src/shared/people/usePresenceHeartbeat.ts");

test("a remount within 15 s of the last beat sends no beat", async () => {
  beats.length = 0;
  beatOnMount(1_000_000);
  beatOnMount(1_005_000);
  beatOnMount(1_014_999);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(beats.length, 1);
  assert.match(beats[0], /\/api\/profile\/heartbeat$/);
});

test("a remount 15 s or more after the last beat beats again", async () => {
  beats.length = 0;
  beatOnMount(2_000_000);
  beatOnMount(2_015_000);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(beats.length, 2);
});

test("a presence choice beats at once, whatever the last beat", async () => {
  beats.length = 0;
  beatOnMount(Date.now());
  setPresenceSetting({ state: "busy" as never, customText: null });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(beats.length, 2);
});
