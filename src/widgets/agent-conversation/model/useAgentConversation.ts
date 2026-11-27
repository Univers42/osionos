/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useAgentConversation.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import { useEffect, useMemo, useRef, useState } from "react";

import { useUserStore } from "@/features/auth";
import { useAgentStream, type StreamPayload } from "@/shared/agent/useAgentStream";
import { usePageStore, type PageEntry } from "@/store/usePageStore";

import { createId, nowIso } from "./agentIds";
import { parseCreatedPageFromToolText } from "./agentBlocks";
import { CLAUDE_STREAM_ENDPOINT, DEFAULT_PROMPT } from "./agentOptions";
import { initialMessages, loadMessages, readSettings, writeSettings, writeThread } from "./agentStorage";
import { resultSummary, toolDetail, updateToolEvent, upsertToolEvent } from "./agentToolEvents";
import type { AgentMessage, AgentRunSettings, AgentToolEvent, AgentToolKey } from "./types";

const EMPTY_WORKSPACE_PAGES: PageEntry[] = [];

/**
 * The state and actions of one agent conversation page: the stored thread and
 * settings, the Claude stream, and the mirroring of created MCP pages into the
 * workspace. The UI only renders what this returns.
 *
 * A page change resets state during render (a `prev`-prop comparison, per
 * react-doctor/no-adjust-state-on-prop-change) so the new page and its initial
 * state commit in one paint. The mirror-dedup ref is reset in an effect, since a
 * ref must not be written during render; the async mirror runs only after commit.
 */
export function useAgentConversation(pageId: string) {
  const page = usePageStore((state) => state.pageById(pageId));
  const addPage = usePageStore((state) => state.addPage);
  const openPage = usePageStore((state) => state.openPage);
  const updatePageTitle = usePageStore((state) => state.updatePageTitle);
  const activeWorkspace = useUserStore((state) => state.activeWorkspace());
  const jwt = useUserStore((state) => state.activePageJwt() ?? "");
  const workspaceId = page?.workspaceId ?? activeWorkspace?._id ?? "";
  const workspacePages = usePageStore((state) => workspaceId ? state.pages[workspaceId] ?? EMPTY_WORKSPACE_PAGES : EMPTY_WORKSPACE_PAGES);
  const [draft, setDraft] = useState(DEFAULT_PROMPT);
  const [messages, setMessages] = useState<AgentMessage[]>(() => loadMessages(pageId));
  const [settings, setSettings] = useState<AgentRunSettings>(() => readSettings(pageId));
  const { send: streamAgent, streaming: running } = useAgentStream({ endpoint: CLAUDE_STREAM_ENDPOINT });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const mirroredExternalIds = useRef(new Set<string>());
  const title = page?.title || "Claude MCP agent";

  const [prevPageId, setPrevPageId] = useState(pageId);
  if (prevPageId !== pageId) {
    setPrevPageId(pageId);
    setMessages(loadMessages(pageId));
    setSettings(readSettings(pageId));
    setDraft(DEFAULT_PROMPT);
  }

  useEffect(() => {
    mirroredExternalIds.current = new Set();
  }, [pageId]);

  useEffect(() => {
    writeThread(pageId, messages);
  }, [messages, pageId]);

  useEffect(() => {
    writeSettings(pageId, settings);
  }, [pageId, settings]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const latestCreatedPage = useMemo(() => [...messages].reverse().find((message) => message.createdPageId), [messages]);

  function patchMessage(messageId: string, patch: Partial<AgentMessage>) {
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, ...patch } : message));
  }

  function patchAssistantText(messageId: string, body: string) {
    patchMessage(messageId, { body });
  }

  function addToolEvent(messageId: string, event: AgentToolEvent) {
    setMessages((current) => current.map((message) => (
      message.id === messageId ? { ...message, toolEvents: upsertToolEvent(message.toolEvents, event) } : message
    )));
  }

  function patchToolEvent(messageId: string, toolId: string, patch: Partial<AgentToolEvent>) {
    setMessages((current) => current.map((message) => (
      message.id === messageId ? { ...message, toolEvents: updateToolEvent(message.toolEvents, toolId, patch) } : message
    )));
  }

  async function mirrorCreatedPage(messageId: string, text: string) {
    if (!settings.mirrorCreatedPages || !workspaceId) return;
    const created = parseCreatedPageFromToolText(text);
    if (!created || mirroredExternalIds.current.has(created.externalPageId)) return;
    mirroredExternalIds.current.add(created.externalPageId);
    const mirrored = await addPage(workspaceId, created.title, jwt, undefined, {
      icon: "icon:file-text",
      visibility: "private",
      content: created.content,
    });
    if (!mirrored) return;
    patchMessage(messageId, { createdPageId: mirrored._id, createdPageTitle: mirrored.title });
  }

  function appContext() {
    return {
      agentPageId: pageId,
      agentPageTitle: title,
      visibleWorkspaceId: workspaceId,
      visibleWorkspaceName: activeWorkspace?.name ?? "",
      visiblePageTitles: workspacePages.slice(0, 40).map((item) => item.title),
    };
  }

  async function handleStreamEvent(messageId: string, event: string, data: StreamPayload, currentText: { value: string }) {
    if (event === "delta") {
      currentText.value += data.text ?? "";
      patchAssistantText(messageId, currentText.value);
    }
    if (event === "tool" && data.id && data.name) {
      addToolEvent(messageId, { id: data.id, name: data.name, status: "running", detail: toolDetail(data.name, data.input) });
    }
    if (event === "tool_result" && data.toolUseId) {
      const text = data.text ?? "";
      patchToolEvent(messageId, data.toolUseId, { status: "complete", detail: resultSummary(text) });
      await mirrorCreatedPage(messageId, text);
    }
    if (event === "result" && !currentText.value.trim()) {
      currentText.value = data.text ?? "";
      patchAssistantText(messageId, currentText.value);
    }
    if (event === "error") {
      const message = data.message ?? "Claude bridge failed.";
      currentText.value = currentText.value || String(message);
      patchAssistantText(messageId, currentText.value);
    }
  }

  async function runAgent(prompt: string) {
    if (running || !workspaceId) return;
    const cleanedPrompt = prompt.trim();
    if (!cleanedPrompt) return;
    setDraft("");

    if (title === "New agent") updatePageTitle(pageId, "Claude MCP agent");

    const userMessage: AgentMessage = { id: createId("user"), role: "user", body: cleanedPrompt, createdAt: nowIso() };
    const assistantMessage: AgentMessage = { id: createId("assistant"), role: "assistant", body: "", createdAt: nowIso(), toolEvents: [] };
    const currentText = { value: "" };
    setMessages((current) => [...current, userMessage, assistantMessage]);

    try {
      await streamAgent({ prompt: cleanedPrompt, ...settings, context: appContext() }, (event, data) => handleStreamEvent(assistantMessage.id, event, data, currentText));
      if (!currentText.value.trim()) patchAssistantText(assistantMessage.id, "Claude completed the request without a text response.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Claude bridge failed.";
      patchAssistantText(assistantMessage.id, message);
      addToolEvent(assistantMessage.id, { id: createId("tool-error"), name: "claude-bridge", status: "error", detail: message });
    }
  }

  function resetConversation() {
    setMessages(initialMessages());
  }

  function openLatestCreatedPage() {
    if (!workspaceId || !latestCreatedPage?.createdPageId) return;
    openPage({ id: latestCreatedPage.createdPageId, workspaceId, kind: "page", title: latestCreatedPage.createdPageTitle ?? "Claude MCP page", icon: "icon:file-text" });
  }

  function patchSettings(patch: Partial<AgentRunSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
  }

  function toggleTool(tool: AgentToolKey) {
    const allowedTools = settings.allowedTools.includes(tool)
      ? settings.allowedTools.filter((item) => item !== tool)
      : [...settings.allowedTools, tool];
    patchSettings({ allowedTools });
  }

  return {
    title, messages, settings, draft, setDraft, running, scrollRef, latestCreatedPage,
    runAgent, resetConversation, openLatestCreatedPage, patchSettings, toggleTool,
  };
}
