/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   invite-deep-link-decision.test.ts                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// N24/N23: a ?invite= boot link only resolves to an id; it never joins. The token is
// cleared once the link is turned into a dialog, and a 404 shows one neutral sentence
// with no dialog. The real store runs against a stubbed fetch, so the call log is the
// proof: no /api/invites/accept, one /api/invites/resolve.

import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

const CLIENT = new URL("../../src/shared/api/client.ts", import.meta.url).href;
const STORE = new URL("../../src/store/settings/useWorkspaceInvitesStore.ts", import.meta.url).href;
const TOAST_STUB = `export const useToastStore = { getState: () => ({ push: (toast) => globalThis.__inviteToasts.push(toast) }) };`;
const DEEP_LINK_STUB = `export function whenLayoutIsRestored(run) { globalThis.__inviteRestore = run; }`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/shared/ui") return { url: `data:text/javascript,${encodeURIComponent(TOAST_STUB)}`, shortCircuit: true };
    if (specifier === "@osionos/ui/primitives") return { url: `data:text/javascript,${encodeURIComponent(TOAST_STUB)}`, shortCircuit: true };
    if (specifier === "@/features/settings/model/settingsDeepLink") {
      return { url: `data:text/javascript,${encodeURIComponent(DEEP_LINK_STUB)}`, shortCircuit: true };
    }
    if (specifier === "@/store/settings") {
      const reexport = `export { useWorkspaceInvitesStore } from ${JSON.stringify(STORE)};`;
      return { url: `data:text/javascript,${encodeURIComponent(reexport)}`, shortCircuit: true };
    }
    const resolved = nextResolve(specifier, context);
    if (resolved.url.endsWith("/src/shared/ui/index.ts")) return { url: `data:text/javascript,${encodeURIComponent(TOAST_STUB)}`, shortCircuit: true };
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

const session = new Map<string, string>();
Reflect.set(globalThis, "sessionStorage", {
  getItem: (key: string) => session.get(key) ?? null,
  setItem: (key: string, value: string) => void session.set(key, value),
  removeItem: (key: string) => void session.delete(key),
});
Reflect.set(globalThis, "location", { pathname: "/", search: "", hash: "" });
Reflect.set(globalThis, "history", { state: null, replaceState() {} });
Reflect.set(globalThis, "__playgroundUserStore", {
  getState: () => ({ activeJwt: () => "gotrue.jwt", activePageJwt: () => "osionos_v1.t", handleSessionRevoked: () => undefined }),
  subscribe: () => () => undefined,
});
Reflect.set(globalThis, "__inviteToasts", []);

const disk = new Map<string, string>();
Reflect.set(globalThis, "localStorage", {
  getItem: (key: string) => disk.get(key) ?? null,
  setItem: (key: string, value: string) => void disk.set(key, value),
  removeItem: (key: string) => void disk.delete(key),
});
Reflect.set(globalThis, "window", globalThis);

const { applyInviteDeepLink, INVITE_LINK_REFUSED } = await import("../../src/features/settings/people/inviteDeepLink.ts");
const { useWorkspaceInvitesStore } = await import("../../src/store/settings/useWorkspaceInvitesStore.ts");

const TOKEN = "B".repeat(43);
const INVITE_ID = "33333333-3333-4333-8333-333333333333";
const PENDING_KEY = "osionos.pendingInvite";

type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];
let answer: { status: number; body: unknown } = { status: 200, body: {} };

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  calls.push({
    url: String(input),
    method: init?.method ?? "GET",
    body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
  });
  return new Response(JSON.stringify(answer.body), {
    status: answer.status,
    headers: { "Content-Type": "application/json" },
  });
}) as typeof fetch;

async function flush() {
  for (let index = 0; index < 12; index += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

function boot() {
  calls = [];
  session.clear();
  Reflect.set(globalThis, "__inviteToasts", []);
  Reflect.set(globalThis, "__inviteRestore", null);
  Reflect.set(globalThis, "location", { pathname: "/", search: `?invite=${TOKEN}`, hash: "" });
  useWorkspaceInvitesStore.setState({ mine: [], mineLoading: false, mineError: null, mineUnavailable: false, openedInviteId: null });
  applyInviteDeepLink();
  assert.equal(session.get(PENDING_KEY), TOKEN, "the token survives until the layout is restored");
  const restore = (globalThis as unknown as { __inviteRestore?: () => void }).__inviteRestore;
  assert.equal(typeof restore, "function");
  restore?.();
}

test("N24: a valid link resolves and opens the dialog, never accepting on boot", async () => {
  answer = { status: 200, body: { id: INVITE_ID } };
  boot();
  await flush();

  const paths = calls.map((call) => new URL(call.url).pathname);
  assert.equal(paths.includes("/api/invites/accept"), false, "boot code must not post an accept");
  assert.equal(paths.filter((path) => path === "/api/invites/resolve").length, 1);
  const resolve = calls.find((call) => call.url.endsWith("/api/invites/resolve"));
  assert.equal(resolve?.method, "POST");
  assert.deepEqual(resolve?.body, { token: TOKEN });
  assert.equal(useWorkspaceInvitesStore.getState().openedInviteId, INVITE_ID);
  assert.equal(session.has(PENDING_KEY), false, "the token is spent when the dialog opens");
  assert.deepEqual((globalThis as unknown as { __inviteToasts: unknown[] }).__inviteToasts, []);
});

test("N23: a refused link shows one neutral toast and opens no dialog", async () => {
  answer = { status: 404, body: { error: "Not found" } };
  boot();
  await flush();

  assert.equal(useWorkspaceInvitesStore.getState().openedInviteId, null);
  const toasts = (globalThis as unknown as { __inviteToasts: { kind: string; title: string }[] }).__inviteToasts;
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0]?.title, INVITE_LINK_REFUSED);
  assert.equal(toasts[0]?.kind, "info");
  assert.equal(calls.some((call) => call.url.endsWith("/api/invites/accept")), false);
});

test("a link that names no id opens no dialog even when resolve answers empty", async () => {
  answer = { status: 200, body: {} };
  boot();
  await flush();
  assert.equal(useWorkspaceInvitesStore.getState().openedInviteId, null);
  assert.equal((globalThis as unknown as { __inviteToasts: unknown[] }).__inviteToasts.length, 1);
});
