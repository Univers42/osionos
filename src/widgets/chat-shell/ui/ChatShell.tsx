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

import React from "react";

import { useUIStore } from "@/shared/config/uiStore";
import { BrainHeader } from "./BrainHeader";
import { BrainLens } from "./BrainLens";
import { ChatComposer } from "./ChatComposer";
import { ChatThread } from "./ChatThread";
import { ConnectionOnboarding } from "./ConnectionOnboarding";
import { EmptyStateHero } from "./EmptyStateHero";
import { useChatShell } from "../model/useChatShell";

/** The assistant's conversation. The chats, who answers and what the chat reads live in the
 *  sidebar's Assistant panel (`AssistantPanel`). Talking without a connection triggers a guided
 *  setup; once connected, the pending message is sent automatically. State lives in `useChatShell`. */
export const ChatShell: React.FC = () => {
  const shell = useChatShell();
  const { composerProps, messages, streaming, onboarding } = shell;
  return (
    <div className="relative flex h-full w-full bg-[var(--osio-bg-page)]">
      <section className="@container flex min-w-0 flex-1 flex-col">
        <BrainHeader
          title={messages.length === 0 ? "New chat" : shell.active?.title ?? "New chat"}
          agent={shell.nextAgent}
          trailCount={shell.trailCount}
          onShowPanel={() => useUIStore.getState().expandToPanel("assistant")}
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
