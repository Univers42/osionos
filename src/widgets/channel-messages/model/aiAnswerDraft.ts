/**
 * "@AI" in a text channel (C429): the asker's private draft, from the notice
 * to the post. A message that mentions @ai starts a thread run on the AI
 * service; its answer streams into a card only the asker sees; their "Post"
 * asks the bridge to post the run's stored answer as the AI. Nothing reaches
 * the channel without that click.
 *
 * The first ask of a user stops at a notice (C453): the channel's recent
 * messages are about to go to the platform model, and the user says yes once.
 *
 * Pure: the caller brings the service calls and the storage, so the whole
 * flow is testable without a server and without React (useAiAnswerDraft.ts
 * wires the real ones).
 */

import { createStore } from "zustand/vanilla";

import type { StreamPayload } from "@osionos/http-gate";
import { streamRun } from "@/features/ai/model/runStream";
import type { ChatMessage } from "@/shared/chat/messageApi";

/** "@ai" as a word, in any case; "@aida" and "@ai-bot" are someone else. The service's rule. */
const AI_MENTION = /(^|[^\w@.-])@ai(?![\w-])/i;

export function mentionsAi(text: string): boolean {
  return AI_MENTION.test(text);
}

export type AiDraftStatus = "notice" | "drafting" | "ready" | "posting" | "error";

export interface AiDraft {
  triggerId: string;
  status: AiDraftStatus;
  text: string;
  /** The refusal or failure code of the last step, when it failed. */
  code: string | null;
}

export interface AiDraftDeps {
  createConversation: (input: { workspaceId: string; title?: string }) => Promise<{ id: string }>;
  startThreadRun: (
    input: { runId: string; conversationId: string; channelId: string; messageId: string },
    signal?: AbortSignal,
  ) => Promise<Response>;
  resumeRun: (runId: string, lastEventId?: string, signal?: AbortSignal) => Promise<Response>;
  cancelRun: (runId: string) => Promise<void>;
  postAiAnswer: (channelId: string, runId: string) => Promise<ChatMessage>;
  noticeSeen: (userId: string) => boolean;
  markNoticeSeen: (userId: string) => void;
  newId: () => string;
}

export interface AskInput {
  channelId: string;
  workspaceId: string;
  channelName: string;
  triggerId: string;
  userId: string;
}

export interface AiDraftState {
  /** The draft of each channel, by channel id: one at a time per channel. */
  drafts: Record<string, AiDraft>;
  /** A message mentioning @ai was sent: draft an answer, after the notice on first use. */
  ask: (input: AskInput) => void;
  /** The user read the notice and goes on. */
  accept: (channelId: string) => void;
  /** Drafts again, with a new run. */
  retry: (channelId: string) => void;
  /** Throws the draft away; a run still writing is stopped. */
  discard: (channelId: string) => void;
  /** Posts the ready draft; resolves to the posted message, or null when it was not posted. */
  post: (channelId: string) => Promise<ChatMessage | null>;
}

interface Session {
  input: AskInput;
  conversationId: string | null;
  runId: string | null;
  controller: AbortController | null;
}

function codeOf(value: unknown, fallback: string): string {
  const code = (value as { code?: unknown } | null)?.code;
  return typeof code === "string" && code ? code : fallback;
}

function deltaOf(data: StreamPayload): string {
  return typeof data.text === "string" ? data.text : "";
}

export function createAiDraftStore(deps: AiDraftDeps) {
  const sessions = new Map<string, Session>();

  return createStore<AiDraftState>((set, get) => {
    const setDraft = (channelId: string, draft: AiDraft): void => {
      set((state) => ({ drafts: { ...state.drafts, [channelId]: draft } }));
    };
    const removeDraft = (channelId: string): void => {
      set((state) => {
        const drafts = { ...state.drafts };
        delete drafts[channelId];
        return { drafts };
      });
    };
    const stop = (session: Session): void => {
      if (!session.controller || session.controller.signal.aborted) return;
      session.controller.abort();
      // The cancel is a courtesy: the run may already be over.
      if (session.runId) void deps.cancelRun(session.runId).catch(() => undefined);
    };

    const run = async (channelId: string): Promise<void> => {
      const session = sessions.get(channelId);
      if (!session) return;
      stop(session);
      const controller = new AbortController();
      // A NEW run id each time: a re-POST with the same one replays the old run.
      const runId = deps.newId();
      session.controller = controller;
      session.runId = runId;
      const { triggerId, workspaceId, channelName } = session.input;
      const current = () => sessions.get(channelId) === session && session.controller === controller && !controller.signal.aborted;
      setDraft(channelId, { triggerId, status: "drafting", text: "", code: null });
      let text = "";
      let failure: string | null = null;
      try {
        session.conversationId ??= (await deps.createConversation({ workspaceId, title: `@AI in #${channelName}` })).id;
        const conversationId = session.conversationId;
        await streamRun({
          start: () => deps.startThreadRun({ runId, conversationId, channelId, messageId: triggerId }, controller.signal),
          resume: (lastEventId) => deps.resumeRun(runId, lastEventId, controller.signal),
          signal: controller.signal,
          onEvent: (event, data) => {
            if (!current()) return;
            if (event === "text.delta") {
              text += deltaOf(data);
              setDraft(channelId, { triggerId, status: "drafting", text, code: null });
            } else if (event === "error") {
              failure = codeOf(data, "upstream_error");
            }
          },
        });
      } catch (error) {
        failure = codeOf(error, "upstream_error");
      }
      if (!current()) return;
      session.controller = null;
      if (failure) setDraft(channelId, { triggerId, status: "error", text, code: failure });
      else if (!text.trim()) setDraft(channelId, { triggerId, status: "error", text, code: "empty_answer" });
      else setDraft(channelId, { triggerId, status: "ready", text, code: null });
    };

    return {
      drafts: {},

      ask: (input) => {
        const previous = sessions.get(input.channelId);
        if (previous) stop(previous);
        // A new ask in the same channel replaces the old draft, conversation included.
        sessions.set(input.channelId, { input, conversationId: null, runId: null, controller: null });
        if (!deps.noticeSeen(input.userId)) {
          setDraft(input.channelId, { triggerId: input.triggerId, status: "notice", text: "", code: null });
          return;
        }
        void run(input.channelId);
      },

      accept: (channelId) => {
        const session = sessions.get(channelId);
        if (!session || get().drafts[channelId]?.status !== "notice") return;
        deps.markNoticeSeen(session.input.userId);
        void run(channelId);
      },

      retry: (channelId) => {
        void run(channelId);
      },

      discard: (channelId) => {
        const session = sessions.get(channelId);
        if (session) stop(session);
        sessions.delete(channelId);
        removeDraft(channelId);
      },

      post: async (channelId) => {
        const session = sessions.get(channelId);
        const draft = get().drafts[channelId];
        if (!session?.runId || draft?.status !== "ready") return null;
        setDraft(channelId, { ...draft, status: "posting" });
        try {
          const message = await deps.postAiAnswer(channelId, session.runId);
          if (sessions.get(channelId) === session) {
            sessions.delete(channelId);
            removeDraft(channelId);
          }
          return message;
        } catch (error) {
          const code = codeOf(error, "post_failed");
          if (sessions.get(channelId) !== session) return null;
          if (code === "already_posted") {
            sessions.delete(channelId);
            removeDraft(channelId);
          } else {
            setDraft(channelId, { ...draft, status: "error", code });
          }
          return null;
        }
      },
    };
  });
}
