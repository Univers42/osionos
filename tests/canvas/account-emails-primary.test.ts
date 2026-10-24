/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   account-emails-primary.test.ts                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// F-3b2 client: make-primary posts to the row's /primary route with the app-session token, re-reads
// on 200, routes a sudo refusal like remove, and the list offers it on a verified secondary only.

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import "./support/stub-bridge.ts";
import { memory } from "./support/emails-env.ts";

const { useAccountEmailsStore } = await import("../../src/store/settings/useAccountEmailsStore.ts");
const { EmailManagerBody } = await import("../../src/features/settings/profile/EmailManagerBody.tsx");
const { makePrimaryQuestion, madePrimaryNotice } = await import("../../src/features/settings/profile/emailCopy.ts");

const stamp = "2026-10-01T00:00:00Z";
const record = (id: string, email: string, isPrimary: boolean, verifiedAt: string | null) =>
  ({ _id: id, userId: "u1", email, isPrimary, verifiedAt, createdAt: stamp, updatedAt: stamp, removedAt: null });
const PRIMARY = record("primary-u1", "me@example.com", true, stamp);
const PENDING = record("row-1", "pending@example.com", false, null);
const VERIFIED = record("row-2", "verified@example.com", false, stamp);

type Seen = { url: string; method: string; auth: string };

async function recording(answer: (call: Seen) => { status?: number; body: unknown }, run: () => Promise<void>): Promise<Seen[]> {
  const original = globalThis.fetch;
  const seen: Seen[] = [];
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const call = { url: String(input), method: init?.method ?? "GET", auth: JSON.stringify(init?.headers ?? {}) };
    seen.push(call);
    const { status = 200, body } = answer(call);
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try { await run(); } finally { globalThis.fetch = original; }
  return seen;
}

function reset() {
  memory.clear();
  useAccountEmailsStore.setState({ data: [PRIMARY, VERIFIED], loading: false, error: null });
}

test("M1 makePrimary posts to the row's /primary route with the session token, then re-reads", async () => {
  reset();
  const seen = await recording((call) => (call.method === "GET" ? { body: [VERIFIED, record("row-3", "me@example.com", false, stamp)].map((row, index) => ({ ...row, isPrimary: index === 0 })) } : { body: { previous: "row-3" } }), async () => {
    await useAccountEmailsStore.getState().hydrate("u1", "me@example.com");
    const outcome = await useAccountEmailsStore.getState().makePrimary("row-2");
    assert.deepEqual(outcome, { ok: true, data: { previous: "row-3" } });
    assert.deepEqual(useAccountEmailsStore.getState().data.map((row) => [row._id, row.isPrimary]), [["row-2", true], ["row-3", false]]);
  });
  const post = seen.find((call) => call.method === "POST");
  assert.ok(post?.url.endsWith("/api/account/emails/row-2/primary"), JSON.stringify(seen));
  assert.match(post.auth, /osionos_v1\.tok/);
  assert.deepEqual(seen.map((call) => call.method), ["GET", "POST", "GET"]);
});

test("M2 a sudo refusal is typed like remove's, and nothing is re-read", async () => {
  reset();
  const seen = await recording(() => ({ status: 403, body: { code: "sudo_required" } }), async () => {
    const primary = await useAccountEmailsStore.getState().makePrimary("row-2");
    const removal = await useAccountEmailsStore.getState().remove("row-2");
    assert.deepEqual(primary, { ok: false, reason: "sudo_required" });
    assert.deepEqual(primary, removal);
  });
  assert.equal(seen.filter((call) => call.method === "POST").length, 1);
});

test("M3 the control exists on a verified secondary only, and the confirm names both addresses", () => {
  const noop = () => undefined;
  const view = (extra: Record<string, unknown>) => renderToStaticMarkup(React.createElement(EmailManagerBody, {
    records: [PRIMARY, PENDING, VERIFIED], loading: false, loadError: null, busy: false, confirmingId: null, primaryConfirmingId: null,
    problem: "", notice: "", needsSudo: false, canRetry: false, onTryAgain: noop, onReload: noop, onAdd: async () => true,
    onVerify: noop, onResend: noop, onRemove: noop, onConfirmRemove: noop, onKeep: noop, onMakePrimary: noop, onConfirmPrimary: noop, onKeepPrimary: noop,
    ...extra,
  }));
  const html = view({});
  assert.equal(html.match(/aria-label="Make [^"]+ primary"/g)?.length, 1, html);
  assert.match(html, /aria-label="Make verified@example\.com primary"/);
  assert.doesNotMatch(html, /Make (me|pending)@example\.com primary/);
  const confirming = view({ primaryConfirmingId: "row-2" });
  assert.ok(confirming.includes(makePrimaryQuestion("verified@example.com", "me@example.com").replace(/'/g, "&#x27;")), confirming);
  assert.match(madePrimaryNotice("a@b.co", false), /old address was not kept/);
  assert.doesNotMatch(madePrimaryNotice("a@b.co", true), /not kept/);
});
