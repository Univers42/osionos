/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   admin-audit-panel.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P3-4-g: the audit viewer. The store runs against a stubbed fetch; the panel is rendered to
// static markup in each state. Details are text: a hostile value must come out escaped.

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { withBridge, type Call, type Reply } from "./support/stub-bridge.ts";

const { useAuditStore } = await import("../../src/features/admin-audit/useAuditStore.ts");
const { AuditPanelView } = await import("../../src/widgets/admin-space/sections/audit/AuditPanel.tsx");
const { section } = await import("../../src/widgets/admin-space/sections/audit/section.ts");

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const event = (id: string, details: Record<string, unknown> = { field: "displayName" }) => ({
  id, createdAt: "2026-10-01T00:00:00Z", eventType: "admin_user_update", actorId: A, subject: A, provider: "osionos", details,
  ip_hash: "LEAK-HASH",
});

const reset = () => useAuditStore.setState({ events: [], nextCursor: null, loading: false, loaded: false, error: null });

const pages = (call: Call): Reply =>
  call.url.includes("cursor=c1")
    ? { body: { ok: true, events: [event("e2")], nextCursor: null } }
    : { body: { ok: true, events: [event("e1")], nextCursor: "c1" } };

test("the section is the admin-only Audit entry", () => {
  assert.equal(section.id, "audit");
  assert.equal(section.requiredRole, "admin");
});

test("loadMore appends the second page, sends the cursor, and stops when there is none", async () => {
  reset();
  const calls = await withBridge(pages, async () => {
    await useAuditStore.getState().reload();
    await useAuditStore.getState().loadMore();
    assert.deepEqual(useAuditStore.getState().events.map((e) => e.id), ["e1", "e2"]);
    assert.equal(useAuditStore.getState().nextCursor, null);
    await useAuditStore.getState().loadMore();
  });
  assert.equal(calls.length, 2);
  assert.ok(calls[1].url.includes("cursor=c1"));
  assert.ok(!calls[0].url.includes("cursor="));
});

test("a failed page keeps the rows and sets friendly copy without the raw code", async () => {
  reset();
  await withBridge((call) => (call.url.includes("cursor=c1") ? { status: 403, body: { code: "admin_required" } } : pages(call)), async () => {
    await useAuditStore.getState().reload();
    await useAuditStore.getState().loadMore();
  });
  const state = useAuditStore.getState();
  assert.equal(state.events.length, 1);
  assert.ok(state.error && !state.error.includes("admin_required") && !state.error.includes("_"));
});

test("the store keeps only the allowlisted fields", async () => {
  reset();
  await withBridge(pages, () => useAuditStore.getState().reload());
  assert.ok(!JSON.stringify(useAuditStore.getState().events).includes("LEAK-HASH"));
});

const view = (props: Partial<React.ComponentProps<typeof AuditPanelView>> = {}) =>
  renderToStaticMarkup(React.createElement(AuditPanelView, {
    events: [], loading: false, loaded: true, error: null, hasMore: false, onRetry: () => undefined, onLoadMore: () => undefined, ...props,
  }));

test("the panel renders the empty, loading, error and populated states", () => {
  assert.match(view(), /No audit event yet/);
  assert.match(view({ loading: true, loaded: false }), /Loading/);
  assert.match(view({ error: "Try again." }), /Try again\./);
  const populated = view({ events: [event("e1")] as never, hasMore: true });
  assert.match(populated, /admin_user_update/);
  assert.match(populated, /Load more/);
  assert.doesNotMatch(view({ events: [event("e1")] as never }), /Load more/);
});

test("details render as escaped key: value text, never as markup", () => {
  const html = view({ events: [event("e1", { note: "<img src=x onerror=alert(1)>", count: 3 })] as never });
  assert.match(html, /note: &lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /count: 3/);
  assert.doesNotMatch(html, /<img/);
});
