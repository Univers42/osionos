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

import { useEffect, useMemo, useState, type RefObject } from "react";
import { useChatStore, getInferencePort, conversationsOf, isUntouchedConversation } from "@/features/chat/model/useChatStore";
import { useAgentRequest } from "@/features/chat/model/agentRequest";
import { mergeAttachments, mergeHandoffText, subscribeAssistantHandoff, toRunAttachments } from "@/features/chat/model/assistantHandoff";
import type { ComposerAttachment } from "@/features/chat/model/assistantHandoff";
import { useConnectorStore } from "@/features/connectors/model/useConnectorStore";
import { isAiConfigured } from "@/features/ai/api/aiClient";
import { PLATFORM_CONNECTION_ID, readAiSelection, type AiSelection } from "@/features/ai/model/aiSelection";
import { addContextChip, buildRunContext, type ContextChip } from "@/features/ai/model/aiContext";
import { usePageStore } from "@/store/usePageStore";
import { useWebSettings } from "@/features/ai/model/useWebSettings";
import { useWebToggle } from "@/features/ai/model/webToggle";
import { openSettings } from "@/features/settings/model/settingsNav";
import { MAX_ATTACHMENTS } from "../ui/AttachButton";
import { useUserStore } from "@/features/auth";
import { useAgentPanel } from "./useAgentPanel";
import { usePaneWidth } from "./usePaneWidth";
import { activitiesOf, sourcesOf } from "./conversationTrail";
import { brainLayout, paneSize, togglePanel, toggleRail, type SideChoice } from "./brainLayout";

/**
 * The state and handlers of the assistant screen: the open conversation, the composer's
 * draft, chips, attachments and agent, the connection onboarding, and the rails' layout.
 * Another account's conversation is never shown: switching accounts starts a new one.
 * The Hub's "Try it" request is taken once, and the selection follows it while rendering.
 * The hand-off from a block fills the composer and stays there until the user presses Send.
 * The AI service owns the providers, so a streaming port needs no connector of the app's own.
 * A panel talks one agent at a time: the next message waits for its end. Web toggles are
 * one message's alone and drop when the workspace switch is off.
 */
export const useChatShell = (rootRef: RefObject<HTMLDivElement | null>) => {
  const initConnectors = useConnectorStore((s) => s.init);
  const snapshots = useConnectorStore((s) => s.snapshots);
  const connectedSnaps = useMemo(() => Object.values(snapshots).filter((x) => x.state === "connected"), [snapshots]);
  const allConversations = useChatStore((s) => s.conversations);
  const userId = useUserStore((s) => s.activeUserId);
  const conversations = useMemo(() => conversationsOf(allConversations, userId), [allConversations, userId]);
  const activeId = useChatStore((s) => s.activeConversationId);
  const allMessages = useChatStore((s) => s.messages);
  const createConversation = useChatStore((s) => s.createConversation);
  const setActive = useChatStore((s) => s.setActive);
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
  const [chips, setChips] = useState<ContextChip[]>([]);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [agentId, setAgentId] = useState<string | null>(null);
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
          setChips((current) => addContextChip(current, { id: pageId, kind: "page", label: title, pageId }).chips);
        }
      }),
    [],
  );

  const messages = useMemo(() => allMessages.filter((m) => m.conversationId === activeId), [allMessages, activeId]);
  const history = useMemo(() => {
    const withMessages = new Set(allMessages.map((m) => m.conversationId));
    return conversations.filter((c) => c.id === activeId || !isUntouchedConversation(c, withMessages));
  }, [conversations, allMessages, activeId]);
  const [sources, activities] = useMemo(() => [sourcesOf(messages), activitiesOf(messages)] as const, [messages]);
  const firstName = useUserStore((state) => state.activePersona()?.name?.split(/\s+/)[0] ?? "");
  const [focusSignal, setFocusSignal] = useState(0);
  const pick = (prompt: string) => { setText(prompt); setFocusSignal((signal) => signal + 1); };

  const paneWidth = usePaneWidth(rootRef);
  const [railChoice, setRailChoice] = useState<SideChoice | null>(null);
  const [panelChoice, setPanelChoice] = useState<SideChoice | null>(null);
  const layout = brainLayout(paneWidth, railChoice, panelChoice);
  const { railOpen, railOverlay, panelOpen, panelOverlay } = layout;
  const shut: SideChoice = { open: false, size: paneSize(paneWidth) };
  const nextAgent = agents.find((agent) => agent.id === agentId) ?? null;
  const streaming = messages.some((m) => m.status === "streaming");
  const hasConnection = connectedSnaps.length > 0;
  const needsConnection = !getInferencePort().stream;
  const fallbackConnector = connectedSnaps[0]?.providerKey ?? "anthropic";
  const [selection, setSelection] = useState<AiSelection>(
    () => readAiSelection() ?? { connectionId: PLATFORM_CONNECTION_ID, model: "" },
  );

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
  const onToggleRail = () => {
    const next = toggleRail(paneWidth, layout);
    setRailChoice(next.rail);
    if (next.panel !== undefined) setPanelChoice(next.panel);
  };
  const onTogglePanel = () => {
    const next = togglePanel(paneWidth, layout);
    setPanelChoice(next.panel);
    if (next.rail !== undefined) setRailChoice(next.rail);
  };
  const openConversation = (id: string) => { setActive(id); if (railOverlay) setRailChoice(shut); };
  const newConversation = () => { createConversation(); if (railOverlay) setRailChoice(shut); };

  return {
    railOpen, railOverlay, panelOpen, panelOverlay, history, activeId, agents, agentId, setAgentId,
    messages, active, nextAgent, sources, activities, composerProps, pick, firstName, focusSignal, streaming,
    selection, chips, onboarding, setOnboarding, onConnected, retryAnswer, setPanelChoice, shut,
    onToggleRail, onTogglePanel, openConversation, newConversation, createConversation,
  };
};
