/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-handoff-framed.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/19 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/19 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A framed boot must never consume a bridge handoff (devil C26): a page the viewer embedded can
// redirect its own frame to `<app>/#bridge_token=<attacker's>`, and consuming it there swaps the
// viewer's account set. The module reads `import.meta.env` (Vite only), so it gets an env with a
// bridge URL here, and its api client and seed JSON are replaced.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const CLIENT_STUB = "export const api = {}; export const API_BASE = '';";
const url = (code: string): string => `data:text/javascript,${encodeURIComponent(code)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/shared/api/client") return { url: url(CLIENT_STUB), shortCircuit: true };
    const resolved = nextResolve(specifier, context);
    if (resolved.url.endsWith("/src/shared/api/client.ts")) return { url: url(CLIENT_STUB), shortCircuit: true };
    if (resolved.url.endsWith(".json")) return { ...resolved, importAttributes: { ...context.importAttributes, type: "json" }, shortCircuit: true };
    return resolved;
  },
  load(loadUrl, context, nextLoad) {
    const loaded = nextLoad(loadUrl, context);
    if (!loadUrl.endsWith("/src/features/auth/model/userStore.helpers.ts") || loaded.source == null) return loaded;
    return { ...loaded, source: `import.meta.env ??= { VITE_API_URL: "https://bridge.invalid" };\n${Buffer.from(loaded.source).toString()}` };
  },
});

const { consumeBridgeSessionFromLocation } = await import("../../src/features/auth/model/userStore.helpers.ts");

function boot(topOf: () => unknown): string[] {
  const calls: string[] = [];
  const stubs: Record<string, unknown> = {
    window: globalThis,
    location: { hash: "#bridge_token=probe", search: "", href: "https://app.test/#bridge_token=probe" },
    history: { state: null, replaceState: () => undefined },
    document: { title: "" },
    fetch: async (target: string) => {
      calls.push(target);
      return { ok: true, json: async () => ({ activeUserId: "u", sessions: [] }) };
    },
  };
  for (const [key, value] of Object.entries(stubs)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  Object.defineProperty(globalThis, "self", { value: globalThis, configurable: true });
  Object.defineProperty(globalThis, "top", { get: topOf, configurable: true });
  return calls;
}

test("a top-level boot consumes the handoff (the positive control)", async () => {
  const calls = boot(() => globalThis);
  await consumeBridgeSessionFromLocation();
  assert.deepEqual(calls, ["https://bridge.invalid/api/auth/bridge/consume"]);
});

test("a framed boot sends no request", async () => {
  const calls = boot(() => ({}));
  assert.equal(await consumeBridgeSessionFromLocation(), null);
  assert.deepEqual(calls, []);
});

test("a boot whose top cannot be read counts as framed", async () => {
  const calls = boot(() => { throw new DOMException("blocked", "SecurityError"); });
  assert.equal(await consumeBridgeSessionFromLocation(), null);
  assert.deepEqual(calls, []);
});
