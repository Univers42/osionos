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

import { useChatStore } from "@/features/chat/model/useChatStore";
import { useConnectorStore } from "@/features/connectors/model/useConnectorStore";
import { ChatComposer } from "./ChatComposer";
import { ChatThread } from "./ChatThread";
import { EmptyStateHero } from "./EmptyStateHero";
import { ConnectionOnboarding } from "./ConnectionOnboarding";
import { resolveModel } from "./ModelPicker";

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
  const setConversationModel = useChatStore((s) => s.setConversationModel);
  const send = useChatStore((s) => s.send);

  const [text, setText] = useState("");
  const [onboarding, setOnboarding] = useState<null | "ask" | "choose">(null);

  useEffect(() => { initConnectors(); }, [initConnectors]);
  useEffect(() => { if (!activeId) createConversation(); }, [activeId, createConversation]);

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const messages = allMessages.filter((m) => m.conversationId === activeId);
  const hasConnection = connectedSnaps.length > 0;
  const fallbackConnector = connectedSnaps[0]?.providerKey ?? "anthropic";
  const modelValue = active?.model && active.model !== "auto" && active.connectorId ? `${active.connectorId}:${active.model}` : "auto";

  const submit = (explicit?: string) => {
    const value = (explicit ?? text).trim();
    if (!active || !value) return;
    if (!hasConnection) { setText(value); setOnboarding("ask"); return; } // ask to connect, keep the message
    const { connectorId, model } = resolveModel(modelValue, fallbackConnector);
    void send(active.id, value, { connectorId, model });
    setText("");
  };

  // Connecting through the onboarding modal flushes the pending message (read the
  // freshly-connected provider from the store so we don't use a stale fallback).
  const onConnected = () => {
    setOnboarding(null);
    const value = text.trim();
    if (!active || !value) return;
    const connected = Object.values(useConnectorStore.getState().snapshots).find((x) => x.state === "connected");
    const { connectorId, model } = resolveModel(modelValue, connected?.providerKey ?? fallbackConnector);
    void send(active.id, value, { connectorId, model });
    setText("");
  };

  const onModelChange = (next: string) => {
    if (!active) return;
    const { connectorId, model } = resolveModel(next, fallbackConnector);
    setConversationModel(active.id, connectorId, model);
  };

  const composerProps = {
    value: text,
    onChange: setText,
    onSubmit: () => submit(),
    onConnect: () => setOnboarding("choose"),
    model: modelValue,
    onModelChange,
  };

  return (
    <div className="flex h-full w-full bg-[var(--osio-bg-page)]">
      <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--osio-border-default)]">
        <button
          type="button"
          onClick={() => createConversation()}
          className="m-2 flex items-center gap-2 rounded-lg border border-[var(--osio-border-default)] px-3 py-2 text-sm text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]"
        >
          <Plus size={15} /> New conversation
        </button>
        <nav className="flex-1 overflow-y-auto px-2 pb-3" aria-label="Conversations">
          {conversations.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActive(c.id)}
              aria-current={c.id === activeId}
              className={`mb-0.5 block w-full truncate rounded-md px-3 py-2 text-left text-sm transition-colors ${
                c.id === activeId ? "bg-[var(--osio-bg-subtle)] text-[var(--osio-fg-default)]" : "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"
              }`}
            >
              {c.title}
            </button>
          ))}
        </nav>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {messages.length === 0 ? (
          <EmptyStateHero {...composerProps} onPick={(s) => submit(s)} />
        ) : (
          <>
            <div className="flex-1 overflow-y-auto"><ChatThread messages={messages} /></div>
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
