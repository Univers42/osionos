/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   comments-moderation.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 14:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 14:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/**
 * The client's half of the moderation gate: a 409 moderation_warning is a
 * TYPED answer the panel can show, not a thrown error the panel can only
 * apologize for.
 *
 * The api client is stubbed (the canvas tests' idiom — the real one reads
 * `import.meta.env`, which only Vite defines). The stub builds its error the
 * way the real transport does: the envelope's message, code and details.
 */

import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const CLIENT_STUB = `
export const API_BASE = "http://bridge.test";
export class ApiError extends Error {
  constructor(message, status, code = "API_ERROR", details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export function getActivePageJwt() { return "jwt"; }
async function send(method, path, body) {
  const res = await globalThis.__commentsFetch(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new ApiError(
      errorBody?.error ?? errorBody?.message ?? (method + " " + path + " failed"),
      res.status,
      errorBody?.code ?? "API_ERROR",
      errorBody?.details,
    );
  }
  if (res.status === 204) return undefined;
  return res.json();
}
export const api = {
  get: (path) => send("GET", path, undefined),
  post: (path, body) => send("POST", path, body),
  patch: (path, body) => send("PATCH", path, body),
  delete: (path) => send("DELETE", path, undefined),
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

const { postComment, patchComment } = await import("@/features/comments/api/commentsClient");

interface Recorded {
  path: string;
  method: string;
  body?: { content?: string; acknowledgeWarning?: boolean };
}

const recorded: Recorded[] = [];
const WARNING_BODY = {
  ok: false,
  code: "moderation_warning",
  message: "This may hurt someone. Edit it, or post it anyway.",
  reasons: ["blocklist"],
  terms: ["foul"],
  details: { reasons: ["blocklist"], terms: ["foul"] },
};
const json = (value: unknown, status: number) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

/** The bridge's answer: 409 while the author has not said "post it anyway". */
Reflect.set(globalThis, "__commentsFetch", async (path: string, init: { method: string; body?: string }) => {
  const body = init.body ? JSON.parse(init.body) : undefined;
  recorded.push({ path, method: init.method, body });
  const acknowledged = body?.acknowledgeWarning === true;
  if (!acknowledged) return json(WARNING_BODY, 409);
  return json({ ok: true, comment: { id: "comment-1", pageId: "page-1", blockId: null, authorId: "me", content: "hello", resolvedAt: null, createdAt: "2026-10-22T00:00:00.000Z", moderationState: "visible" } }, 200);
});

test("a 409 moderation warning is a typed answer, not a thrown error", async () => {
  const result = await postComment("page-1", "a rude comment");
  assert.equal(result.ok, false);
  assert.ok(!result.ok && "warning" in result, "the answer is not a warning");
  assert.ok(!result.ok && result.warning);
  assert.equal(!result.ok && result.warning.code, "moderation_warning");
  assert.equal(!result.ok && result.warning.message, "This may hurt someone. Edit it, or post it anyway.");
  assert.deepEqual(!result.ok && result.warning.reasons, ["blocklist"]);
  assert.deepEqual(!result.ok && result.warning.terms, ["foul"]);
});

test("the author may post it anyway: the second call carries acknowledgeWarning", async () => {
  const result = await postComment("page-1", "a rude comment", null, true);
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.comment);
  assert.equal(result.ok && result.comment?.moderationState, "visible");
  const last = recorded[recorded.length - 1];
  assert.equal(last.method, "POST");
  assert.equal(last.path, "/api/comments");
  assert.equal(last.body?.acknowledgeWarning, true);
  assert.equal(last.body?.content, "a rude comment");
});

test("a patch answers the warning the same way", async () => {
  const result = await patchComment("comment-1", { content: "a rude comment" });
  assert.equal(result.ok, false);
  assert.ok(!result.ok && "warning" in result, "the answer is not a warning");
  assert.deepEqual(!result.ok && "warning" in result ? result.warning.reasons : [], ["blocklist"]);
});
