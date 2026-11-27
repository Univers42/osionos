/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useChatShell.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect, useMemo, useState } from "react";
import { useChatStore, getInferencePort, conversationsOf } from "@/features/chat/model/useChatStore";
import { useAssistantDraft } from "@/features/chat/model/assistantDraft";
import { useAgentRequest } from "@/features/chat/model/agentRequest";
import { mergeAttachments, mergeHandoffText, subscribeAssistantHandoff, toRunAttachments } from "@/features/chat/model/assistantHandoff";
import type { ComposerAttachment } from "@/features/chat/model/assistantHandoff";
import { useConnectorStore } from "@/features/connectors/model/useConnectorStore";
import { isAiConfigured } from "@/features/ai/api/aiClient";
import { addContextChip, buildRunContext } from "@/features/ai/model/aiContext";
import { usePageStore } from "@/store/usePageStore";
import { useWebSettings } from "@/features/ai/model/useWebSettings";
import { useWebToggle } from "@/features/ai/model/webToggle";
import { openSettings } from "@/features/settings/model/settingsNav";
import { MAX_ATTACHMENTS } from "../ui/AttachButton";
import { useUserStore } from "@/features/auth";
import { useAgentPanel } from "./useAgentPanel";
import { activitiesOf, sourcesOf } from "./conversationTrail";

/**
 * The state and handlers of the assistant screen: the open conversation, the composer's
 * text and attachments, and the connection onboarding. Who answers, the pages read and the
 * model are the shared draft (`assistantDraft`), which the sidebar's Assistant panel shows too.
 * Another account's conversation is never shown: switching accounts starts a new one.
 * The agents settings' "Try it" request is taken once, and the selection follows it while rendering.
 * The hand-off from a block fills the composer and stays there until the user presses Send.
 * The AI service owns the providers, so a streaming port needs no connector of the app's own.
 * A panel talks one agent at a time: the next message waits for its end. Web toggles are
 * one message's alone and drop when the workspace switch is off.
 */
export const useChatShell = () => {
  const initConnectors = useConnectorStore((s) => s.init);
  const snapshots = useConnectorStore((s) => s.snapshots);
  const connectedSnaps = useMemo(() => Object.values(snapshots).filter((x) => x.state === "connected"), [snapshots]);
  const allConversations = useChatStore((s) => s.conversations);
  const userId = useUserStore((s) => s.activeUserId);
  const conversations = useMemo(() => conversationsOf(allConversations, userId), [allConversations, userId]);
  const activeId = useChatStore((s) => s.activeConversationId);
  const allMessages = useChatStore((s) => s.messages);
  const createConversation = useChatStore((s) => s.createConversation);
  const send = useChatStore((s) => s.send);
  const stop = useChatStore((s) => s.stop);
  const retryAnswer = useChatStore((s) => s.retryAnswer);
  const agents = useChatStore((s) => s.agents);
  const { loadAgents, syncServerConversations, loadServerTranscript } = useChatStore.getState();
  const workspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");

  const { view: webView } = useWebSettings(workspaceId, isAiConfigured());
  const webAvailable = webView.status === "ready" && webView.enabled;
  const researchAvailable = webAvailable && webView.status === "ready" && webView.research === true;

  const [text, setText] = useState("");
  const [onboarding, setOnboarding] = useState<null | "ask" | "choose">(null);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const { agentId, chips, selection, setAgentId, setChips, setSelection, claim } = useAssistantDraft();
  useEffect(() => { claim(userId); }, [claim, userId]);
  const panel = useAgentPanel(agents);

  useEffect(() => { initConnectors(); }, [initConnectors]);
  const active = conversations.find((c) => c.id === activeId) ?? null;
  useEffect(() => { if (!active) createConversation(); }, [active, createConversation]);
  const requestedAgent = useAgentRequest((s) => s.agentId);
  const [takenAgent, setTakenAgent] = useState<string | null>(null);
  if (requestedAgent && requestedAgent !== takenAgent) {
    setTakenAgent(requestedAgent);
    setAgentId(requestedAgent);
  } else if (!requestedAgent && takenAgent) setTakenAgent(null);
  useEffect(() => {
    if (!useAgentRequest.getState().take()) return;
    createConversation();
  }, [requestedAgent, createConversation]);
  useEffect(() => { void loadAgents(); }, [loadAgents]);
  useEffect(() => { if (workspaceId && isAiConfigured()) void syncServerConversations(workspaceId); }, [workspaceId, syncServerConversations]);
  useEffect(() => { if (activeId) void loadServerTranscript(activeId); }, [activeId, loadServerTranscript]);

  useEffect(
    () =>
      subscribeAssistantHandoff((pending) => {
        setAttachments((current) => mergeAttachments(
            current,
            pending.attachments.map((path) => ({ path, name: "image", kind: "image" as const })),
            MAX_ATTACHMENTS,
          ));
        if (pending.text) setText((current) => mergeHandoffText(current, pending.text));
        const { pageId } = pending;
        if (pageId) {
          const title = usePageStore.getState().pageById(pageId)?.title || "Untitled";
          const draft = useAssistantDraft.getState();
          draft.setChips(addContextChip(draft.chips, { id: pageId, kind: "page", label: title, pageId }).chips);
        }
      }),
    [],
  );

  const messages = useMemo(() => allMessages.filter((m) => m.conversationId === activeId), [allMessages, activeId]);
  const trailCount = useMemo(() => sourcesOf(messages).length + activitiesOf(messages).length, [messages]);
  const firstName = useUserStore((state) => state.activePersona()?.name?.split(/\s+/)[0] ?? "");
  const [focusSignal, setFocusSignal] = useState(0);
  const pick = (prompt: string) => { setText(prompt); setFocusSignal((signal) => signal + 1); };

  const nextAgent = agents.find((agent) => agent.id === agentId) ?? null;
  const streaming = messages.some((m) => m.status === "streaming");
  const hasConnection = connectedSnaps.length > 0;
  const needsConnection = !getInferencePort().stream;
  const fallbackConnector = connectedSnaps[0]?.providerKey ?? "anthropic";

  const submit = (explicit?: string) => {
    const value = (explicit ?? text).trim();
    if (!active || !value || panel.isRunning()) return;
    if (needsConnection && !hasConnection) { setText(value); setOnboarding("ask"); return; }
    const toggles = useWebToggle.getState().takeAll();
    const web = toggles.web && webAvailable;
    const research = toggles.research && researchAvailable;
    const sel = {
      connectorId: fallbackConnector,
      model: selection.model || "auto",
      connectionId: selection.connectionId,
      ...(agentId ? { agentId } : {}),
      attachments: toRunAttachments(attachments),
      ...(chips.length > 0 || web || research ? { context: buildRunContext(chips, web, research) } : {}),
    };
    void (panel.active ? panel.sendToPanel(active.id, value, sel) : send(active.id, value, sel));
    setText("");
    setAttachments([]);
  };

  const onConnected = () => {
    setOnboarding(null);
    const value = text.trim();
    if (!active || !value) return;
    const connected = Object.values(useConnectorStore.getState().snapshots).find((x) => x.state === "connected");
    const toggles = useWebToggle.getState().takeAll();
    const web = toggles.web && webAvailable;
    const research = toggles.research && researchAvailable;
    void send(active.id, value, {
      connectorId: connected?.providerKey ?? fallbackConnector,
      model: selection.model || "auto",
      connectionId: selection.connectionId,
      ...(web || research ? { context: buildRunContext([], web, research) } : {}),
    });
    setText("");
  };

  const onConnect = () => {
    if (isAiConfigured()) {
      openSettings("ai_connections");
      return;
    }
    setOnboarding("choose");
  };

  const composerProps = {
    value: text,
    onChange: setText,
    onSubmit: () => submit(),
    onConnect,
    selection,
    onSelectionChange: setSelection,
    chips,
    onChipsChange: setChips,
    agents,
    agentId,
    onAgentChange: setAgentId,
    panel: panel.panelIds,
    onPanelChange: panel.setPanelIds,
    attachments,
    onAttachmentsChange: setAttachments,
    webAvailable,
    researchAvailable,
    streaming,
    onStop: () => { panel.cancel(); if (active) stop(active.id); },
  };
  return {
    messages, active, nextAgent, trailCount, composerProps, pick, firstName, focusSignal, streaming,
    onboarding, setOnboarding, onConnected, retryAnswer, createConversation,
  };
};
