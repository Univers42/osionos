/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   account-emails-client.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// F-3b client: the store never invents a row, never persists a secondary, keeps this user's
// fetched rows when a refresh fails, and the manager says what the server said.

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { withBridge, type Reply } from "./support/stub-bridge.ts";

import { memory } from "./support/emails-env.ts";

const { useAccountEmailsStore } = await import("../../src/store/settings/useAccountEmailsStore.ts");
const { emailProblem, NOT_ON_SERVER, TEMPORARILY_DOWN, maskEmail } = await import("../../src/features/settings/profile/emailCopy.ts");
const { EmailManagerBody } = await import("../../src/features/settings/profile/EmailManagerBody.tsx");

const KEY = "osionos:settings:account-emails";
const stamp = "2026-10-01T00:00:00Z";
const record = (userId: string, id: string, email: string, isPrimary: boolean, verifiedAt: string | null) =>
  ({ _id: id, userId, email, isPrimary, verifiedAt, createdAt: stamp, updatedAt: stamp, removedAt: null });
const PRIMARY = record("u1", "primary-u1", "me@example.com", true, stamp);
const PENDING = record("u1", "row-1", "other@example.com", false, null);
const VERIFIED = { ...PENDING, verifiedAt: stamp };

function reset() {
  memory.clear();
  useAccountEmailsStore.setState({ data: [], loading: false, error: null });
}

const listing = (rows: unknown[]) => (call: { method: string }): Reply => (call.method === "GET" ? { body: rows } : { status: 202, body: { id: "row-1", sentTo: "o•••@e•••.com" } });

test("C1 a refused add leaves data untouched and does not re-read", async () => {
  reset();
  const calls = await withBridge(() => ({ status: 422, body: { code: "invalid_email", message: "no" } }), async () => {
    useAccountEmailsStore.setState({ data: [PRIMARY] });
    const outcome = await useAccountEmailsStore.getState().add("nope");
    assert.equal(outcome.ok, false);
    assert.deepEqual(useAccountEmailsStore.getState().data, [PRIMARY]);
  });
  assert.deepEqual(calls.map((call) => call.method), ["POST"]);
});

test("C2 a successful add reads the list again and shows what the server returned", async () => {
  reset();
  const calls = await withBridge(listing([PRIMARY, PENDING]), async () => {
    await useAccountEmailsStore.getState().hydrate("u1", "me@example.com");
    const outcome = await useAccountEmailsStore.getState().add("other@example.com");
    assert.equal(outcome.ok, true);
    assert.deepEqual(useAccountEmailsStore.getState().data.map((row) => row._id), ["primary-u1", "row-1"]);
  });
  assert.deepEqual(calls.map((call) => call.method), ["GET", "POST", "GET"]);
});

test("C3 another user's rows are gone when a different user hydrates, even if the read fails", async () => {
  reset();
  useAccountEmailsStore.setState({ data: [PRIMARY, PENDING] });
  await withBridge(() => ({ status: 500, body: { code: "boom" } }), async () => {
    await useAccountEmailsStore.getState().hydrate("u2", "two@example.com");
  });
  const { data } = useAccountEmailsStore.getState();
  assert.ok(data.every((row) => row.userId === "u2"), JSON.stringify(data));
});

test("C7 localStorage holds the primary and no secondary", async () => {
  reset();
  await withBridge(listing([PRIMARY, PENDING, { ...VERIFIED, _id: "row-2" }]), async () => {
    await useAccountEmailsStore.getState().hydrate("u1", "me@example.com");
  });
  const stored = JSON.parse(memory.get(KEY) ?? "{}") as { state: { data: Array<{ _id: string }> } };
  assert.deepEqual(stored.state.data.map((row) => row._id), ["primary-u1"]);
  assert.equal(useAccountEmailsStore.getState().data.length, 3);
});

test("C8 a failed refresh keeps this user's secondaries and sets the error", async () => {
  reset();
  await withBridge(listing([PRIMARY, PENDING]), async () => {
    await useAccountEmailsStore.getState().hydrate("u1", "me@example.com");
  });
  await withBridge(() => ({ status: 500, body: { code: "boom" } }), async () => {
    await useAccountEmailsStore.getState().hydrate("u1", "me@example.com");
  });
  const { data, error } = useAccountEmailsStore.getState();
  assert.deepEqual(data.map((row) => row._id), ["primary-u1", "row-1"]);
  assert.ok(error);
});

const OUTAGES: Array<[string, number, Record<string, unknown>, string]> = [
  ["503 email_unavailable", 503, { code: "email_unavailable" }, TEMPORARILY_DOWN],
  ["404 without a code", 404, {}, NOT_ON_SERVER],
  ["501", 501, {}, NOT_ON_SERVER],
];

for (const [label, status, body, copy] of OUTAGES) {
  test(`C9 ${label} reads "${copy}" through the real classifier`, async () => {
    reset();
    useAccountEmailsStore.setState({ data: [PRIMARY] });
    await withBridge(() => ({ status, body }), async () => {
      const outcome = await useAccountEmailsStore.getState().add("a@b.co");
      assert.ok(!outcome.ok);
      assert.equal(emailProblem(outcome), copy);
    });
  });
}

test("C5 a sudo refusal is typed, and the manager offers Try again only after a grant", async () => {
  reset();
  await withBridge(() => ({ status: 403, body: { code: "sudo_required" } }), async () => {
    const outcome = await useAccountEmailsStore.getState().remove("row-1");
    assert.deepEqual(outcome, { ok: false, reason: "sudo_required" });
  });
  const base = { records: [PRIMARY], loading: false, loadError: null, busy: false, confirmingId: null, problem: "", notice: "", needsSudo: true } as const;
  const noop = () => undefined;
  const view = (canRetry: boolean) => renderToStaticMarkup(React.createElement(EmailManagerBody, {
    ...base, canRetry, onTryAgain: noop, onReload: noop, onAdd: async () => true, onVerify: noop, onResend: noop, onRemove: noop, onConfirmRemove: noop, onKeep: noop,
  }));
  assert.match(view(false), /Confirm it&#x27;s you first, then press Try again\./);
  assert.match(view(false), /disabled=""[^>]*>Try again</);
  assert.doesNotMatch(view(true), /disabled=""[^>]*>Try again</);
});

const STATES: Array<[string, Record<string, unknown>, RegExp[], RegExp[]]> = [
  ["loading", { loading: true, records: [] }, [/aria-busy="true"/], [/No other addresses/]],
  ["empty", { records: [PRIMARY] }, [/No other addresses/, />Primary</], [/aria-busy/]],
  ["error", { records: [PRIMARY], loadError: "Settings request failed." }, [/role="alert"[^>]*>.*Settings request failed\./, />Retry</], []],
  ["pending row", { records: [PRIMARY, PENDING] }, [/>Not verified</, /Resend code/, /maxLength="6"/, /one-time-code/, /Wait a few minutes, then Resend/, /sign-in code/, />Cancel</], [/>Verified</, /Make primary/]],
  ["verified row", { records: [PRIMARY, VERIFIED] }, [/>Verified</, />Remove</, />Make primary</], [/Not verified/]],
];

for (const [label, props, present, absent] of STATES) {
  test(`C4 C6 the manager in its ${label} state`, () => {
    const noop = () => undefined;
    const html = renderToStaticMarkup(React.createElement(EmailManagerBody, {
      loading: false, loadError: null, busy: false, confirmingId: null, problem: "", notice: "", needsSudo: false, canRetry: false,
      onTryAgain: noop, onReload: noop, onAdd: async () => true, onVerify: noop, onResend: noop, onRemove: noop, onConfirmRemove: noop, onKeep: noop,
      records: [], ...props,
    } as never));
    for (const pattern of present) assert.match(html, pattern);
    for (const pattern of absent) assert.doesNotMatch(html, pattern);
    assert.match(html, /Extra addresses are kept on your account\. You can&#x27;t sign in with them yet\./);
  });
}

test("the remove confirm names the masked address", () => {
  assert.equal(maskEmail("dylan@gmail.com"), "d•••@g•••.com");
});
