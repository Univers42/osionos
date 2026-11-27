/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AgentMessageList.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import React from "react";

import { TypingDots } from "@/shared/ui/typing/TypingDots";
import { AssistantAvatar } from "@/shared/ui/mascot/AssistantAvatar";

import type { AgentMessage } from "../model/types";
import { AgentToolEvents } from "./AgentToolEvents";

/** The clock time of an ISO instant, in the reader's locale. */
function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

/** The person's turn: an accent-tinted bubble on the right, the chat family's look. */
const UserTurn: React.FC<{ message: AgentMessage }> = ({ message }) => (
  <article className="flex justify-end">
    <div data-role="user" className="max-w-[80%] break-words rounded-2xl rounded-br-md bg-[color-mix(in_srgb,var(--osio-accent)_14%,var(--osio-bg-surface))] px-4 py-2.5 text-sm text-[var(--osio-fg-default)]">
      <span className="sr-only">You: </span>
      <p className="whitespace-pre-wrap">{message.body}</p>
    </div>
  </article>
);

/** Claude's turn: avatar, name and time, then plain text; typing dots while nothing has arrived. */
const AssistantTurn: React.FC<{ message: AgentMessage; pending: boolean }> = ({ message, pending }) => (
  <article className="flex flex-col gap-1.5">
    <div className="flex items-center gap-2 text-xs text-[var(--osio-fg-muted)]">
      <AssistantAvatar size={24} />
      <span className="font-medium text-[var(--osio-fg-default)]">Claude</span>
      <span>{formatTime(message.createdAt)}</span>
    </div>
    <div className="pl-8">
      {message.body ? <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p> : null}
      {pending ? (
        <div role="status" aria-live="polite" className="inline-flex h-6 items-center text-[var(--osio-fg-muted)]">
          <TypingDots />
          <span className="sr-only">Claude is writing</span>
        </div>
      ) : null}
      {message.toolEvents?.length ? <AgentToolEvents events={message.toolEvents} /> : null}
    </div>
  </article>
);

interface AgentMessageListProps {
  messages: AgentMessage[];
  running: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

/** The scrolling thread in a reading column. */
export const AgentMessageList: React.FC<AgentMessageListProps> = ({ messages, running, scrollRef }) => (
  <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5">
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      {messages.map((message, index) => (
        message.role === "user"
          ? <UserTurn key={message.id} message={message} />
          : <AssistantTurn key={message.id} message={message} pending={running && index === messages.length - 1 && !message.body} />
      ))}
    </div>
  </div>
);
