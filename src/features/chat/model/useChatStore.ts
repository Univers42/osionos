/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useChatStore.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";

import type { ChatMessage, Conversation, Project, SharedContextItem } from "./chatTypes";
import { stubInferencePort } from "./inferencePort";

const STORAGE_KEY = "osionos.chat.v1";
const now = () => new Date().toISOString();
const uid = () => globalThis.crypto.randomUUID();

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
  send: (conversationId: string, text: string, sel?: { connectorId?: string; model?: string }) => Promise<void>;
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
  const addMessage = (conversationId: string, m: Pick<ChatMessage, "role" | "content" | "connectorId" | "model">) => {
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
      addMessage(conversationId, { role: "user", content: text.trim(), connectorId, model });
      const history = get().messagesFor(conversationId).map((m) => ({ role: m.role, content: m.content }));
      const result = await stubInferencePort.complete({ connectorId, model, messages: history });
      addMessage(conversationId, { role: "assistant", content: result.content, connectorId, model });
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
