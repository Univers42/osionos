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
 * In a channel whose admin opted in to auto-post (osio-bot OB1, OB3, OB7), the
 * consent is asked apart, per (user, autopost), and a ready draft posts
 * itself through the same post route, so the bridge's guards still decide.
 * A refused post is "held": the private draft keeps the reason, and its Post
 * tries the same route again, except `answer_blocked`, which never clears.
 * While such a run streams, the channel hears a textless "osio is answering"
 * (OB12); the text itself stays with the asker until the post.
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

export type AiDraftStatus = "notice" | "drafting" | "ready" | "posting" | "held" | "error";

export interface AiDraft {
  triggerId: string;
  status: AiDraftStatus;
  text: string;
  /** The refusal or failure code of the last step, when it failed. */
  code: string | null;
  /** Present only in an auto-post channel: the answer posts without the asker's click. */
  autopost?: true;
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
  noticeSeen: (userId: string, autopost?: boolean) => boolean;
  markNoticeSeen: (userId: string, autopost?: boolean) => void;
  newId: () => string;
  /** Tells the channel, with no text, that osio is answering (auto-post runs only). */
  answering?: (channelId: string) => void;
}

export interface AskInput {
  channelId: string;
  workspaceId: string;
  channelName: string;
  triggerId: string;
  userId: string;
  /** The channel's admin opted in to auto-post. */
  autopost?: boolean;
  /** Gets the message once it is posted, by a click or by auto-post. */
  onPosted?: (message: ChatMessage) => void;
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
  /** When the channel last heard "osio is answering", in ms since the epoch. */
  answeredAt: number;
}

// Caveat: readers drop the signal 4 s after its last frame (TYPING_TTL_MS in
// useChannelReceipts), so a model silent for over 4 s between deltas goes dark
// until its next delta. 2.5 s keeps a streaming run lit for about one POST per
// 2.5 s instead of one per delta.
const ANSWERING_EVERY_MS = 2500;

function codeOf(value: unknown, fallback: string): string {
  const code = (value as { code?: unknown } | null)?.code;
  return typeof code === "string" && code ? code : fallback;
}

function deltaOf(data: StreamPayload): string {
  return typeof data.text === "string" ? data.text : "";
}

function draftOf(input: AskInput, status: AiDraftStatus, text: string, code: string | null): AiDraft {
  return { triggerId: input.triggerId, status, text, code, ...(input.autopost ? { autopost: true as const } : {}) };
}

/** A held draft may be posted again, unless its guard never clears. */
export function canPostDraft(draft: AiDraft | undefined): draft is AiDraft {
  return draft?.status === "ready" || (draft?.status === "held" && draft.code !== "answer_blocked");
}

/** One run of a session: its id, its abort, and whether it is still the session's run. */
interface Attempt {
  runId: string;
  controller: AbortController;
  current: () => boolean;
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
    const forget = (channelId: string, session: Session): void => {
      if (sessions.get(channelId) !== session) return;
      sessions.delete(channelId);
      removeDraft(channelId);
    };
    const stop = (session: Session): void => {
      if (!session.controller || session.controller.signal.aborted) return;
      session.controller.abort();
      // The cancel is a courtesy: the run may already be over.
      if (session.runId) void deps.cancelRun(session.runId).catch(() => undefined);
    };

    const signalAnswering = (channelId: string, session: Session): void => {
      const now = Date.now();
      if (!session.input.autopost || !deps.answering || now - session.answeredAt < ANSWERING_EVERY_MS) return;
      session.answeredAt = now;
      deps.answering(channelId);
    };
    const showDrafting = (channelId: string, session: Session, text: string): void => {
      setDraft(channelId, draftOf(session.input, "drafting", text, null));
      signalAnswering(channelId, session);
    };

    const conversationOf = async (session: Session): Promise<string> => {
      const { workspaceId, channelName } = session.input;
      session.conversationId ??= (await deps.createConversation({ workspaceId, title: `@AI in #${channelName}` })).id;
      return session.conversationId;
    };

    const stream = async (channelId: string, session: Session, attempt: Attempt): Promise<{ text: string; failure: string | null }> => {
      const { runId, controller, current } = attempt;
      let text = "";
      let failure: string | null = null;
      try {
        const conversationId = await conversationOf(session);
        await streamRun({
          start: () => deps.startThreadRun({ runId, conversationId, channelId, messageId: session.input.triggerId }, controller.signal),
          resume: (lastEventId) => deps.resumeRun(runId, lastEventId, controller.signal),
          signal: controller.signal,
          onEvent: (event, data) => {
            if (!current()) return;
            if (event === "text.delta") {
              text += deltaOf(data);
              showDrafting(channelId, session, text);
            } else if (event === "error") {
              failure = codeOf(data, "upstream_error");
            }
          },
        });
      } catch (error) {
        failure = codeOf(error, "upstream_error");
      }
      return { text, failure };
    };

    const post = async (channelId: string): Promise<ChatMessage | null> => {
      const session = sessions.get(channelId);
      const draft = get().drafts[channelId];
      if (!session?.runId || !canPostDraft(draft)) return null;
      setDraft(channelId, { ...draft, status: "posting" });
      try {
        const message = await deps.postAiAnswer(channelId, session.runId);
        forget(channelId, session);
        session.input.onPosted?.(message);
        return message;
      } catch (error) {
        const code = codeOf(error, "post_failed");
        if (sessions.get(channelId) !== session) return null;
        if (code === "already_posted") forget(channelId, session);
        // OB7: a refused auto-post stays private, with its reason and a Post that tries the guards again.
        else setDraft(channelId, { ...draft, status: session.input.autopost ? "held" : "error", code });
        return null;
      }
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
      const current = () => sessions.get(channelId) === session && session.controller === controller && !controller.signal.aborted;
      showDrafting(channelId, session, "");
      const { text, failure } = await stream(channelId, session, { runId, controller, current });
      if (!current()) return;
      session.controller = null;
      const code = failure ?? (text.trim() ? null : "empty_answer");
      setDraft(channelId, draftOf(session.input, code ? "error" : "ready", text, code));
      // OB1: the asker's own client posts, through the route that runs every guard.
      if (!code && session.input.autopost) void post(channelId);
    };

    return {
      drafts: {},

      ask: (input) => {
        const previous = sessions.get(input.channelId);
        if (previous) stop(previous);
        // A new ask in the same channel replaces the old draft, conversation included.
        sessions.set(input.channelId, { input, conversationId: null, runId: null, controller: null, answeredAt: 0 });
        if (!deps.noticeSeen(input.userId, input.autopost === true)) {
          setDraft(input.channelId, draftOf(input, "notice", "", null));
          return;
        }
        void run(input.channelId);
      },

      accept: (channelId) => {
        const session = sessions.get(channelId);
        if (!session || get().drafts[channelId]?.status !== "notice") return;
        deps.markNoticeSeen(session.input.userId, session.input.autopost === true);
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

      post,
    };
  });
}
