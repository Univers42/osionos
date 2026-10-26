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
import { DiagramOutput } from "@/features/diagram/ui/DiagramOutput";
import { AnswerRenderContext, type AnswerRenderState } from "@/features/chat/ui/answerRenderContext";
import { AssistantActions, RouteNote, UserBubble } from "@/features/chat/ui/MessageActions";
import { MessageWindow } from "@/features/chat/ui/MessageWindow";
import { ReasoningNote } from "@/features/chat/ui/ReasoningNote";
import { ReadAloudButton } from "@/features/voice/ui/ReadAloudButton";
import { citationsFromParts } from "@/features/chat/model/citations";
import { renderCitationSources, renderCitedAnswer } from "@/features/chat/model/citedAnswer";
import { ANSWER_TABLE_CLASS } from "@/features/chat/model/assistantMarkdown";
import { openCitation } from "@/features/chat/model/openCitation";
import { toolActivitiesFromParts } from "@/features/chat/model/toolActivity";
import { ToolActivity } from "@/features/chat/model/toolActivityView";
import { permissionsFromParts } from "@/features/chat/model/approvalParts";
import { provenanceTitles } from "@/features/chat/model/approvalCard";
import { ApprovalCard } from "@/features/chat/ui/ApprovalCard";
import { memoryProposalsFromParts } from "@/features/chat/model/memoryParts";
import { MemoryProposalChip } from "@/features/chat/ui/MemoryProposalChip";
import { openSettings } from "@/features/settings/model/settingsNav";
import { useChatStore } from "@/features/chat/model/useChatStore";
import { RunErrorNotice } from "@/features/chat/model/runErrorNotice";
import { AgentAvatar } from "./AgentAvatar";

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
 * what the assistant wants to write, and decides. A memory it proposes is a
 * small chip after them: the user approves it or dismisses it.
 */
/** Draws the LOCKED mermaid source of a fence — the diagram block's own output. */
const drawDiagram: AnswerRenderState["drawDiagram"] = (source) => (
  <DiagramOutput source={source} truncated={false} error={null} />
);

// Memoised on its props (content, status, parts identity): a streaming turn
// does not re-render the finished ones.
const AssistantAnswer = React.memo(function AssistantAnswer({
  content,
  status,
  parts,
  conversationId,
  messageId,
}: {
  content: string;
  status?: ChatMessage["status"];
  parts?: ChatMessage["parts"];
  conversationId: string;
  messageId: string;
}) {
  const citations = useMemo(() => citationsFromParts(parts), [parts]);
  const activities = useMemo(() => toolActivitiesFromParts(parts), [parts]);
  const permissions = useMemo(() => permissionsFromParts(parts), [parts]);
  const proposals = useMemo(() => memoryProposalsFromParts(parts), [parts]);
  const elements = useMemo(() => renderCitedAnswer(content, citations, openCitation), [content, citations]);
  const renderState = useMemo<AnswerRenderState>(
    () => ({ complete: status !== "streaming", drawDiagram }),
    [status],
  );
  return (
    <AnswerRenderContext.Provider value={renderState}>
      <ReasoningNote parts={parts} status={status} content={content} />
      <ToolActivity activities={activities} />
      <div className={`min-w-0 ${ANSWER_TABLE_CLASS} [&_a]:text-[var(--osio-accent)] [&_h1]:my-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:my-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:my-1 [&_h3]:font-semibold [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-xs [&_pre]:bg-[var(--osio-bg-muted)] [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-xs [&_strong]:font-semibold [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5`}>
        {elements}
      </div>
      {renderCitationSources(citations, openCitation)}
      {permissions.map((permission) => (
        <ApprovalCard
          key={permission.approvalId}
          approvalId={permission.approvalId}
          provenanceTitles={provenanceTitles(permission.provenancePageIds, citations)}
          influencedBy={permission.influencedBy}
          onOpenPage={(pageId) => openCitation({ n: 0, collection: "page", pageId, title: "", snippet: "" })}
          onContinuation={(runId) => {
            void useChatStore.getState().followUp(conversationId, runId);
          }}
        />
      ))}
      {proposals.map((proposal) => (
        <MemoryProposalChip
          key={proposal.memoryId}
          proposal={proposal}
          onDecided={(memoryId, decision) => useChatStore.getState().decideMemoryProposal(messageId, memoryId, decision)}
          onManage={() => openSettings("ai_connections")}
        />
      ))}
    </AnswerRenderContext.Provider>
  );
});

const AssistantMessageActions = React.memo(function AssistantMessageActions({
  messageId,
  content,
  feedback,
  route,
}: {
  messageId: string;
  content: string;
  feedback?: ChatMessage["feedback"];
  route?: { primary: string; answeredBy: string; reason: NonNullable<ChatMessage["routeReason"]> };
}) {
  return (
    <div className="mt-1 flex items-center justify-end gap-1">
      {route ? <RouteNote {...route} /> : null}
      <AssistantActions
        content={content}
        feedback={feedback}
        onFeedback={(value) => useChatStore.getState().setFeedback(messageId, value)}
      />
      <ReadAloudButton text={content} />
    </div>
  );
});

const UserTurn = React.memo(function UserTurn({
  messageId,
  content,
  canEdit,
}: {
  messageId: string;
  content: string;
  canEdit: boolean;
}) {
  return (
    <UserBubble
      content={content}
      canEdit={canEdit}
      onResend={(text) => void useChatStore.getState().editAndResend(messageId, text)}
    />
  );
});

/** The model a turn names: the id without its provider prefix and its `:free` tag. */
function modelLabel(model: string): string {
  return (model.split("/").pop() ?? model).replace(/:free$/, "");
}

/** The message thread: the reader's turns as bubbles on the right, the answers as text under who wrote them. */
export const ChatThread: React.FC<Props> = ({ messages, onRetry }) => {
  const endRef = useRef<HTMLDivElement>(null);
  const agents = useChatStore((s) => s.agents);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  // An edit would race a run in flight: the Edit button waits for it.
  const busy = messages.some((message) => message.status === "streaming");

  /** The text a failed answer answers: the user turn right before it. */
  const textBefore = (index: number): string | null => {
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const candidate = messages[cursor];
      if (candidate.role === "user") return candidate.content;
    }
    return null;
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8" data-testid="chat-thread">
      <MessageWindow items={messages}>
        {(visible, offset) => visible.map((m, visibleIndex) => {
        const index = offset + visibleIndex;
        const retryText = m.status === "error" ? textBefore(index) : null;
        // The agent that shaped the answer: its avatar and name head the answer.
        const agent = m.role === "assistant" && m.agentId ? agents.find((one) => one.id === m.agentId) : undefined;
        if (m.role === "user") {
          return (
            <div key={m.id} className="flex justify-end">
              <div data-role="user" data-status={m.status} className="max-w-[80%] break-words rounded-2xl rounded-br-md bg-[var(--osio-bg-subtle)] px-4 py-2.5 text-sm text-[var(--osio-fg-default)]">
                <UserTurn messageId={m.id} content={m.content} canEdit={!busy} />
              </div>
            </div>
          );
        }
        const streamingNow = m.status === "streaming";
        return (
          <div key={m.id} className="flex gap-3">
            <AgentAvatar agent={agent ?? null} size={28} mood={streamingNow ? "thinking" : "curious"} />
            <div data-role={m.role} data-status={m.status} className="min-w-0 flex-1 break-words text-sm leading-relaxed text-[var(--osio-fg-default)]">
              <div className="mb-1 flex min-w-0 items-baseline gap-2 text-xs">
                <span className="font-medium text-[var(--osio-fg-default)]" data-testid={agent ? "chat-agent-label" : undefined}>{agent?.name ?? "Assistant"}</span>
                {m.model && m.model !== "auto" ? <span className="truncate text-[var(--osio-fg-subtle)]" title={m.model}>{modelLabel(m.model)}</span> : null}
              </div>
              <AssistantAnswer content={m.content} status={m.status} parts={m.parts} conversationId={m.conversationId} messageId={m.id} />
              {streamingNow ? (
                <span className="inline-flex items-center gap-1 text-xs text-[var(--osio-fg-muted)]" data-testid="chat-streaming">
                  <span className="animate-pulse motion-reduce:animate-none">Writing…</span>
                </span>
              ) : null}
              {!streamingNow && m.content ? (
                <AssistantMessageActions
                  messageId={m.id}
                  content={m.content}
                  feedback={m.feedback}
                  route={m.answeredBy && m.routeReason ? { primary: m.model ?? "the chosen model", answeredBy: m.answeredBy, reason: m.routeReason } : undefined}
                />
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
      </MessageWindow>
      <div ref={endRef} />
    </div>
  );
};
