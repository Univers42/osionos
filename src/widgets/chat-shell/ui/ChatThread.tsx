/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ChatThread.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useRef } from "react";
import { RotateCcw } from "lucide-react";

import type { ChatMessage } from "@/features/chat/model/chatTypes";
import { renderAssistantMarkdown } from "@/features/chat/model/assistantMarkdown";
import { errorWords } from "./errorWords";

interface Props {
  messages: ChatMessage[];
  /** Re-sends the text of a failed answer. */
  onRetry?: (text: string) => void;
}

/**
 * The assistant's answer, as markdown.
 *
 * The engine the app already has renders it: lists, emphasis, headings, code
 * and links. No raw HTML, no remote images (see assistantMarkdown.ts). The
 * answer is re-parsed as the deltas arrive, so a half-written `**` never
 * breaks the layout.
 */
const AssistantAnswer: React.FC<{ content: string }> = ({ content }) => {
  const elements = useMemo(() => renderAssistantMarkdown(content), [content]);
  return (
    <div className="min-w-0 [&_a]:text-[var(--osio-accent)] [&_h1]:my-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:my-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:my-1 [&_h3]:font-semibold [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-xs [&_pre]:bg-[var(--osio-bg-muted)] [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-xs [&_strong]:font-semibold [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5">
      {elements}
    </div>
  );
};

/** The message thread: user turns (accent, right) and assistant turns (subtle, left). */
export const ChatThread: React.FC<Props> = ({ messages, onRetry }) => {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  /** The text a failed answer answers: the user turn right before it. */
  const textBefore = (index: number): string | null => {
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const candidate = messages[cursor];
      if (candidate.role === "user") return candidate.content;
    }
    return null;
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6" data-testid="chat-thread">
      {messages.map((m, index) => {
        const retryText = m.status === "error" ? textBefore(index) : null;
        return (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              data-role={m.role}
              data-status={m.status}
              className={`max-w-[80%] break-words rounded-2xl px-4 py-2.5 text-sm ${
                m.role === "user"
                  ? "whitespace-pre-wrap bg-[var(--osio-accent)] text-[var(--osio-accent-fg)]"
                  : "bg-[var(--osio-bg-subtle)] text-[var(--osio-fg-default)]"
              }`}
            >
              {m.role === "user" ? (
                <span className="whitespace-pre-wrap">{m.content}</span>
              ) : (
                <AssistantAnswer content={m.content} />
              )}
              {m.status === "streaming" ? (
                <span className="ml-0.5 animate-pulse text-[var(--osio-fg-muted)]" data-testid="chat-streaming">
                  …
                </span>
              ) : null}
              {m.status === "error" ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--osio-border-default)] pt-2 text-xs text-[var(--osio-fg-muted)]">
                  <span data-testid="chat-error">{errorWords(m.errorCode)}</span>
                  {onRetry && retryText !== null ? (
                    <button
                      type="button"
                      onClick={() => onRetry(retryText)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]"
                    >
                      <RotateCcw size={12} /> Retry
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
};
