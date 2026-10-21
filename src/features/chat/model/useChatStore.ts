/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useChatStore.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";

import type { ChatMessage, Conversation, Project, SharedContextItem } from "./chatTypes";
import { stubInferencePort, type InferencePort } from "./inferencePort";
import { PLATFORM_CONNECTION_ID, readAiSelection } from "@/features/ai/model/aiSelection";
import type { RunContext } from "@/features/ai/model/aiContext";
import { citationFromEvent } from "./citations";
import { resolveConversationTitle } from "./conversationTitle";
import { withToolCall, withToolResult, withToolSource } from "./toolActivity";
import { retryAfterOf } from "./runErrors";

const STORAGE_KEY = "osionos.chat.v1";
const now = () => new Date().toISOString();
const uid = () => globalThis.crypto.randomUUID();

/**
 * The port the Assistant pane talks to. It is injected at app start: the AI
 * service when one is configured, the offline stub otherwise. The default is
 * the stub, so the pane keeps answering (visibly fakely) with no service.
 */
let inferencePort: InferencePort = stubInferencePort;

/** Injects the port the pane talks to. Called once, at app start. */
export function setInferencePort(port: InferencePort): void {
  inferencePort = port;
}

/** The port in use right now. */
export function getInferencePort(): InferencePort {
  return inferencePort;
}

/** The runs in flight, per conversation. A conversation speaks one at a time. */
const activeRuns = new Map<string, AbortController>();

/** The code of a failure — the service's own, when it carries one. */
function failureCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "internal";
}

interface ChatData {
  projects: Project[];
  conversations: Conversation[];
  messages: ChatMessage[];
  contextItems: SharedContextItem[];
}

function load(): ChatData {
  const empty: ChatData = { projects: [], conversations: [], messages: [], contextItems: [] };
  try {
    return { ...empty, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<ChatData>) };
  } catch {
    return empty;
  }
}

export interface ChatStoreState extends ChatData {
  activeConversationId: string | null;
  createProject: (name: string) => Project;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
  createConversation: (projectId?: string | null, opts?: { title?: string; connectorId?: string; model?: string }) => Conversation;
  renameConversation: (id: string, title: string) => void;
  deleteConversation: (id: string) => void;
  setActive: (id: string | null) => void;
  setConversationModel: (id: string, connectorId: string, model: string) => void;
  send: (conversationId: string, text: string, sel?: { connectorId?: string; model?: string; connectionId?: string; context?: RunContext; attachments?: Array<{ kind: "chat"; id: string } | { kind: "media"; path: string }> }) => Promise<void>;
  stop: (conversationId: string) => void;
  attachContext: (scope: SharedContextItem["scope"], scopeId: string, item: Pick<SharedContextItem, "kind" | "label" | "ref">) => void;
  detachContext: (id: string) => void;
  messagesFor: (conversationId: string) => ChatMessage[];
  contextFor: (scope: SharedContextItem["scope"], scopeId: string) => SharedContextItem[];
}

export const useChatStore = create<ChatStoreState>((set, get) => {
  const persist = () => {
    const { projects, conversations, messages, contextItems } = get();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ projects, conversations, messages, contextItems })); } catch { /* quota */ }
  };
  const addMessage = (conversationId: string, m: Pick<ChatMessage, "role" | "content" | "connectorId" | "model" | "connectionId">) => {
    set((s) => ({
      messages: [...s.messages, { id: uid(), conversationId, createdAt: now(), ...m }],
      conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, updatedAt: now() } : c)),
    }));
    persist();
  };

  return {
    ...load(),
    activeConversationId: null,

    createProject: (name) => {
      const project: Project = { id: uid(), name: name.trim() || "Untitled project", createdAt: now() };
      set((s) => ({ projects: [...s.projects, project] }));
      persist();
      return project;
    },
    renameProject: (id, name) => { set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, name } : p)) })); persist(); },
    deleteProject: (id) => {
      set((s) => ({
        projects: s.projects.filter((p) => p.id !== id),
        conversations: s.conversations.map((c) => (c.projectId === id ? { ...c, projectId: null } : c)),
      }));
      persist();
    },

    createConversation: (projectId = null, opts = {}) => {
      const conversation: Conversation = {
        id: uid(), projectId, title: opts.title?.trim() || "New conversation",
        connectorId: opts.connectorId, model: opts.model, createdAt: now(), updatedAt: now(),
      };
      set((s) => ({ conversations: [conversation, ...s.conversations], activeConversationId: conversation.id }));
      persist();
      return conversation;
    },
    renameConversation: (id, title) => { set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? { ...c, title } : c)) })); persist(); },
    deleteConversation: (id) => {
      set((s) => ({
        conversations: s.conversations.filter((c) => c.id !== id),
        messages: s.messages.filter((m) => m.conversationId !== id),
        activeConversationId: s.activeConversationId === id ? null : s.activeConversationId,
      }));
      persist();
    },
    setActive: (id) => set({ activeConversationId: id }),
    setConversationModel: (id, connectorId, model) => {
      set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? { ...c, connectorId, model } : c)) }));
      persist();
    },

    send: async (conversationId, text, sel) => {
      const conversation = get().conversations.find((c) => c.id === conversationId);
      if (!conversation || !text.trim()) return;
      const connectorId = sel?.connectorId ?? conversation.connectorId ?? "anthropic";
      const model = sel?.model ?? conversation.model ?? "auto";
      // Every run says which connection pays for it: the one the user picked,
      // the one they remembered, or the platform's.
      const connectionId = sel?.connectionId ?? readAiSelection()?.connectionId ?? PLATFORM_CONNECTION_ID;
      const port = getInferencePort();

      // No streaming port: the offline path — one complete answer, no frames.
      if (!port.stream) {
        addMessage(conversationId, { role: "user", content: text.trim(), connectorId, model, connectionId });
        const history = get().messagesFor(conversationId).map((m) => ({ role: m.role, content: m.content }));
        const result = await port.complete({ connectorId, model, connectionId, messages: history });
        addMessage(conversationId, { role: "assistant", content: result.content, connectorId, model, connectionId });
        return;
      }

      // A conversation speaks one at a time — the service refuses the second
      // run of a conversation with a 409, so the pane refuses it too.
      if (activeRuns.has(conversationId)) return;

      const body = text.trim();
      addMessage(conversationId, { role: "user", content: body, connectorId, model, connectionId });

      const assistantId = uid();
      set((s) => ({
        messages: [...s.messages, { id: assistantId, conversationId, role: "assistant", content: "", createdAt: now(), connectorId, model, connectionId, status: "streaming" }],
        conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, updatedAt: now() } : c)),
      }));
      persist();

      const patchAssistant = (patch: Partial<ChatMessage>) => {
        set((s) => ({ messages: s.messages.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)) }));
        persist();
      };
      const appendText = (chunk: string) => {
        const current = get().messages.find((m) => m.id === assistantId)?.content ?? "";
        patchAssistant({ content: current + chunk });
      };
      /** A source of the answer: kept as a part, in the order it arrived. */
      const appendCitation = (citation: NonNullable<ChatMessage["parts"]>[number]) => {
        const current = get().messages.find((m) => m.id === assistantId)?.parts ?? [];
        patchAssistant({ parts: [...current, citation] });
      };
      /** The parts of the answer, as they stand. */
      const assistantParts = (): NonNullable<ChatMessage["parts"]> =>
        get().messages.find((m) => m.id === assistantId)?.parts ?? [];
      /**
       * The parts of the answer, with what the tools said put in them.
       *
       * A frame that changes nothing leaves the parts as they are: the
       * answer is not written again for nothing.
       */
      const patchToolParts = (
        change: (parts: NonNullable<ChatMessage["parts"]>) => NonNullable<ChatMessage["parts"]>,
      ) => {
        const current = assistantParts();
        const next = change(current);
        if (next === current) return;
        patchAssistant({ parts: next });
      };
      /** A call of a tool: the assistant shows what it is doing. */
      const appendToolCall = (data: Record<string, unknown>) => {
        patchToolParts((parts) => withToolCall(parts, data));
      };
      /** The outcome of a call: the line of the call says it is over. */
      const appendToolResult = (data: Record<string, unknown>) => {
        patchToolParts((parts) => withToolResult(parts, data));
      };
      /** A source a call found: it is one of the results of the call. */
      const appendToolSource = (data: Record<string, unknown>) => {
        patchToolParts((parts) => withToolSource(parts, data));
      };
      /** The service named the conversation: the default title gives way to it. */
      const applyServerTitle = (serverTitle: string) => {
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== conversationId) return c;
            const title = resolveConversationTitle(c.title, serverTitle);
            return title === c.title ? c : { ...c, title };
          }),
        }));
        persist();
      };
      const rememberServerConversation = (serverConversationId: string) => {
        set((s) => ({ conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, serverConversationId } : c)) }));
        persist();
      };

      const controller = new AbortController();
      activeRuns.set(conversationId, controller);
      try {
        await port.stream(
          {
            conversationId,
            text: body,
            model,
            connectorId,
            connectionId,
            title: conversation.title,
            serverConversationId: conversation.serverConversationId,
            attachments: sel?.attachments,
            // What the answer may read: the pages the reader pointed at.
            context: sel?.context,
            onServerConversationId: rememberServerConversation,
          },
          (event, data) => {
            if (event === "text.delta" && typeof data.text === "string") appendText(data.text);
            else if (event === "citation") {
              const citation = citationFromEvent(data);
              if (citation) {
                appendCitation({
                  type: "citation",
                  pageId: citation.pageId,
                  ...(citation.blockId ? { blockId: citation.blockId } : {}),
                  title: citation.title,
                  snippet: citation.snippet,
                });
                // The sources a tool found are its result: they arrive between
                // the call and its outcome.
                appendToolSource(data);
              }
            } else if (event === "tool.called") {
              appendToolCall(data);
            } else if (event === "tool.result") {
              appendToolResult(data);
            } else if (event === "run.started") {
              if (typeof data.runId === "string") patchAssistant({ runId: data.runId });
              if (typeof data.conversationTitle === "string") applyServerTitle(data.conversationTitle);
            } else if (event === "done") patchAssistant({ status: "done" });
            else if (event === "error") patchAssistant({ status: "error", errorCode: typeof data.code === "string" ? data.code : "internal" });
          },
          controller.signal,
        );
        // The stream ended without a terminal frame (a stop, or a run that gave
        // up): what arrived stays, and the answer is not marked as failed.
        const assistant = get().messages.find((m) => m.id === assistantId);
        if (assistant?.status === "streaming") patchAssistant({ status: "done" });
      } catch (error) {
        patchAssistant({ status: "error", errorCode: failureCode(error), retryAfterSeconds: retryAfterOf(error) });
      } finally {
        activeRuns.delete(conversationId);
      }
    },

    stop: (conversationId) => {
      // The abort reaches the port, which cancels the run on the service.
      activeRuns.get(conversationId)?.abort();
    },

    attachContext: (scope, scopeId, item) => {
      set((s) => ({ contextItems: [...s.contextItems, { id: uid(), scope, scopeId, createdAt: now(), ...item }] }));
      persist();
    },
    detachContext: (id) => { set((s) => ({ contextItems: s.contextItems.filter((c) => c.id !== id) })); persist(); },

    messagesFor: (conversationId) => get().messages.filter((m) => m.conversationId === conversationId),
    contextFor: (scope, scopeId) => get().contextItems.filter((c) => c.scope === scope && c.scopeId === scopeId),
  };
});
