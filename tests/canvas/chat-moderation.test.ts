/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   chat-moderation.test.ts                             :+:      :+:    :+:   */
/*                                                    +#+  :+:         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+   +#+           */
/*   Created: 2026/10/22 15:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 15:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * A channel message answers L0's warning.
 *
 * Two things are checked, and they are the two halves of the question L0 asks:
 *   1. the body carries the author's answer ONLY when the author gave one —
 *      a client that always sends `acknowledgeWarning: true` posts every
 *      message, warning or not;
 *   2. the answer is TYPED: a 409 warning comes back as the warning the
 *      screen shows, not as a swallowed failure. A warning wrote NOTHING, so
 *      the temp message the sender sees is dropped with it.
 *
 * The api client is stubbed the way the canvas tests stub it (the real one
 * reads `import.meta.env`, which only Vite defines). The stub builds its
 * error the way the real transport does: the envelope's message, code and
 * details.
 */

import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

import type { ChatMessage } from "@/shared/chat/messageApi";

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
  const res = await globalThis.__chatFetch(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
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

const { sendMessage, editMessage } = await import("@/shared/chat/messageApi");
const { sendChannelMessage, editChannelMessage } = await import("@/widgets/channel-messages/model/channelWrites");

interface Recorded {
  path: string;
  method: string;
  body?: Record<string, unknown>;
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

/** What the bridge answers, per call. The test says. */
let respond: (path: string, method: string, body?: Record<string, unknown>) => Response = () =>
  json({ ok: true }, 200);

Reflect.set(globalThis, "__chatFetch", async (path: string, init: { method: string; body?: string }) => {
  const body = init.body ? JSON.parse(init.body) : undefined;
  recorded.push({ path, method: init.method, body });
  return respond(path, init.method, body);
});

const last = (): Recorded => recorded[recorded.length - 1];

/** The list a write reconciles, the way the view keeps it. */
function sink() {
  const messages: ChatMessage[] = [];
  return {
    messages,
    setMessages: (updater: (messages: ChatMessage[]) => ChatMessage[]) => {
      const next = updater(messages);
      messages.length = 0;
      messages.push(...next);
    },
  };
}

const SERVER_ROW = {
  id: "m-1",
  channelId: "ch-1",
  authorId: "u-1",
  authorName: "Ana",
  content: "hello",
  createdAt: "2026-10-22T00:00:00.000Z",
  reactions: [],
};

test("sendMessage asks without the answer: the body carries no acknowledgeWarning", async () => {
  respond = () => json({ ok: true, message: SERVER_ROW }, 201);
  await sendMessage("ch-1", "hello");
  assert.equal(last().path, "/api/chat/channels/ch-1/messages");
  assert.deepEqual(last().body, { content: "hello" });
});

test("sendMessage carries the answer when the author says post anyway", async () => {
  respond = () => json({ ok: true, message: SERVER_ROW }, 201);
  await sendMessage("ch-1", "hello", undefined, undefined, { acknowledgeWarning: true });
  assert.deepEqual(last().body, { content: "hello", acknowledgeWarning: true });
});

test("editMessage asks without the answer: the body carries no acknowledgeWarning", async () => {
  respond = () => json({ ok: true, message: SERVER_ROW }, 200);
  await editMessage("m-1", "edited");
  assert.equal(last().path, "/api/chat/messages/m-1");
  assert.deepEqual(last().body, { content: "edited" });
});

test("editMessage carries the answer when the author says save anyway", async () => {
  respond = () => json({ ok: true, message: SERVER_ROW }, 200);
  await editMessage("m-1", "edited", { acknowledgeWarning: true });
  assert.deepEqual(last().body, { content: "edited", acknowledgeWarning: true });
});

test("the send action answers a 409 with the warning, and the temp message is dropped", async () => {
  respond = () => json(WARNING_BODY, 409);
  const { messages, setMessages } = sink();
  const outcome = await sendChannelMessage(
    { channelId: "ch-1", userId: "u-1", userName: "Ana", setMessages },
    "risky",
  );
  assert.equal(outcome.ok, false);
  assert.ok(!outcome.ok && "warning" in outcome, "the answer is not a warning");
  assert.deepEqual(!outcome.ok && "warning" in outcome ? outcome.warning.terms : [], ["foul"]);
  assert.deepEqual(!outcome.ok && "warning" in outcome ? outcome.warning.reasons : [], ["blocklist"]);
  // L0 wrote nothing: the temp row the sender saw is gone.
  assert.deepEqual(messages.map((m) => m.id), []);
});

test("the send action answers a 500 without a warning", async () => {
  respond = () => json({ ok: false, message: "The bridge is down." }, 500);
  const { messages, setMessages } = sink();
  const outcome = await sendChannelMessage(
    { channelId: "ch-1", userId: "u-1", userName: "Ana", setMessages },
    "hello",
  );
  assert.equal(outcome.ok, false);
  assert.ok(!outcome.ok && !("warning" in outcome), "the answer carries a warning");
  assert.deepEqual(messages.map((m) => m.id), []);
});

test("the send action answers a 201 with the server row, and the temp message is replaced", async () => {
  respond = () => json({ ok: true, message: SERVER_ROW }, 201);
  const { messages, setMessages } = sink();
  const outcome = await sendChannelMessage(
    { channelId: "ch-1", userId: "u-1", userName: "Ana", setMessages },
    "hello",
  );
  assert.equal(outcome.ok, true);
  assert.deepEqual(messages.map((m) => m.id), ["m-1"]);
  assert.equal(messages[0].content, "hello");
});

test("the edit action answers a 409 with the warning, and the message keeps its text", async () => {
  respond = () => json(WARNING_BODY, 409);
  const { messages, setMessages } = sink();
  messages.push({ ...SERVER_ROW });
  const outcome = await editChannelMessage(setMessages, "m-1", "edited");
  assert.equal(outcome.ok, false);
  assert.ok(!outcome.ok && "warning" in outcome, "the answer is not a warning");
  assert.deepEqual(!outcome.ok && "warning" in outcome ? outcome.warning.terms : [], ["foul"]);
  // The author's edit is not lost: the message still carries its text.
  assert.equal(messages[0].content, "hello");
});

test("the edit action answers a 200 with the edited message", async () => {
  respond = () => json({ ok: true, message: { ...SERVER_ROW, content: "edited" } }, 200);
  const { messages, setMessages } = sink();
  messages.push({ ...SERVER_ROW });
  const outcome = await editChannelMessage(setMessages, "m-1", "edited");
  assert.equal(outcome.ok, true);
  assert.equal(messages[0].content, "edited");
});
