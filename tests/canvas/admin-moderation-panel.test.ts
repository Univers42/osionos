/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   admin-moderation-panel.test.ts                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P3-4-f: the moderation queue panel. The store runs against a stubbed fetch; the panel is
// rendered to static markup in each state. The bridge decides, so the hostile stub adds a
// reporter email and the state and markup must still not carry it.

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { withBridge, type Call, type Reply } from "./support/stub-bridge.ts";

const { useModerationQueueStore } = await import("../../src/features/admin-moderation/useModerationQueueStore.ts");
const { moderationErrorCopy, MODERATION_CODES } = await import("../../src/features/admin-moderation/moderationCopy.ts");
const { ModerationPanelView } = await import("../../src/widgets/admin-space/sections/moderation/ModerationPanel.tsx");
const { BUILT_IN_SECTIONS } = await import("../../src/widgets/admin-space/model/adminSections.ts");

const T = "tttttttt-tttt-4ttt-8ttt-tttttttttttt";
const report = (id: string, extra: Record<string, unknown> = {}) => ({
  id, reporterId: "rrrrrrrr-rrrr-4rrr-8rrr-rrrrrrrrrrrr", reporterEmail: "reporter@leak.test", subjectUserId: T, subjectName: "Target Person",
  subjectKind: "user", subjectId: T, category: "spam", details: "bad", status: "open", decision: null, decisionUntil: null, createdAt: "2026-10-01T00:00:00Z", ...extra,
});

const reset = () => useModerationQueueStore.setState({
  reports: [], nextCursor: null, status: "open", loading: false, loaded: false, error: null, rowErrors: {}, busyId: null,
});

const queue = (call: Call): Reply =>
  call.url.includes("cursor=c1")
    ? { body: { ok: true, reports: [report("r2")], nextCursor: null } }
    : { body: { ok: true, reports: [report("r1")], nextCursor: "c1" } };

const in10Days = () => new Date(Date.now() + 10 * 86_400_000).toISOString();

test("the built-in Moderation entry is moderator-level and is the only one", () => {
  const entries = BUILT_IN_SECTIONS.filter((s) => s.id === "moderation");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].label, "Moderation");
  assert.equal(entries[0].requiredRole, "moderator");
});

test("reload sends the status, loadMore appends from the cursor, and the state keeps no reporter data", async () => {
  reset();
  const calls = await withBridge(queue, async () => {
    await useModerationQueueStore.getState().reload();
    await useModerationQueueStore.getState().loadMore();
    await useModerationQueueStore.getState().loadMore();
  });
  assert.deepEqual(useModerationQueueStore.getState().reports.map((r) => r.id), ["r1", "r2"]);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].url.includes("status=open") && !calls[0].url.includes("cursor="));
  assert.ok(calls[1].url.includes("cursor=c1"));
  const dump = JSON.stringify(useModerationQueueStore.getState());
  assert.ok(!dump.includes("leak.test") && !dump.includes("rrrrrrrr"));
});

test("decide posts the decision, then re-reads the queue and shows the server's rows, not a patch", async () => {
  reset();
  let reads = 0;
  const calls = await withBridge((call) => {
    if (call.method === "POST") return { body: { ok: true, reportId: "r1", decision: "warn", status: "resolved" } };
    reads += 1;
    return { body: { ok: true, reports: reads === 1 ? [report("r1")] : [report("r9", { subjectName: "Other" })], nextCursor: null } };
  }, async () => {
    await useModerationQueueStore.getState().reload();
    await useModerationQueueStore.getState().decide("r1", "warn");
  });
  assert.deepEqual(calls.map((c) => c.method), ["GET", "POST", "GET"]);
  assert.ok(calls[1].url.endsWith("/api/account/admin/reports/r1/decision"));
  assert.equal(calls[1].body?.decision, "warn");
  assert.deepEqual(useModerationQueueStore.getState().reports.map((r) => r.id), ["r9"]);
});

test("a refused decision (403 self_report) keeps the row, shows its own sentence, and does not re-read", async () => {
  reset();
  const calls = await withBridge((call) => (call.method === "POST" ? { status: 403, body: { code: "self_report" } } : queue(call)), async () => {
    await useModerationQueueStore.getState().reload();
    await useModerationQueueStore.getState().decide("r1", "ban");
  });
  const state = useModerationQueueStore.getState();
  assert.deepEqual(state.reports.map((r) => r.id), ["r1"]);
  assert.match(state.rowErrors.r1, /you filed/i);
  assert.ok(!state.rowErrors.r1.includes("self_report"));
  assert.deepEqual(calls.map((c) => c.method), ["GET", "POST"]);
});

test("a suspension without an end date, in the past or past 30 days is never sent", async () => {
  for (const until of [undefined, "", "not-a-date", new Date(Date.now() - 1000).toISOString(), new Date(Date.now() + 31 * 86_400_000).toISOString()]) {
    reset();
    const calls = await withBridge(queue, async () => {
      await useModerationQueueStore.getState().reload();
      await useModerationQueueStore.getState().decide("r1", "suspend", until);
    });
    assert.ok(!calls.some((c) => c.method === "POST"), `sent with until=${String(until)}`);
    assert.match(useModerationQueueStore.getState().rowErrors.r1, /end date/i);
  }
});

test("a suspension with an end date inside 30 days is sent with it; a ban sends none", async () => {
  reset();
  const calls = await withBridge((call) => (call.method === "POST" ? { body: { ok: true } } : queue(call)), async () => {
    await useModerationQueueStore.getState().reload();
    await useModerationQueueStore.getState().decide("r1", "suspend", in10Days());
    await useModerationQueueStore.getState().decide("r1", "ban", in10Days());
  });
  const posts = calls.filter((c) => c.method === "POST");
  assert.equal(typeof posts[0].body?.until, "string");
  assert.ok(!("until" in (posts[1].body ?? {})));
});

test("decision_saved_* says the decision WAS saved and the queue is re-read", async () => {
  for (const code of ["decision_saved_revoke_failed", "decision_saved_notify_failed"]) {
    reset();
    let reads = 0;
    const calls = await withBridge((call) => {
      if (call.method === "POST") return { status: 500, body: { code } };
      reads += 1;
      return { body: { ok: true, reports: [report(reads === 1 ? "r1" : "r5")], nextCursor: null } };
    }, async () => {
      await useModerationQueueStore.getState().reload();
      await useModerationQueueStore.getState().decide("r1", "ban");
    });
    assert.deepEqual(calls.map((c) => c.method), ["GET", "POST", "GET"], code);
    assert.deepEqual(useModerationQueueStore.getState().reports.map((r) => r.id), ["r5"]);
    assert.match(useModerationQueueStore.getState().rowErrors.r1, /was saved/i);
  }
});

test("every bridge code has its own sentence, never the raw code, and the saved ones claim a save", () => {
  const seen = new Set<string>();
  for (const code of MODERATION_CODES) {
    const text = moderationErrorCopy({ code, status: 400 });
    assert.ok(!text.includes(code), code);
    assert.ok(!seen.has(text), `duplicate sentence for ${code}`);
    seen.add(text);
  }
  assert.equal(MODERATION_CODES.length, 18);
  for (const code of ["decision_saved_revoke_failed", "decision_saved_notify_failed"]) {
    const text = moderationErrorCopy({ code });
    assert.match(text, /was saved/i);
    assert.doesNotMatch(text, /not saved|nothing (was|has been) (saved|changed)|wasn't saved/i);
  }
  assert.doesNotMatch(moderationErrorCopy(new Error("boom")), /boom/);
});

test("a failed load keeps the rows already shown and sets friendly copy", async () => {
  reset();
  await withBridge((call) => (call.url.includes("cursor=c1") ? { status: 403, body: { code: "moderator_required" } } : queue(call)), async () => {
    await useModerationQueueStore.getState().reload();
    await useModerationQueueStore.getState().loadMore();
  });
  const state = useModerationQueueStore.getState();
  assert.equal(state.reports.length, 1);
  assert.ok(state.error && !state.error.includes("moderator_required"));
});

test("setStatus re-reads the first page under the new status", async () => {
  reset();
  const calls = await withBridge(queue, () => useModerationQueueStore.getState().setStatus("resolved"));
  assert.ok(calls[0].url.includes("status=resolved"));
  assert.equal(useModerationQueueStore.getState().status, "resolved");
});

const view = (props: Partial<React.ComponentProps<typeof ModerationPanelView>> = {}) =>
  renderToStaticMarkup(React.createElement(ModerationPanelView, {
    reports: [], status: "open", loading: false, loaded: true, error: null, hasMore: false, rowErrors: {}, busyId: null,
    onStatus: () => undefined, onRetry: () => undefined, onLoadMore: () => undefined, onDecide: () => undefined, ...props,
  }));

test("the panel renders the empty, loading, error and populated states", () => {
  assert.match(view(), /No report/);
  assert.match(view({ loading: true, loaded: false }), /Loading/);
  assert.match(view({ error: "Try again." }), /role="alert"[\s\S]*Try again\./);
  const populated = view({ reports: [report("r1")] as never, hasMore: true });
  assert.match(populated, /Target Person/);
  assert.match(populated, /Load more/);
  assert.doesNotMatch(view({ reports: [report("r1")] as never }), /Load more/);
});

test("each report offers Warn, Suspend, Ban and Dismiss, one labelled date input capped at 30 days, and no email", () => {
  const html = view({ reports: [report("r1")] as never, rowErrors: { r1: "You cannot decide a report you filed." } });
  for (const name of ["Warn", "Suspend", "Ban", "Dismiss"]) assert.match(html, new RegExp(`>${name}<`));
  assert.equal((html.match(/type="date"/g) ?? []).length, 1);
  assert.match(html, /<label[^>]*>[^<]*Suspend until/);
  assert.match(html, /max="\d{4}-\d{2}-\d{2}"/);
  assert.match(html, /role="alert"[^>]*>You cannot decide/);
  assert.match(view(), /<label[^>]*>[^<]*Status/);
  assert.doesNotMatch(html, /leak\.test|reporter/i);
});
