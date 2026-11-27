/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   agentStorage.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import { noticingWriter } from '@/shared/lib/storage-full/noticingWrite';
import { setItemEvictingPageCaches } from '@/store/pageStore.helpers';

import { createId, nowIso } from "./agentIds";
import type { AgentMessage, AgentRunSettings } from "./types";

export const AGENT_THREADS_STORAGE_KEY = "osionos:agent-conversations";
export const AGENT_SETTINGS_STORAGE_KEY = "osionos:agent-settings";

export const DEFAULT_SETTINGS: AgentRunSettings = {
  agent: "default",
  model: "default",
  effort: "medium",
  allowedTools: ["app", "status", "workspace", "list", "search", "read", "create", "update"],
  mirrorCreatedPages: true,
};

/**
 * Reads and parses a JSON value; `fallback` when it is absent, corrupt, or storage is unreachable.
 * Ponytail: the shape is trusted, not validated, so a well-formed JSON of the wrong shape passes through.
 */
export function readJsonStorage<TValue>(key: string, fallback: TValue): TValue {
  if (globalThis.window === undefined) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as TValue : fallback;
  } catch {
    return fallback;
  }
}

// The thread is what the person wrote, so it makes room; the run settings are a preference.
const writeAgentThreads = noticingWriter('Agent conversations', setItemEvictingPageCaches);
const writeAgentSettings = noticingWriter('Agent settings');

/** Every stored thread, keyed by page id. */
export function readThreads(): Record<string, AgentMessage[]> {
  return readJsonStorage<Record<string, AgentMessage[]>>(AGENT_THREADS_STORAGE_KEY, {});
}

/** Stores the thread of one page next to the others. */
export function writeThread(pageId: string, messages: AgentMessage[]) {
  const threads = readThreads();
  threads[pageId] = messages;
  writeAgentThreads(AGENT_THREADS_STORAGE_KEY, JSON.stringify(threads));
}

/** The run settings of a page: stored values over the defaults. */
export function readSettings(pageId: string): AgentRunSettings {
  const allSettings = readJsonStorage<Record<string, AgentRunSettings>>(AGENT_SETTINGS_STORAGE_KEY, {});
  const storedSettings = allSettings[pageId];
  return storedSettings ? { ...DEFAULT_SETTINGS, ...storedSettings } : DEFAULT_SETTINGS;
}

/** Stores the run settings of one page next to the others. */
export function writeSettings(pageId: string, settings: AgentRunSettings) {
  const allSettings = readJsonStorage<Record<string, AgentRunSettings>>(AGENT_SETTINGS_STORAGE_KEY, {});
  allSettings[pageId] = settings;
  writeAgentSettings(AGENT_SETTINGS_STORAGE_KEY, JSON.stringify(allSettings));
}

/** The greeting a new or reset conversation starts with. */
export function initialMessages(): AgentMessage[] {
  return [{
    id: createId("assistant"),
    role: "assistant",
    createdAt: nowIso(),
    body: "Claude is ready. Ask normally for conversation, or ask it to use the osionos MCP tools to work with pages.",
  }];
}

/** The stored thread of a page, or the greeting. */
export function loadMessages(pageId: string): AgentMessage[] {
  return readThreads()[pageId] ?? initialMessages();
}
