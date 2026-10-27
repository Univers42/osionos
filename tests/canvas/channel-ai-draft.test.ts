/**
 * The "@AI" draft of a text channel (C429, C453): the first ask stops at the
 * notice and sends nothing; an accepted ask streams the run into a draft only
 * the asker sees; Post sends the run id and nothing else; Discard stops the run.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { createAiDraftStore, mentionsAi, type AiDraftDeps } from "@/widgets/channel-messages/model/aiAnswerDraft";
import type { ChatMessage } from "@/shared/chat/messageApi";

const CHANNEL = "c0000000-0000-4000-8000-000000000001";
const TRIGGER = "m0000000-0000-4000-8000-000000000001";
const USER = "u0000000-0000-4000-8000-000000000001";

function frame(id: string, event: string, data: unknown): string {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function streamResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const one of frames) controller.enqueue(encoder.encode(one));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const ANSWERED = [
  frame("1", "run.started", {}),
  frame("2", "text.delta", { text: "Friday " }),
  frame("3", "text.delta", { text: "it is." }),
  frame("4", "done", {}),
];

interface Calls {
  threadRuns: { runId: string; conversationId: string; channelId: string; messageId: string }[];
  posts: { channelId: string; runId: string }[];
  cancels: string[];
}

function world(options: { seen?: boolean; frames?: string[]; postError?: { code: string } } = {}) {
  const calls: Calls = { threadRuns: [], posts: [], cancels: [] };
  let seen = options.seen ?? false;
  let ids = 0;
  const deps: AiDraftDeps = {
    createConversation: async () => ({ id: "conv-1" }),
    startThreadRun: async (input) => {
      calls.threadRuns.push(input);
      return streamResponse(options.frames ?? ANSWERED);
    },
    resumeRun: async () => streamResponse([frame("9", "done", {})]),
    cancelRun: async (runId) => {
      calls.cancels.push(runId);
    },
    postAiAnswer: async (channelId, runId) => {
      calls.posts.push({ channelId, runId });
      if (options.postError) throw options.postError;
      return { id: "posted-1", content: "Friday it is.", isAi: true } as ChatMessage;
    },
    noticeSeen: () => seen,
    markNoticeSeen: () => {
      seen = true;
    },
    newId: () => `run-${(ids += 1)}`,
  };
  const store = createAiDraftStore(deps);
  const ask = () => store.getState().ask({ channelId: CHANNEL, workspaceId: "ws", channelName: "general", triggerId: TRIGGER, userId: USER });
  const settled = async () => {
    for (let index = 0; index < 50 && ["drafting", "posting"].includes(store.getState().drafts[CHANNEL]?.status ?? ""); index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  };
  return { store, calls, ask, settled, seen: () => seen };
}

test("mentionsAi matches @ai as a word only", () => {
  for (const text of ["@ai what now?", "hey @AI", "(@ai)", "@ai, please"]) assert.equal(mentionsAi(text), true, text);
  for (const text of ["@aida", "ask @ai-bot", "mail@ai.com", "no mention", "@@ai"]) assert.equal(mentionsAi(text), false, text);
});

test("the first ask shows the notice and sends nothing until the user goes on (C453)", async () => {
  const w = world();
  w.ask();
  assert.equal(w.store.getState().drafts[CHANNEL]?.status, "notice");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(w.calls.threadRuns, []);
  w.store.getState().accept(CHANNEL);
  await w.settled();
  assert.equal(w.seen(), true);
  assert.equal(w.calls.threadRuns.length, 1);
});

test("an accepted ask streams the draft and names only the run, the conversation, the channel and the trigger", async () => {
  const w = world({ seen: true });
  w.ask();
  await w.settled();
  assert.deepEqual(w.store.getState().drafts[CHANNEL], { triggerId: TRIGGER, status: "ready", text: "Friday it is.", code: null });
  assert.deepEqual(w.calls.threadRuns, [{ runId: "run-1", conversationId: "conv-1", channelId: CHANNEL, messageId: TRIGGER }]);
});

test("Post sends the run id, and the draft is gone once posted", async () => {
  const w = world({ seen: true });
  w.ask();
  await w.settled();
  const message = await w.store.getState().post(CHANNEL);
  assert.equal(message?.id, "posted-1");
  assert.deepEqual(w.calls.posts, [{ channelId: CHANNEL, runId: "run-1" }]);
  assert.equal(w.store.getState().drafts[CHANNEL], undefined);
});

test("a refused post keeps the draft with its reason; an already-posted one goes", async () => {
  const blocked = world({ seen: true, postError: { code: "answer_blocked" } });
  blocked.ask();
  await blocked.settled();
  assert.equal(await blocked.store.getState().post(CHANNEL), null);
  assert.deepEqual(
    { status: blocked.store.getState().drafts[CHANNEL]?.status, code: blocked.store.getState().drafts[CHANNEL]?.code },
    { status: "error", code: "answer_blocked" },
  );
  const twice = world({ seen: true, postError: { code: "already_posted" } });
  twice.ask();
  await twice.settled();
  await twice.store.getState().post(CHANNEL);
  assert.equal(twice.store.getState().drafts[CHANNEL], undefined);
});

test("a run that fails is an error the user can draft again, with a NEW run id", async () => {
  const w = world({ seen: true, frames: [frame("1", "error", { code: "rate_limited" })] });
  w.ask();
  await w.settled();
  assert.equal(w.store.getState().drafts[CHANNEL]?.code, "rate_limited");
  assert.equal(await w.store.getState().post(CHANNEL), null, "an error is never posted");
  w.store.getState().retry(CHANNEL);
  await w.settled();
  assert.deepEqual(w.calls.threadRuns.map((call) => call.runId), ["run-1", "run-2"]);
  assert.deepEqual(w.calls.posts, []);
});

test("Discard stops a run still drafting and forgets it", async () => {
  const w = world({ seen: true });
  w.ask();
  w.store.getState().discard(CHANNEL);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(w.store.getState().drafts[CHANNEL], undefined);
  assert.equal(await w.store.getState().post(CHANNEL), null);
});
