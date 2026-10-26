/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ChatShell.tsx                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useRef, useState } from "react";

import { useChatStore, getInferencePort, conversationsOf, isUntouchedConversation } from "@/features/chat/model/useChatStore";
import { useAgentRequest } from "@/features/chat/model/agentRequest";
import { mergeAttachments, subscribeAssistantHandoff, toRunAttachments } from "@/features/chat/model/assistantHandoff";
import type { ComposerAttachment } from "@/features/chat/model/assistantHandoff";
import { useConnectorStore } from "@/features/connectors/model/useConnectorStore";
import { isAiConfigured } from "@/features/ai/api/aiClient";
import { PLATFORM_CONNECTION_ID, readAiSelection, type AiSelection } from "@/features/ai/model/aiSelection";
import { buildRunContext, type ContextChip } from "@/features/ai/model/aiContext";
import { useWebSettings } from "@/features/ai/model/useWebSettings";
import { useWebToggle } from "@/features/ai/model/webToggle";
import { openSettings } from "@/features/settings/model/settingsNav";
import { MAX_ATTACHMENTS } from "./AttachButton";
import { useUserStore } from "@/features/auth";
import { ChatComposer } from "./ChatComposer";
import { ChatThread } from "./ChatThread";
import { EmptyStateHero } from "./EmptyStateHero";
import { ConnectionOnboarding } from "./ConnectionOnboarding";
import { BrainRail } from "./BrainRail";
import { BrainHeader } from "./BrainHeader";
import { BrainContextPanel } from "./BrainContextPanel";
import { BrainLens } from "./BrainLens";
import { useAgentPanel } from "../model/useAgentPanel";
import { usePaneWidth } from "../model/usePaneWidth";
import { activitiesOf, sourcesOf } from "../model/conversationTrail";
import { brainLayout, paneSize, togglePanel, toggleRail, type SideChoice } from "../model/brainLayout";

/** The assistant: the chats and agents on the left, the conversation in the middle, and what it
 *  reads and does on the right. Talking without a connection triggers a guided setup; once
 *  connected, the pending message is sent automatically. */
export const ChatShell: React.FC = () => {
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
  // The built-in agents the service offers: the shapes a run can take.
  const agents = useChatStore((s) => s.agents);
  const { loadAgents, syncServerConversations, loadServerTranscript } = useChatStore.getState();
  const workspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");

  // The workspace switch of the web tools: the toggle is drawn only when the server says it is on.
  const { view: webView } = useWebSettings(workspaceId, isAiConfigured());
  const webAvailable = webView.status === "ready" && webView.enabled;

  const [text, setText] = useState("");
  const [onboarding, setOnboarding] = useState<null | "ask" | "choose">(null);
  // What the answer is read from: the pages the reader pointed at, and whether
  // the whole workspace is searched.
  const [chips, setChips] = useState<ContextChip[]>([]);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  // The agent of the next run: none is the general assistant.
  const [agentId, setAgentId] = useState<string | null>(null);
  const panel = useAgentPanel(agents);

  useEffect(() => { initConnectors(); }, [initConnectors]);
  // Another account's conversation is never shown: switching accounts starts a new one.
  const active = conversations.find((c) => c.id === activeId) ?? null;
  useEffect(() => { if (!active) createConversation(); }, [active, createConversation]);
  // "Try it" in the Hub: a fresh conversation with that agent selected. A request waiting
  // before this mounts is taken here, once.
  const requestedAgent = useAgentRequest((s) => s.agentId);
  const [takenAgent, setTakenAgent] = useState<string | null>(null);
  // Adjusted while rendering, not in an effect: the selection follows the request at once.
  if (requestedAgent && requestedAgent !== takenAgent) {
    setTakenAgent(requestedAgent);
    setAgentId(requestedAgent);
  } else if (!requestedAgent && takenAgent) setTakenAgent(null);
  useEffect(() => {
    if (!useAgentRequest.getState().take()) return;
    // An untouched chat is reused by the store itself.
    createConversation();
  }, [requestedAgent, createConversation]);
  // The list of the agents, once: the service owns it.
  useEffect(() => { void loadAgents(); }, [loadAgents]);
  // The conversations of the account, once: another browser may have started them.
  useEffect(() => { if (workspaceId && isAiConfigured()) void syncServerConversations(workspaceId); }, [workspaceId, syncServerConversations]);
  // A conversation that came from the service has no local message until it is opened.
  useEffect(() => { if (activeId) void loadServerTranscript(activeId); }, [activeId, loadServerTranscript]);

  /**
   * The hand-off from a block: the image the user pointed at, waiting for the
   * composer. It is taken on mount and whenever it changes — and the image
   * stays in the composer until the user presses Send (devil C79).
   */
  useEffect(
    () =>
      subscribeAssistantHandoff((pending) => {
        setAttachments((current) => mergeAttachments(
            current,
            pending.attachments.map((path) => ({ path, name: "image", kind: "image" as const })),
            MAX_ATTACHMENTS,
          ));
        if (pending.text) setText((current) => (current.trim() ? current : pending.text));
      }),
    [],
  );

  const messages = useMemo(() => allMessages.filter((m) => m.conversationId === activeId), [allMessages, activeId]);
  // The history lists chats that were used; the open one is listed even while empty.
  const history = useMemo(() => {
    const withMessages = new Set(allMessages.map((m) => m.conversationId));
    return conversations.filter((c) => c.id === activeId || !isUntouchedConversation(c, withMessages));
  }, [conversations, allMessages, activeId]);
  const [sources, activities] = useMemo(() => [sourcesOf(messages), activitiesOf(messages)] as const, [messages]);
  const firstName = useUserStore((state) => state.activePersona()?.name?.split(/\s+/)[0] ?? "");
  // A starter puts its prompt in the composer and hands the focus back to it.
  const [focusSignal, setFocusSignal] = useState(0);
  const pick = (prompt: string) => { setText(prompt); setFocusSignal((signal) => signal + 1); };

  // The rails follow the pane until the reader opens or closes one.
  const rootRef = useRef<HTMLDivElement>(null);
  const paneWidth = usePaneWidth(rootRef);
  const [railChoice, setRailChoice] = useState<SideChoice | null>(null);
  const [panelChoice, setPanelChoice] = useState<SideChoice | null>(null);
  const layout = brainLayout(paneWidth, railChoice, panelChoice);
  const { railOpen, railOverlay, panelOpen, panelOverlay } = layout;
  const shut: SideChoice = { open: false, size: paneSize(paneWidth) };
  const nextAgent = agents.find((agent) => agent.id === agentId) ?? null;  const streaming = messages.some((m) => m.status === "streaming");
  const hasConnection = connectedSnaps.length > 0;
  // The AI service owns the providers, so a streaming port needs no connector
  // of the app's own. The offline stub does: it stands in for a provider.
  const needsConnection = !getInferencePort().stream;
  const fallbackConnector = connectedSnaps[0]?.providerKey ?? "anthropic";
  // The choice the user made — a connection and a model — is remembered on the
  // device and sent with every run.
  const [selection, setSelection] = useState<AiSelection>(
    () => readAiSelection() ?? { connectionId: PLATFORM_CONNECTION_ID, model: "" },
  );

  const submit = (explicit?: string) => {
    const value = (explicit ?? text).trim();
    // A panel talks one agent at a time: the next message waits for its end.
    if (!active || !value || panel.isRunning()) return;
    if (needsConnection && !hasConnection) { setText(value); setOnboarding("ask"); return; } // ask to connect, keep the message
    // The toggle is this message's alone: taking it puts it back to off. A switch turned off since drops it.
    const web = useWebToggle.getState().take() && webAvailable;
    const sel = {
      connectorId: fallbackConnector,
      model: selection.model || "auto",
      connectionId: selection.connectionId,
      // The agent of this run: the one the reader picked, or none.
      ...(agentId ? { agentId } : {}),
      attachments: toRunAttachments(attachments),
      // What the answer may read: the pages the reader pointed at.
      ...(chips.length > 0 || web ? { context: buildRunContext(chips, web) } : {}),
    };
    void (panel.active ? panel.sendToPanel(active.id, value, sel) : send(active.id, value, sel));
    setText("");
    setAttachments([]);
  };

  // Connecting through the onboarding modal flushes the pending message (read the
  // freshly-connected provider from the store so we don't use a stale fallback).
  const onConnected = () => {
    setOnboarding(null);
    const value = text.trim();
    if (!active || !value) return;
    const connected = Object.values(useConnectorStore.getState().snapshots).find((x) => x.state === "connected");
    const web = useWebToggle.getState().take() && webAvailable;
    void send(active.id, value, {
      connectorId: connected?.providerKey ?? fallbackConnector,
      model: selection.model || "auto",
      connectionId: selection.connectionId,
      ...(web ? { context: buildRunContext([], true) } : {}),
    });
    setText("");
  };

  // With a service, the app's own connectors do not connect a model: the panel
  // in Settings does. Without one (the offline stub), the local connectors are
  // the only way to talk to a model at all.
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
    streaming,
    onStop: () => { panel.cancel(); if (active) stop(active.id); },
  };

  const overlay = "absolute inset-y-0 z-30 shadow-osio-e4";
  return (
    <div ref={rootRef} className="relative flex h-full w-full bg-[var(--osio-bg-page)]">
      {railOpen ? (
        <div className={railOverlay ? `${overlay} left-0` : "h-full"}>
          <BrainRail
            conversations={history}
            activeId={activeId}
            onOpen={(id) => { setActive(id); if (railOverlay) setRailChoice(shut); }}
            onNew={() => { createConversation(); if (railOverlay) setRailChoice(shut); }}
            agents={agents}
            agentId={agentId}
            onPickAgent={setAgentId}
          />
        </div>
      ) : null}

      <section className="@container flex min-w-0 flex-1 flex-col">
        <BrainHeader
          title={messages.length === 0 ? "New chat" : active?.title ?? "New chat"}
          agent={nextAgent}
          railOpen={railOpen}
          onToggleRail={() => {
            const next = toggleRail(paneWidth, layout);
            setRailChoice(next.rail);
            if (next.panel !== undefined) setPanelChoice(next.panel);
          }}
          panelOpen={panelOpen}
          onTogglePanel={() => {
            const next = togglePanel(paneWidth, layout);
            setPanelChoice(next.panel);
            if (next.rail !== undefined) setRailChoice(next.rail);
          }}
          trailCount={sources.length + activities.length}
          onNew={() => createConversation()}
        />
        {messages.length === 0 ? (
          <EmptyStateHero
            {...composerProps}
            onPick={pick}
            firstName={firstName}
            focusSignal={focusSignal}
          />
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ChatThread messages={messages} onRetry={(retryText) => { if (active) void send(active.id, retryText); }} />
            </div>
            <div className="mx-auto w-full max-w-3xl px-6 pb-5">
              <BrainLens working={streaming}>
                <ChatComposer {...composerProps} focusSignal={focusSignal} />
              </BrainLens>
            </div>
          </>
        )}
      </section>

      {panelOpen ? (
        <div className={panelOverlay ? `${overlay} right-0` : "h-full"}>
          <BrainContextPanel
            chips={chips}
            selection={selection}
            sources={sources}
            activities={activities}
            onClose={() => setPanelChoice(shut)}
          />
        </div>
      ) : null}

      <ConnectionOnboarding
        key={onboarding ?? "closed"}
        open={onboarding !== null}
        initialStep={onboarding ?? "ask"}
        onClose={() => setOnboarding(null)}
        onConnected={onConnected}
      />
    </div>
  );
};
