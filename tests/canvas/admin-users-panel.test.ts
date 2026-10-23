/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   admin-users-panel.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P3-4-d: the users panel. The store runs against a stubbed fetch (the transport), and the panel
// is rendered to static markup in each of its states. The route never returns an email, so the
// hostile stub below adds one and the markup must still not carry it.

import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const CLIENT = new URL("../../src/shared/api/client.ts", import.meta.url).href;

registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (url === CLIENT && typeof result === "object" && result && "source" in result) {
      const source = typeof result.source === "string" ? result.source : new TextDecoder().decode(result.source);
      return { ...result, source: `import.meta.env ??= { VITE_API_URL: "https://bridge.test" };\n${source}` };
    }
    return result;
  },
});

const { useAdminUsersStore } = await import("../../src/features/admin-users/useAdminUsersStore.ts");
const { adminUsersErrorCopy } = await import("../../src/features/admin-users/adminUsersCopy.ts");
const { UsersPanelView } = await import("../../src/widgets/admin-space/sections/users/UsersPanel.tsx");
const { section } = await import("../../src/widgets/admin-space/sections/users/section.ts");

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const row = (userId: string, displayName: string) => ({
  userId, displayName, username: displayName.toLowerCase(), directoryOptOut: false,
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z", email: `${displayName}@leak.test`,
});

type Call = { url: string; method: string; body: Record<string, unknown> | null };
type Reply = { status?: number; body: unknown };

/** Runs `run` with a fetch that answers from `reply` and records every call. */
async function withBridge(reply: (call: Call) => Reply, run: () => Promise<void>): Promise<Call[]> {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const call = { url: String(input), method: init?.method ?? "GET", body: typeof init?.body === "string" ? JSON.parse(init.body) : null };
    calls.push(call);
    const { status = 200, body } = reply(call);
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try { await run(); } finally { globalThis.fetch = original; }
  return calls;
}

function resetStore() {
  useAdminUsersStore.setState({ users: [], roles: {}, nextCursor: null, loading: false, loaded: false, error: null, rowErrors: {}, busyUserId: null });
}

const pages = (call: Call): Reply =>
  call.url.includes("cursor=c1")
    ? { body: { ok: true, users: [row(B, "Bea")], nextCursor: null } }
    : { body: { ok: true, users: [row(A, "Ann")], nextCursor: "c1" } };

test("the section is the admin-only Users entry", () => {
  assert.equal(section.id, "users");
  assert.equal(section.requiredRole, "admin");
});

test("loadMore appends the second page, keeps the cursor, and stops when there is none", async () => {
  resetStore();
  const calls = await withBridge(pages, async () => {
    await useAdminUsersStore.getState().reload();
    assert.equal(useAdminUsersStore.getState().nextCursor, "c1");
    await useAdminUsersStore.getState().loadMore();
    assert.deepEqual(useAdminUsersStore.getState().users.map((user) => user.userId), [A, B]);
    assert.equal(useAdminUsersStore.getState().nextCursor, null);
    await useAdminUsersStore.getState().loadMore();
  });
  assert.equal(calls.length, 2);
  assert.ok(calls[1].url.includes("cursor=c1"));
  assert.ok(!calls[0].url.includes("cursor="));
});

test("a failed page keeps the rows already loaded and sets a friendly error", async () => {
  resetStore();
  await withBridge((call) => (call.url.includes("cursor=c1") ? { status: 500, body: { code: "boom" } } : pages(call)), async () => {
    await useAdminUsersStore.getState().reload();
    await useAdminUsersStore.getState().loadMore();
  });
  const state = useAdminUsersStore.getState();
  assert.deepEqual(state.users.map((user) => user.userId), [A]);
  assert.equal(state.nextCursor, "c1");
  assert.ok(state.error && !state.error.includes("boom"));
});

test("the store never keeps an email the route should not have sent", async () => {
  resetStore();
  await withBridge(pages, () => useAdminUsersStore.getState().reload());
  assert.ok(!JSON.stringify(useAdminUsersStore.getState().users).includes("@"));
});

test("saveUser sends only the two editable fields, then re-reads the user", async () => {
  resetStore();
  await withBridge(pages, () => useAdminUsersStore.getState().reload());
  const calls = await withBridge((call) => (call.method === "PATCH"
    ? { body: { ok: true, user: row(A, "Anna") } }
    : { body: { ok: true, user: row(A, "Anna Re-read"), roles: ["admin"] } }), async () => {
    await useAdminUsersStore.getState().saveUser(A, { displayName: "Anna", directoryOptOut: true, role: "admin" } as never);
  });
  assert.deepEqual(calls.map((call) => call.method), ["PATCH", "GET"]);
  assert.deepEqual(Object.keys(calls[0].body ?? {}).sort(), ["directoryOptOut", "displayName"]);
  assert.ok(calls[1].url.endsWith(`/api/account/admin/users/${A}`));
  const stored = useAdminUsersStore.getState();
  assert.equal(stored.users[0].displayName, "Anna Re-read");
  assert.deepEqual(stored.roles[A], ["admin"]);
});

test("changeRole grants and revokes through the roles route, then re-reads", async () => {
  resetStore();
  await withBridge(pages, () => useAdminUsersStore.getState().reload());
  const calls = await withBridge((call) => (call.method === "PUT"
    ? { body: { ok: true, roles: ["moderator"] } }
    : { body: { ok: true, user: row(A, "Ann"), roles: ["moderator"] } }), async () => {
    await useAdminUsersStore.getState().changeRole(A, "moderator", "grant");
  });
  assert.equal(calls[0].method, "PUT");
  assert.ok(calls[0].url.endsWith(`/api/account/admin/users/${A}/roles`));
  assert.deepEqual(calls[0].body, { role: "moderator", action: "grant" });
  assert.equal(calls[1].method, "GET");
  assert.deepEqual(useAdminUsersStore.getState().roles[A], ["moderator"]);
});

test("a refused write sets a row error in friendly copy and leaves the row alone", async () => {
  resetStore();
  await withBridge(pages, () => useAdminUsersStore.getState().reload());
  await withBridge(() => ({ status: 422, body: { code: "self_role_change" } }), () => useAdminUsersStore.getState().changeRole(A, "admin", "revoke"));
  const message = useAdminUsersStore.getState().rowErrors[A];
  assert.match(message, /your own admin role/i);
  assert.ok(!message.includes("self_role_change"));
});

const CODES = ["admin_required", "invalid_cursor", "field_not_editable", "invalid_role", "self_role_change", "audit_unavailable", "platform_roles_unavailable", "rate_limited"];

test("every bridge code has its own friendly copy and the raw code is never shown", () => {
  const seen = new Set<string>();
  for (const code of CODES) {
    const copy = adminUsersErrorCopy(Object.assign(new Error(`raw ${code}`), { status: code === "rate_limited" ? 429 : 400, code }));
    assert.ok(!copy.includes(code) && !copy.includes("_"), code);
    seen.add(copy);
  }
  assert.equal(seen.size, CODES.length);
  assert.ok(!adminUsersErrorCopy(new Error("TypeError: x is undefined")).includes("TypeError"));
});

const view = (props: Partial<React.ComponentProps<typeof UsersPanelView>> = {}) =>
  renderToStaticMarkup(React.createElement(UsersPanelView, {
    users: [], roles: {}, loading: false, loaded: true, error: null, hasMore: false, rowErrors: {}, busyUserId: null,
    onRetry: () => undefined, onLoadMore: () => undefined, onOpen: () => undefined,
    onSave: () => undefined, onRole: () => undefined, ...props,
  }));

test("the panel renders the empty, loading, error and populated states", () => {
  assert.match(view(), /No user yet/);
  assert.match(view({ loading: true, loaded: false }), /Loading/);
  assert.match(view({ loaded: true, error: "Try again." }), /Try again\./);
  const populated = view({ users: [row(A, "Ann"), row(B, "Bea")] as never, roles: { [A]: ["admin"] }, hasMore: true });
  assert.match(populated, /Ann/);
  assert.match(populated, /Load more/);
  assert.doesNotMatch(view({ users: [row(A, "Ann")] as never }), /Load more/);
});

test("the rendered panel never contains an email", () => {
  assert.doesNotMatch(view({ users: [row(A, "Ann"), row(B, "Bea")] as never }), /@|leak\.test/);
});
