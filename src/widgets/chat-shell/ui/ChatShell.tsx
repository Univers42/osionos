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

import React, { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { useChatStore, getInferencePort } from "@/features/chat/model/useChatStore";
import { mergeAttachments, subscribeAssistantHandoff } from "@/features/chat/model/assistantHandoff";
import { useConnectorStore } from "@/features/connectors/model/useConnectorStore";
import { isAiConfigured } from "@/features/ai/api/aiClient";
import { PLATFORM_CONNECTION_ID, readAiSelection, type AiSelection } from "@/features/ai/model/aiSelection";
import { buildRunContext, type ContextChip } from "@/features/ai/model/aiContext";
import { openSettings } from "@/features/settings/model/settingsNav";
import { MAX_ATTACHMENTS } from "./AttachImageButton";
import { ConversationRow } from "@/features/chat/ui/ConversationRow";
import { useUserStore } from "@/features/auth";
import { ChatComposer } from "./ChatComposer";
import { ChatThread } from "./ChatThread";
import { EmptyStateHero } from "./EmptyStateHero";
import { ConnectionOnboarding } from "./ConnectionOnboarding";

/** The multi-model AI Chat Shell. Talking without a connection triggers a guided
 *  setup; once connected, the pending message is sent automatically. */
export const ChatShell: React.FC = () => {
  const initConnectors = useConnectorStore((s) => s.init);
  const snapshots = useConnectorStore((s) => s.snapshots);
  const connectedSnaps = useMemo(() => Object.values(snapshots).filter((x) => x.state === "connected"), [snapshots]);
  const conversations = useChatStore((s) => s.conversations);
  const activeId = useChatStore((s) => s.activeConversationId);
  const allMessages = useChatStore((s) => s.messages);
  const createConversation = useChatStore((s) => s.createConversation);
  const setActive = useChatStore((s) => s.setActive);
  const send = useChatStore((s) => s.send);
  const stop = useChatStore((s) => s.stop);
  // The built-in agents the service offers: the shapes a run can take.
  const agents = useChatStore((s) => s.agents);
  const loadAgents = useChatStore((s) => s.loadAgents);
  const syncServerConversations = useChatStore((s) => s.syncServerConversations);
  const loadServerTranscript = useChatStore((s) => s.loadServerTranscript);
  const workspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");

  const [text, setText] = useState("");
  const [onboarding, setOnboarding] = useState<null | "ask" | "choose">(null);
  // What the answer is read from: the pages the reader pointed at, and whether
  // the whole workspace is searched.
  const [chips, setChips] = useState<ContextChip[]>([]);
  const [attachments, setAttachments] = useState<string[]>([]);
  // The agent of the next run: none is the general assistant.
  const [agentId, setAgentId] = useState<string | null>(null);

  useEffect(() => { initConnectors(); }, [initConnectors]);
  useEffect(() => { if (!activeId) createConversation(); }, [activeId, createConversation]);
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
        setAttachments((current) => mergeAttachments(current, pending.attachments, MAX_ATTACHMENTS));
        if (pending.text) setText((current) => (current.trim() ? current : pending.text));
      }),
    [],
  );

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const messages = allMessages.filter((m) => m.conversationId === activeId);
  const streaming = messages.some((m) => m.status === "streaming");
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
    if (!active || !value) return;
    if (needsConnection && !hasConnection) { setText(value); setOnboarding("ask"); return; } // ask to connect, keep the message
    void send(active.id, value, {
      connectorId: fallbackConnector,
      model: selection.model || "auto",
      connectionId: selection.connectionId,
      // The agent of this run: the one the reader picked, or none.
      ...(agentId ? { agentId } : {}),
      attachments: attachments
        .map((path) => {
          if (path.startsWith("/api/media/")) return { kind: "media" as const, path };
          return { kind: "chat" as const, id: path.split("/").pop() ?? "" };
        }),
      // What the answer may read: the pages the reader pointed at.
      ...(chips.length > 0 ? { context: buildRunContext(chips) } : {}),
    });
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
    void send(active.id, value, {
      connectorId: connected?.providerKey ?? fallbackConnector,
      model: selection.model || "auto",
      connectionId: selection.connectionId,
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
    attachments,
    onAttachmentsChange: setAttachments,
    streaming,
    onStop: () => { if (active) stop(active.id); },
  };

  return (
    <div className="flex h-full w-full bg-[var(--osio-bg-page)]">
      <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--osio-border-default)]">
        <button
          type="button"
          onClick={() => createConversation()}
          className="m-2 flex items-center gap-2 rounded-lg border border-[var(--osio-border-default)] px-3 py-2 text-sm text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]"
        >
          <Plus size={16} /> New conversation
        </button>
        <nav className="flex-1 overflow-y-auto px-2 pb-3" aria-label="Conversations">
          {conversations.map((c) => (
            <ConversationRow
              key={c.id}
              conversation={c}
              isCurrent={c.id === activeId}
              onOpen={() => setActive(c.id)}
              openClassName={`mb-0.5 block truncate rounded-md px-3 py-2 text-left text-sm transition-colors ${
                c.id === activeId ? "bg-[var(--osio-bg-subtle)] text-[var(--osio-fg-default)]" : "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"
              }`}
            >
              {c.title}
            </ConversationRow>
          ))}
        </nav>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {messages.length === 0 ? (
          <EmptyStateHero
            {...composerProps}
            onPick={(s) => submit(s)}
            attachments={attachments}
            onAttachmentsChange={setAttachments}
          />
        ) : (
          <>
            <div className="flex-1 overflow-y-auto">
              <ChatThread messages={messages} onRetry={(retryText) => { if (active) void send(active.id, retryText); }} />
            </div>
            <div className="mx-auto w-full max-w-3xl px-4 pb-4"><ChatComposer {...composerProps} /></div>
          </>
        )}
      </section>

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
