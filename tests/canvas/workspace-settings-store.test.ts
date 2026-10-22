/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspace-settings-store.test.ts                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P3-5-a: the org settings store is the only writer of /api/workspaces/:id/settings.
// Reset sends the five allowlisted keys, icon removal sends icon: null, and the
// config store no longer writes a second path. Transport is a stubbed fetch.

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


const { useWorkspaceSettingsStore } = await import("../../src/store/settings/useWorkspaceSettingsStore.ts");
const { useWorkspaceConfigStore } = await import("../../src/shared/config/workspaceConfigStore.ts");

const WS = "11111111-1111-4111-8111-111111111111";
const ALLOWED = ["analytics", "icon", "landingPageId", "name", "sidebar"];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Call = { url: string; method: string; body: Record<string, unknown> | null };

async function recordCalls(run: () => Promise<void>): Promise<Call[]> {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? "GET", body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify({ name: "Team" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
  return calls;
}

function useSession() {
  Reflect.set(globalThis, "__playgroundUserStore", {
    getState: () => ({ activeJwt: () => "gotrue.jwt", activePageJwt: () => "osionos_v1.t", handleSessionRevoked: () => undefined }),
    subscribe: () => () => undefined,
  });
}

test("reset PATCHes only the five allowlisted keys", async () => {
  useSession();
  const calls = await recordCalls(() => useWorkspaceSettingsStore.getState().reset("u", WS, "Team"));
  const patches = calls.filter((call) => call.method === "PATCH" && call.url.endsWith(`/api/workspaces/${WS}/settings`));
  assert.equal(patches.length, 1);
  assert.deepEqual(Object.keys(patches[0].body ?? {}).sort(), ALLOWED);
});

test("icon removal sends icon: null and clears the local icon", async () => {
  useSession();
  useWorkspaceSettingsStore.getState().update("u", WS, { icon: "x" });
  const calls = await recordCalls(async () => {
    useWorkspaceSettingsStore.getState().update("u", WS, { icon: null });
    assert.equal(useWorkspaceSettingsStore.getState().data[WS]?.icon, undefined);
    await sleep(700);
  });
  const patch = calls.find((call) => call.method === "PATCH");
  assert.ok(patch, "a PATCH was sent");
  assert.deepEqual(patch.body, { icon: null });
});

test("the config store writes no api path and persists no token", async () => {
  useSession();
  const calls = await recordCalls(async () => {
    await useWorkspaceConfigStore.getState().updateSettings("u", WS, { name: "N" });
    await useWorkspaceConfigStore.getState().clearAppearance("u", WS);
  });
  assert.deepEqual(calls, []);
  const persisted = JSON.stringify(useWorkspaceConfigStore.getState().configs) + JSON.stringify(useWorkspaceSettingsStore.getState().data);
  assert.equal(/token/i.test(persisted), false);
});
