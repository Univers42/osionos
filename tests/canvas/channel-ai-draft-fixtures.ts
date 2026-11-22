/**
 * A fake world for the "@AI" draft store: canned SSE runs, a post route that
 * answers each call from a script, and the consent a user already gave, by
 * (user, autopost). No server, no React.
 */

import { createAiDraftStore, type AiDraftDeps } from "@/widgets/channel-messages/model/aiAnswerDraft";
import type { ChatMessage } from "@/shared/chat/messageApi";

export const CHANNEL = "c0000000-0000-4000-8000-000000000001";
export const TRIGGER = "m0000000-0000-4000-8000-000000000001";
export const USER = "u0000000-0000-4000-8000-000000000001";

export function frame(id: string, event: string, data: unknown): string {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function streamResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const one of frames) controller.enqueue(encoder.encode(one));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

export const ANSWERED = [
  frame("1", "run.started", {}),
  frame("2", "text.delta", { text: "Friday " }),
  frame("3", "text.delta", { text: "it is." }),
  frame("4", "done", {}),
];

export type ConsentMode = "draft" | "autopost";

export interface WorldOptions {
  /** The consents already given. */
  seen?: ConsentMode[];
  frames?: string[];
  /** One entry per post call: a refusal code, or null for a post that lands. */
  postOutcomes?: (string | null)[];
}

const modeOf = (autopost?: boolean): ConsentMode => (autopost === true ? "autopost" : "draft");

export function aiDraftWorld(options: WorldOptions = {}) {
  const seen = new Set<ConsentMode>(options.seen ?? []);
  const calls = {
    threadRuns: [] as { runId: string; conversationId: string; channelId: string; messageId: string }[],
    posts: [] as { channelId: string; runId: string }[],
    consents: [] as { userId: string; mode: ConsentMode }[],
    posted: [] as ChatMessage[],
    answering: [] as string[],
  };
  let ids = 0;
  const deps: AiDraftDeps = {
    createConversation: async () => ({ id: "conv-1" }),
    startThreadRun: async (input) => {
      calls.threadRuns.push(input);
      return streamResponse(options.frames ?? ANSWERED);
    },
    resumeRun: async () => streamResponse([frame("9", "done", {})]),
    cancelRun: async () => undefined,
    postAiAnswer: async (channelId, runId) => {
      calls.posts.push({ channelId, runId });
      const refusal = options.postOutcomes?.[calls.posts.length - 1] ?? null;
      if (refusal) throw { code: refusal };
      return { id: `posted-${calls.posts.length}`, content: "Friday it is.", isAi: true } as ChatMessage;
    },
    noticeSeen: (_userId: string, autopost?: boolean) => seen.has(modeOf(autopost)),
    markNoticeSeen: (userId: string, autopost?: boolean) => {
      seen.add(modeOf(autopost));
      calls.consents.push({ userId, mode: modeOf(autopost) });
    },
    newId: () => `run-${(ids += 1)}`,
    answering: (channelId: string) => {
      calls.answering.push(channelId);
    },
  };
  const store = createAiDraftStore(deps);
  const ask = (autopost: boolean) =>
    store.getState().ask({
      channelId: CHANNEL,
      workspaceId: "ws",
      channelName: "general",
      triggerId: TRIGGER,
      userId: USER,
      autopost,
      onPosted: (message: ChatMessage) => calls.posted.push(message),
    });
  const draft = () => store.getState().drafts[CHANNEL];
  const settled = async () => {
    for (let index = 0; index < 100 && ["drafting", "posting"].includes(draft()?.status ?? ""); index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  };
  return { store, calls, ask, draft, settled };
}
