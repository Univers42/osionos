/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ChatThread.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useRef } from "react";

import type { ChatMessage } from "@/features/chat/model/chatTypes";

/** The message thread: user turns (accent, right) and assistant turns (subtle, left). */
export const ChatThread: React.FC<{ messages: ChatMessage[] }> = ({ messages }) => {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6" data-testid="chat-thread">
      {messages.map((m) => (
        <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
          <div
            data-role={m.role}
            className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm ${
              m.role === "user"
                ? "bg-[var(--osio-accent)] text-[var(--osio-accent-fg)]"
                : "bg-[var(--osio-bg-subtle)] text-[var(--osio-fg-default)]"
            }`}
          >
            {m.content}
          </div>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
};
