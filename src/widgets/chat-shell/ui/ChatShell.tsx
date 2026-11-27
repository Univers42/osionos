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

import React, { useRef } from "react";

import { BrainContextPanel } from "./BrainContextPanel";
import { BrainHeader } from "./BrainHeader";
import { BrainLens } from "./BrainLens";
import { BrainRail } from "./BrainRail";
import { ChatComposer } from "./ChatComposer";
import { ChatThread } from "./ChatThread";
import { ConnectionOnboarding } from "./ConnectionOnboarding";
import { EmptyStateHero } from "./EmptyStateHero";
import { useChatShell } from "../model/useChatShell";

/** The assistant: the chats and agents on the left, the conversation in the middle, and what it
 *  reads and does on the right. Talking without a connection triggers a guided setup; once
 *  connected, the pending message is sent automatically. State lives in `useChatShell`. */
export const ChatShell: React.FC = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  const shell = useChatShell(rootRef);
  const { composerProps, messages, streaming, railOpen, railOverlay, panelOpen, panelOverlay, onboarding } = shell;
  const overlay = "absolute inset-y-0 z-30 shadow-osio-e4";
  return (
    <div ref={rootRef} className="relative flex h-full w-full bg-[var(--osio-bg-page)]">
      {railOpen ? (
        <div className={railOverlay ? `${overlay} left-0` : "h-full"}>
          <BrainRail
            conversations={shell.history}
            activeId={shell.activeId}
            onOpen={shell.openConversation}
            onNew={shell.newConversation}
            agents={shell.agents}
            agentId={shell.agentId}
            onPickAgent={shell.setAgentId}
          />
        </div>
      ) : null}

      <section className="@container flex min-w-0 flex-1 flex-col">
        <BrainHeader
          title={messages.length === 0 ? "New chat" : shell.active?.title ?? "New chat"}
          agent={shell.nextAgent}
          railOpen={railOpen}
          onToggleRail={shell.onToggleRail}
          panelOpen={panelOpen}
          onTogglePanel={shell.onTogglePanel}
          trailCount={shell.sources.length + shell.activities.length}
          onNew={() => shell.createConversation()}
        />
        {messages.length === 0 ? (
          <EmptyStateHero
            {...composerProps}
            onPick={shell.pick}
            firstName={shell.firstName}
            focusSignal={shell.focusSignal}
          />
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ChatThread messages={messages} onRetry={(answerId) => void shell.retryAnswer(answerId)} />
            </div>
            <div className="mx-auto w-full max-w-3xl px-6 pb-5">
              <BrainLens working={streaming}>
                <ChatComposer {...composerProps} focusSignal={shell.focusSignal} />
              </BrainLens>
            </div>
          </>
        )}
      </section>

      {panelOpen ? (
        <div className={panelOverlay ? `${overlay} right-0` : "h-full"}>
          <BrainContextPanel
            chips={shell.chips}
            selection={shell.selection}
            sources={shell.sources}
            activities={shell.activities}
            onClose={() => shell.setPanelChoice(shell.shut)}
          />
        </div>
      ) : null}

      <ConnectionOnboarding
        key={onboarding ?? "closed"}
        open={onboarding !== null}
        initialStep={onboarding ?? "ask"}
        onClose={() => shell.setOnboarding(null)}
        onConnected={shell.onConnected}
      />
    </div>
  );
};
