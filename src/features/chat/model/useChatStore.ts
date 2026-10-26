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
import { withAccountContext } from "@/features/ai/model/viewContext";
import { parseAgentPrefix, type AgentSummary } from "@/features/ai/model/aiAgents";
import { listAgents, type AiMessage } from "@/features/ai/api/aiClient";
import { assistantTurn, type AssistantTurn, type TurnStore } from "./assistantTurn";
import { dispatchRunEvent } from "./runEventDispatch";
import { failureCode, retryAfterOf } from "./runErrors";
import { conversationApi } from "./conversationApi";
import { useUserStore } from "@/features/auth";
import { withMemoryDecision, type MemoryDecision } from "./memoryParts";
import { withoutUnreadableMirrors } from "./storedChatRepair";

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
const activeOwnerId = (): string | undefined => useUserStore.getState().activeUserId || undefined;

/**
 * The conversations an account may see on this browser: its own, and the ones
 * stored before conversations recorded their owner.
 */
export function conversationsOf(conversations: Conversation[], userId: string | undefined): Conversation[] {
  return conversations.filter((c) => c.ownerId === undefined || c.ownerId === userId);
}

export function setInferencePort(port: InferencePort): void {
  inferencePort = port;
}

/** The port in use right now. */
export function getInferencePort(): InferencePort {
  return inferencePort;
}

/** The server transcripts read or being read: a conversation is read once. */
const transcriptsRequested = new Set<string>();

/** The text of a server message, from its text parts. */
function textOfParts(parts: AiMessage["parts"]): string {
  return parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n\n");
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
    return withoutUnreadableMirrors({ ...empty, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<ChatData>) });
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
  /** Adds the conversations the account has on the service and this browser lacks. Never throws. */
  syncServerConversations: (workspaceId: string) => Promise<void>;
  /** Reads the transcript of a conversation that came from the service, once, when it has no local message. */
  loadServerTranscript: (conversationId: string) => Promise<void>;
  setActive: (id: string | null) => void;
  setConversationModel: (id: string, connectorId: string, model: string) => void;
  send: (conversationId: string, text: string, sel?: { connectorId?: string; model?: string; connectionId?: string; agentId?: string; context?: RunContext; replaceFromRunId?: string; attachments?: Array<{ kind: "chat"; id: string } | { kind: "media"; path: string; name?: string }> }) => Promise<void>;
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
  /** 👍/👎 on an answer: the same value again clears it, the other value replaces it. */
  setFeedback: (messageId: string, value: "up" | "down") => void;
  /**
   * Edit & resend: drops this user message and every later one of its
   * conversation, here and on the service (replaceFromRunId), then sends the
   * new text as a new turn. Refused (false) while
   * the conversation has a run in flight.
   */
  editAndResend: (messageId: string, text: string) => Promise<boolean>;
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

  /**
   * Tells the service about a rename or a delete of a conversation it holds.
   *
   * The local store is the reader's copy: a refusal leaves the local change and
   * logs one line. Caveat: a delete that failed on the service comes back at
   * the next sync.
   */
  const mirrorToServer = (
    what: string,
    serverId: string | undefined,
    call: (api: ReturnType<typeof conversationApi>, serverId: string) => Promise<unknown>,
  ) => {
    const api = conversationApi();
    if (!serverId || !api.isConfigured()) return;
    call(api, serverId).catch((error: unknown) => {
      console.warn(`[chat] the service did not take the ${what} of conversation ${serverId}`, error);
    });
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
        connectorId: opts.connectorId, model: opts.model, ownerId: activeOwnerId(), createdAt: now(), updatedAt: now(),
      };
      set((s) => ({ conversations: [conversation, ...s.conversations], activeConversationId: conversation.id }));
      persist();
      return conversation;
    },
    renameConversation: (id, title) => {
      const serverId = get().conversations.find((c) => c.id === id)?.serverConversationId;
      set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? { ...c, title } : c)) }));
      persist();
      mirrorToServer("rename", serverId, (api, sid) => api.rename(sid, title));
    },
    deleteConversation: (id) => {
      const serverId = get().conversations.find((c) => c.id === id)?.serverConversationId;
      mirrorToServer("delete", serverId, (api, sid) => api.remove(sid));
      set((s) => ({
        conversations: s.conversations.filter((c) => c.id !== id),
        messages: s.messages.filter((m) => m.conversationId !== id),
        activeConversationId: s.activeConversationId === id ? null : s.activeConversationId,
      }));
      persist();
    },
    syncServerConversations: async (workspaceId) => {
      const api = conversationApi();
      if (!api.isConfigured()) return;
      // Read before the await: the account may switch while the list is in flight.
      const ownerId = activeOwnerId();
      try {
        const remote = await api.list(workspaceId);
        // Read after the await: a conversation created meanwhile is not added twice.
        const known = new Set(get().conversations.flatMap((c) => (c.serverConversationId ? [c.serverConversationId] : [])));
        const added: Conversation[] = remote
          .filter((r) => !known.has(r.id))
          .map((r) => ({
            id: uid(), projectId: null, title: r.title.trim() || "New conversation", model: r.model,
            serverConversationId: r.id, ownerId, createdAt: r.createdAt, updatedAt: r.updatedAt,
          }));
        if (added.length === 0) return;
        set((s) => ({ conversations: [...s.conversations, ...added] }));
        persist();
      } catch (error) {
        console.warn("[chat] could not read the conversations of the account", error);
      }
    },
    loadServerTranscript: async (conversationId) => {
      const conversation = get().conversations.find((c) => c.id === conversationId);
      const serverId = conversation?.serverConversationId;
      const api = conversationApi();
      if (!serverId || !api.isConfigured() || transcriptsRequested.has(serverId)) return;
      if (get().messagesFor(conversationId).length > 0) return;
      transcriptsRequested.add(serverId);
      try {
        const transcript = await api.messages(serverId);
        const loaded: ChatMessage[] = transcript
          .filter((m) => m.role !== "tool")
          .map((m) => ({
            id: uid(), conversationId, role: m.role === "user" ? "user" : m.role === "system" ? "system" : "assistant",
            content: textOfParts(m.parts), createdAt: m.createdAt, parts: m.parts, runId: m.runId || undefined,
            model: m.model, status: "done" as const,
          }));
        // A turn sent while the read was going is already there: the transcript goes before it.
        set((s) => ({ messages: [...loaded, ...s.messages] }));
        persist();
      } catch (error) {
        // A failed read may be tried again the next time the conversation opens.
        transcriptsRequested.delete(serverId);
        console.warn("[chat] could not read the transcript of a conversation", error);
      }
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
            ...(sel?.replaceFromRunId ? { replaceFromRunId: sel.replaceFromRunId } : {}),
            // What the answer may read: the pages the reader pointed at, plus
            // account/view when the setting is on.
            context: withAccountContext(sel?.context),
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

    setFeedback: (messageId, value) => {
      set((s) => ({
        messages: s.messages.map((m) => {
          if (m.id !== messageId || m.role !== "assistant") return m;
          const { feedback: current, ...rest } = m;
          return current === value ? rest : { ...rest, feedback: value };
        }),
      }));
      persist();
    },

    editAndResend: async (messageId, text) => {
      const original = get().messages.find((m) => m.id === messageId);
      if (!original || original.role !== "user" || !text.trim()) return false;
      const { conversationId } = original;
      if (activeRuns.has(conversationId)) return false;
      const inConversation = get().messagesFor(conversationId);
      const from = inConversation.findIndex((m) => m.id === messageId);
      const dropped = new Set(inConversation.slice(from).map((m) => m.id));
      // The service holds the history: it drops from the first answered turn
      // after the edited one. An unanswered edit has nothing stored to drop.
      const replaceFromRunId = inConversation.slice(from + 1).find((m) => m.runId)?.runId;
      set((s) => ({ messages: s.messages.filter((m) => !dropped.has(m.id)) }));
      persist();
      // The turn keeps the connection, model and agent it was first sent with.
      await get().send(conversationId, text, {
        connectorId: original.connectorId,
        model: original.model,
        connectionId: original.connectionId,
        agentId: original.agentId,
        ...(replaceFromRunId ? { replaceFromRunId } : {}),
      });
      return true;
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
