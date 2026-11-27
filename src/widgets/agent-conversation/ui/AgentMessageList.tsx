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
import { Bot } from "lucide-react";

import type { AgentMessage } from "../model/types";
import { AgentToolEvents } from "./AgentToolEvents";

/** The clock time of an ISO instant, in the reader's locale. */
function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

interface AgentMessageListProps {
  messages: AgentMessage[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

/** The scrolling thread: one article per turn. */
export const AgentMessageList: React.FC<AgentMessageListProps> = ({ messages, scrollRef }) => (
  <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5">
    <div className="mx-auto flex max-w-4xl flex-col gap-3">
      {messages.map((message) => (
        <article key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
          {message.role === "assistant" ? (
            <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--osio-bg-subtle)] text-[var(--osio-accent)]"><Bot size={16} aria-hidden="true" /></span>
          ) : null}
          <div className={`max-w-[min(44rem,85%)] rounded-lg border px-3 py-2 ${message.role === "user" ? "border-[var(--osio-accent)] bg-[var(--osio-accent)] text-[var(--osio-accent-fg)]" : "border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)]"}`}>
            <div className="mb-1 flex items-center gap-2 text-xs opacity-80"><span>{message.role === "user" ? "You" : "Claude MCP"}</span><span>{formatTime(message.createdAt)}</span></div>
            {message.body ? <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p> : <p className="text-sm text-[var(--osio-fg-muted)]">Claude is writing...</p>}
            {message.toolEvents?.length ? <AgentToolEvents events={message.toolEvents} /> : null}
          </div>
        </article>
      ))}
    </div>
  </div>
);
