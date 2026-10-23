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
import { parseAgentPrefix, type AgentSummary } from "@/features/ai/model/aiAgents";
import { listAgents } from "@/features/ai/api/aiClient";
import { assistantTurn, type AssistantTurn, type TurnStore } from "./assistantTurn";
import { dispatchRunEvent } from "./runEventDispatch";
import { failureCode, retryAfterOf } from "./runErrors";
import { withMemoryDecision, type MemoryDecision } from "./memoryParts";

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
  /** The built-in agents of the service — the shapes a run can take. */
  agents: AgentSummary[];
  /** Reads the list of the agents from the service. It never throws. */
  loadAgents: () => Promise<void>;
  createProject: (name: string) => Project;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
  createConversation: (projectId?: string | null, opts?: { title?: string; connectorId?: string; model?: string }) => Conversation;
  renameConversation: (id: string, title: string) => void;
  deleteConversation: (id: string) => void;
  setActive: (id: string | null) => void;
  setConversationModel: (id: string, connectorId: string, model: string) => void;
  send: (conversationId: string, text: string, sel?: { connectorId?: string; model?: string; connectionId?: string; agentId?: string; context?: RunContext; attachments?: Array<{ kind: "chat"; id: string } | { kind: "media"; path: string }> }) => Promise<void>;
  stop: (conversationId: string) => void;
  /**
   * The follow-up of a write the user just approved.
   *
   * The service continued the run on its own: the answer of the assistant
   * after the write is a run of its own, and the client attaches to its
   * stream — the way it resumes a run whose connection dropped.
   */
  followUp: (conversationId: string, runId: string) => Promise<void>;
  /** Writes the user's decision on a memory chip into the part, so it persists in the message. */
  decideMemoryProposal: (messageId: string, memoryId: string, decision: MemoryDecision) => void;
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
  const addMessage = (conversationId: string, m: Pick<ChatMessage, "role" | "content" | "connectorId" | "model" | "connectionId" | "agentId">) => {
    set((s) => ({
      messages: [...s.messages, { id: uid(), conversationId, createdAt: now(), ...m }],
      conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, updatedAt: now() } : c)),
    }));
    persist();
  };

  /** What a turn of the assistant needs from the store. */
  const turnStore: TurnStore = {
    messages: () => get().messages,
    addMessage: (message) => {
      set((s) => ({
        messages: [...s.messages, message],
        conversations: s.conversations.map((c) => (c.id === message.conversationId ? { ...c, updatedAt: now() } : c)),
      }));
      persist();
    },
    patchMessage: (id, patch) => {
      set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
      persist();
    },
    conversationTitle: (conversationId) =>
      get().conversations.find((c) => c.id === conversationId)?.title ?? "",
    writeTitle: (conversationId, title) => {
      set((s) => ({ conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, title } : c)) }));
      persist();
    },
  };

  /**
   * Runs a turn of the assistant: the message of the turn, and the frames
   * that fill it.
   *
   * The run is the port's: the port opens the stream, the frames come here,
   * and the message of the turn ends with them.
   */
  const runTurn = async (
    conversationId: string,
    options: { connectorId: string; model: string; connectionId: string; agentId?: string },
    open: (turn: AssistantTurn, signal: AbortSignal) => Promise<void>,
  ): Promise<void> => {
    const assistantId = uid();
    turnStore.addMessage({
      id: assistantId,
      conversationId,
      role: "assistant",
      content: "",
      createdAt: now(),
      ...options,
      status: "streaming",
    });
    const turn = assistantTurn(turnStore, assistantId, conversationId);
    const controller = new AbortController();
    activeRuns.set(conversationId, controller);
    try {
      await open(turn, controller.signal);
      // The stream ended without a terminal frame (a stop, or a run that gave
      // up): what arrived stays, and the answer is not marked as failed.
      turn.finish();
    } catch (error) {
      turn.patchAssistant({ status: "error", errorCode: failureCode(error), retryAfterSeconds: retryAfterOf(error) });
    } finally {
      activeRuns.delete(conversationId);
    }
  };

  return {
    ...load(),
    activeConversationId: null,
    agents: [],

    loadAgents: async () => {
      // The list of the agents lives on the service. A service that is not
      // there, or a call that fails, leaves the list empty: the composer then
      // offers the general assistant, which is the run of today.
      try {
        const agents = await listAgents();
        set({ agents });
      } catch {
        set({ agents: [] });
      }
    },

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
      // The agent of this message: the "@id " the message starts with wins
      // over the picker's choice, and the prefix is stripped from the text.
      const choice = parseAgentPrefix(text, get().agents);
      const agentId = choice.agentId ?? sel?.agentId ?? null;
      const port = getInferencePort();
      const stream = port.stream;

      // No streaming port: the offline path — one complete answer, no frames.
      if (!stream) {
        addMessage(conversationId, { role: "user", content: choice.text.trim(), connectorId, model, connectionId, ...(agentId ? { agentId } : {}) });
        const history = get().messagesFor(conversationId).map((m) => ({ role: m.role, content: m.content }));
        const result = await port.complete({ connectorId, model, connectionId, messages: history });
        addMessage(conversationId, { role: "assistant", content: result.content, connectorId, model, connectionId, ...(agentId ? { agentId } : {}) });
        return;
      }

      // A conversation speaks one at a time — the service refuses the second
      // run of a conversation with a 409, so the pane refuses it too.
      if (activeRuns.has(conversationId)) return;

      const body = choice.text.trim();
      addMessage(conversationId, { role: "user", content: body, connectorId, model, connectionId, ...(agentId ? { agentId } : {}) });

      const rememberServerConversation = (serverConversationId: string) => {
        set((s) => ({ conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, serverConversationId } : c)) }));
        persist();
      };

      await runTurn(conversationId, { connectorId, model, connectionId, ...(agentId ? { agentId } : {}) }, (turn, signal) =>
        stream(
          {
            conversationId,
            text: body,
            model,
            connectorId,
            connectionId,
            // The agent of this run: the one the reader picked, or none.
            ...(agentId ? { agentId } : {}),
            title: conversation.title,
            serverConversationId: conversation.serverConversationId,
            attachments: sel?.attachments,
            // What the answer may read: the pages the reader pointed at.
            context: sel?.context,
            onServerConversationId: rememberServerConversation,
          },
          (event, data) => dispatchRunEvent(event, data, turn),
          signal,
        ),
      );
    },

    stop: (conversationId) => {
      // The abort reaches the port, which cancels the run on the service.
      activeRuns.get(conversationId)?.abort();
    },

    followUp: async (conversationId, runId) => {
      const port = getInferencePort();
      // A port without a stream has no run to attach to.
      if (!port.attach) return;
      // A conversation speaks one at a time.
      if (activeRuns.has(conversationId)) return;
      const conversation = get().conversations.find((c) => c.id === conversationId);
      if (!conversation) return;
      // The follow-up belongs to the turn that asked for the write: it is paid
      // for the same way.
      const last = [...get().messagesFor(conversationId)].reverse().find((m) => m.role === "assistant");
      const connectorId = last?.connectorId ?? conversation.connectorId ?? "anthropic";
      const model = last?.model ?? conversation.model ?? "auto";
      const connectionId = last?.connectionId ?? PLATFORM_CONNECTION_ID;
      await runTurn(conversationId, { connectorId, model, connectionId }, (turn, signal) =>
        port.attach!(runId, (event, data) => dispatchRunEvent(event, data, turn), signal),
      );
    },

    decideMemoryProposal: (messageId, memoryId, decision) => {
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === messageId && m.parts ? { ...m, parts: withMemoryDecision(m.parts, memoryId, decision) } : m,
        ),
      }));
      persist();
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
