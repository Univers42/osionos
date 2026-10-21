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

import type { ChatMessage } from "@/features/chat/model/chatTypes";
import { citationsFromParts } from "@/features/chat/model/citations";
import { renderCitationSources, renderCitedAnswer } from "@/features/chat/model/citedAnswer";
import { openCitation } from "@/features/chat/model/openCitation";
import { toolActivitiesFromParts } from "@/features/chat/model/toolActivity";
import { ToolActivity } from "@/features/chat/model/toolActivityView";
import { permissionsFromParts } from "@/features/chat/model/approvalParts";
import { provenanceTitles } from "@/features/chat/model/approvalCard";
import { ApprovalCard } from "@/features/chat/ui/ApprovalCard";
import { useChatStore } from "@/features/chat/model/useChatStore";
import { RunErrorNotice } from "@/features/chat/model/runErrorNotice";

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
 *
 * The sources of the answer are marked in it: a `[n]` with a source becomes a
 * small button that opens the page, and the sources themselves are listed
 * under the answer.
 *
 * The calls the assistant made to its tools are above the answer: one line
 * per call, so the reader sees it work instead of waiting in silence.
 *
 * The cards of the writes it asked for are under the answer: the user sees
 * what the assistant wants to write, and decides.
 */
const AssistantAnswer: React.FC<{
  content: string;
  parts?: ChatMessage["parts"];
  conversationId: string;
}> = ({ content, parts, conversationId }) => {
  const citations = useMemo(() => citationsFromParts(parts), [parts]);
  const activities = useMemo(() => toolActivitiesFromParts(parts), [parts]);
  const permissions = useMemo(() => permissionsFromParts(parts), [parts]);
  const elements = useMemo(() => renderCitedAnswer(content, citations, openCitation), [content, citations]);
  return (
    <>
      <ToolActivity activities={activities} />
      <div className="min-w-0 [&_a]:text-[var(--osio-accent)] [&_h1]:my-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:my-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:my-1 [&_h3]:font-semibold [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-xs [&_pre]:bg-[var(--osio-bg-muted)] [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-xs [&_strong]:font-semibold [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5">
        {elements}
      </div>
      {renderCitationSources(citations, openCitation)}
      {permissions.map((permission) => (
        <ApprovalCard
          key={permission.approvalId}
          approvalId={permission.approvalId}
          provenanceTitles={provenanceTitles(permission.provenancePageIds, citations)}
          onOpenPage={(pageId) => openCitation({ n: 0, pageId, title: "", snippet: "" })}
          onContinuation={(runId) => {
            void useChatStore.getState().followUp(conversationId, runId);
          }}
        />
      ))}
    </>
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
                <AssistantAnswer content={m.content} parts={m.parts} conversationId={m.conversationId} />
              )}
              {m.status === "streaming" ? (
                <span className="ml-0.5 animate-pulse text-[var(--osio-fg-muted)]" data-testid="chat-streaming">
                  …
                </span>
              ) : null}
              {m.status === "error" ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--osio-border-default)] pt-2 text-xs text-[var(--osio-fg-muted)]">
                  <RunErrorNotice
                    code={m.errorCode ?? "internal"}
                    retryAfter={m.retryAfterSeconds}
                    onRetry={onRetry && retryText !== null ? () => onRetry(retryText) : undefined}
                  />
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
