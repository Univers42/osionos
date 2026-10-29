/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   moderation-console.test.ts                          :+:      :+:    :+:   */
/*                                                    +#+ +#+         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 18:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 18:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The client's half of the moderation console: the request each function
 * sends, and what it answers.
 *
 * The api client is stubbed (the canvas tests' idiom — the real one reads
 * `import.meta.env`, which only Vite defines).
 */

import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const CLIENT_STUB = `
export const API_BASE = "http://bridge.test";
export function getActivePageJwt() { return "jwt"; }
async function send(method, path, body) {
  const res = await globalThis.__modFetch(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new Error(errorBody?.message ?? (method + " " + path + " failed"));
  }
  if (res.status === 204) return undefined;
  return res.json();
}
export const api = {
  get: (path) => send("GET", path, undefined),
  post: (path, body) => send("POST", path, body),
};
`;
const url = (code: string): string => `data:text/javascript,${encodeURIComponent(code)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/shared/api/client") return { url: url(CLIENT_STUB), shortCircuit: true };
    const resolved = nextResolve(specifier, context);
    if (resolved.url.endsWith("/src/shared/api/client.ts")) return { url: url(CLIENT_STUB), shortCircuit: true };
    return resolved;
  },
});

const { decide, fetchItem, fetchQueue } = await import("@/widgets/admin-space/api/moderationClient");

interface Recorded {
  method: string;
  path: string;
  body?: unknown;
}

const recorded: Recorded[] = [];
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

/** The bridge's answer: what the console asks for. */
Reflect.set(globalThis, "__modFetch", async (path: string, init: { method: string; body?: string }) => {
  const body = init.body ? JSON.parse(init.body) : undefined;
  recorded.push({ path, method: init.method, body });
  if (path.startsWith("/api/admin/moderation/queue")) {
    return json({
      reports: [{ id: "report-1", reporterId: "user-1", subjectKind: "feed_comment", subjectId: "comment-1", category: "spam", status: "open" }],
      held: [{ subjectKind: "feed_comment", id: "comment-1", authorId: "user-2", createdAt: "2026-10-22T00:00:00.000Z", audit: { layer: "l0", action: "hold", reason: "links", scores: { verdict: "hold" } } }],
    });
  }
  if (path.startsWith("/api/admin/moderation/item")) {
    return json({ content: "a held comment", state: "held", authorId: "user-2", createdAt: "2026-10-22T00:00:00.000Z", audit: [] });
  }
  return json({ ok: true }, 200);
});

test("fetchQueue asks the bridge for the queue", async () => {
  const queue = await fetchQueue();
  assert.equal(recorded.length, 1);
  assert.deepEqual(recorded[0], { method: "GET", path: "/api/admin/moderation/queue", body: undefined });
  assert.equal(queue.held.length, 1);
  assert.equal(queue.held[0].id, "comment-1");
  assert.equal(queue.reports.length, 1);
  assert.equal(queue.reports[0].reporterId, "user-1");
});

test("fetchItem asks for the content of one comment", async () => {
  const item = await fetchItem("feed_comment", "comment-1");
  const call = recorded[recorded.length - 1];
  assert.equal(call.method, "GET");
  assert.equal(call.path, "/api/admin/moderation/item?kind=feed_comment&id=comment-1");
  assert.equal(item.content, "a held comment");
  assert.equal(item.state, "held");
  assert.deepEqual(item.audit, []);
});

test("decide posts the decision, its subject and its reason", async () => {
  await decide({ kind: "feed_comment", id: "comment-1", decision: "hide", reason: "spam" });
  const call = recorded[recorded.length - 1];
  assert.equal(call.method, "POST");
  assert.equal(call.path, "/api/admin/moderation/decision");
  assert.deepEqual(call.body, { kind: "feed_comment", id: "comment-1", decision: "hide", reason: "spam" });
});

test("a decision on a report says so", async () => {
  await decide({ kind: "report", id: "report-1", decision: "dismiss" });
  const call = recorded[recorded.length - 1];
  assert.equal(call.method, "POST");
  assert.deepEqual(call.body, { kind: "report", id: "report-1", decision: "dismiss" });
});

test("a call that fails is a failure, never a fake success", async () => {
  Reflect.set(globalThis, "__modFetch", async () => json({ ok: false, message: "Administrator access required." }, 403));
  await assert.rejects(() => fetchQueue(), /Administrator access required/);
});
