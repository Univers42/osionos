/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ChannelMessagesView.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 15:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Channel chat view. History + writes go through the bridge (/api/chat),
 * live cross-user updates arrive over the Rust realtime gateway WS topic
 * `chat:<ws>:<channel>`; without a bridge the legacy BroadcastChannel echo
 * keeps the view alive (model/useChannelHistory decides the mode once).
 *
 * Scroll discipline: stick to the bottom only when the reader is already there;
 * a new message while scrolled up surfaces a "N new" jump pill instead of
 * yanking the viewport. Rows are grouped by author + date (model/messageGrouping).
 *
 * Writes answer a TYPED outcome: a moderation warning from L0 is the author's
 * question (the composer answers it), not a connection error — so only a plain
 * failure is toasted.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";

import { useUserStore } from "@/features/auth";
import type { ChatMessage } from "@/shared/chat/messageApi";
import { initRealtimeMessagesBridge } from "@/services/realtime-messages";
import { useUnreadStore } from "@/store/chat/useUnreadStore";
import { useToastStore } from "@osionos/ui/primitives/useToastStore";
import { useChannelActions, type SendOutcome } from "../model/useChannelActions";
import { useChannelHistory } from "../model/useChannelHistory";
import { useChannelInfo } from "../model/useChannelInfo";
import { useChannelLive } from "../model/useChannelLive";
import { useChannelReceipts } from "../model/useChannelReceipts";
import { buildMessageRows, firstUnreadId } from "../model/messageGrouping";
import { useMessageWindow } from "../model/useMessageWindow";
import { useStickyScroll } from "../model/useStickyScroll";
import { mentionsAi } from "../model/aiAnswerDraft";
import { canDeleteMessage, reportAiAnswer } from "../model/aiAnswerRow";
import { aiDraftStore, useAiDraft } from "../model/useAiAnswerDraft";
import { isChannelAiAnswersEnabled } from "@/shared/config/featureFlags";
import { isAiConfigured } from "@/features/ai/api/aiClient";
import { AiAutopostMarker } from "./AiAutopostMarker";
import { AiDraftCard } from "./AiDraftCard";
import { CallPanel } from "./CallPanel";
import { ChannelHeader } from "./ChannelHeader";
import { DateDivider, UnreadDivider } from "./MessageDividers";
import { MessageRow } from "./MessageRow";
import { TypingIndicator } from "./TypingIndicator";
import { MessageComposer } from "./composer/MessageComposer";
import { ThreadPanel } from "./ThreadPanel";

interface ChannelMessagesViewProps {
  channelId: string;
  workspaceId: string;
  title?: string;
  /** 'compact' drops the hero header for the floating dock chat tab. */
  variant?: 'full' | 'compact';
}

export const ChannelMessagesView: React.FC<ChannelMessagesViewProps> = ({
  channelId,
  workspaceId,
  title,
  variant = 'full',
}) => {
  const compact = variant === 'compact';
  const [inCall, setInCall] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [threadRoot, setThreadRoot] = useState<ChatMessage | null>(null);
  const activeUserId = useUserStore((s) => s.activeUserId) || "anonymous";
  const persona = useUserStore((s) => s.activePersona());
  const channel = useChannelInfo(channelId);
  const isCallChannel = channel?.kind === "voice" || channel?.kind === "video";
  const history = useChannelHistory(channelId);
  const liveWorkspaceId = history.workspaceId || workspaceId;
  const receiptsWorkspaceId = history.mode === "bridge" ? liveWorkspaceId : "";
  useChannelLive(receiptsWorkspaceId, channelId, history.setMessages);
  const messages = history.messages;
  const latestMessageId = messages.length ? messages[messages.length - 1].id : undefined;
  useChannelReceipts(receiptsWorkspaceId, channelId, activeUserId, latestMessageId);
  const rows = useMemo(() => buildMessageRows(messages), [messages]);
  const readSnapshot = useMemo(() => useUnreadStore.getState().lastSeen[channelId] ?? null, [channelId]);
  const firstUnread = useMemo(() => firstUnreadId(messages, readSnapshot, activeUserId), [messages, readSnapshot, activeUserId]);
  const { windowStart, visibleRows, showEarlier } = useMessageWindow(rows, channelId, firstUnread);
  const { scrollRef, endRef, atBottom, newCount, jumpToBottom } = useStickyScroll(channelId, messages);
  const authorNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of messages) map[m.authorId] = m.authorName;
    return map;
  }, [messages]);
  const actions = useChannelActions({
    mode: history.mode,
    channelId,
    userId: activeUserId,
    userName: persona?.name ?? activeUserId,
    setMessages: history.setMessages,
  });
  const { edit: editMessage, remove: removeMessage, react: reactMessage } = actions;
  const handleEdit = useCallback(
    (id: string, content: string, options?: { acknowledgeWarning?: boolean }) => editMessage(id, content, options),
    [editMessage],
  );
  const handleDelete = useCallback(
    (id: string) => { void removeMessage(id).catch(() => undefined); },
    [removeMessage],
  );
  const handleReact = useCallback(
    (id: string, emoji: string, add: boolean) => { void reactMessage(id, emoji, add).catch(() => undefined); },
    [reactMessage],
  );
  const aiDraft = useAiDraft(channelId);
  const canAskAi = channel?.kind === "text" && isChannelAiAnswersEnabled() && isAiConfigured();
  const autopost = canAskAi && channel?.aiAutopost === true;
  const draftWorkspaceId = liveWorkspaceId || channel?.workspaceId || workspaceId;
  const { setMessages } = history;
  const addPosted = useCallback((message: ChatMessage) => {
    setMessages((current) => (current.some((m) => m.id === message.id) ? current : [...current, message]));
  }, [setMessages]);
  const handleSendOutcome = useCallback((outcome: SendOutcome): SendOutcome => {
    if (outcome.ok) {
      setReplyTarget(null);
      if (canAskAi && outcome.message && mentionsAi(outcome.message.content)) {
        aiDraftStore.getState().ask({
          channelId,
          workspaceId: draftWorkspaceId,
          channelName: title || "messages",
          triggerId: outcome.message.id,
          userId: activeUserId,
          autopost,
          onPosted: addPosted,
        });
      }
      return outcome;
    }
    if (!("warning" in outcome)) {
      useToastStore.getState().push({ kind: "error", title: "Couldn't send message", description: "Check your connection and try again." });
    }
    return outcome;
  }, [canAskAi, autopost, addPosted, channelId, draftWorkspaceId, title, activeUserId]);
  const canModerate = channel?.memberRole === "owner" || channel?.memberRole === "admin";

  useEffect(() => {
    initRealtimeMessagesBridge();
  }, []);

  const channelName = title || "messages";

  return (
    <div className="flex h-full bg-[var(--osio-bg-page)] text-[var(--osio-fg-default)]">
      <div className="flex h-full min-w-0 flex-1 flex-col">
      {!compact && (
        <ChannelHeader
          channelId={channelId}
          name={channelName}
          kind={channel?.kind}
          connected={history.mode === "bridge"}
          messageCount={messages.length}
          showJoinCall={isCallChannel && !inCall}
          onJoinCall={() => setInCall(true)}
        />
      )}

      {inCall && (
        <CallPanel
          channelId={channelId}
          workspaceId={liveWorkspaceId || channel?.workspaceId}
          onLeave={() => setInCall(false)}
        />
      )}

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} className={compact ? "flex-1 overflow-y-auto px-3 py-3" : "flex-1 overflow-y-auto px-4 py-5"}>
          <div className={compact ? "" : "mx-auto max-w-4xl"}>
            {!compact && (
            <div className="mb-6 border-b border-[var(--osio-border-default)] pb-5">
              <h2 className="text-2xl font-bold leading-tight">Welcome to {channelName}</h2>
              <p className="mt-1 text-sm text-[var(--osio-fg-muted)]">This is the start of the channel.</p>
            </div>
            )}
            {history.loading && (
              <div className="py-4 text-sm text-[var(--osio-fg-muted)]">Loading messages…</div>
            )}
            {!history.loading && messages.length === 0 && (
              <div className="rounded-lg border border-dashed border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-4 py-5 text-sm text-[var(--osio-fg-muted)]">
                No messages yet — say hello to start the conversation.
              </div>
            )}
            {windowStart > 0 && (
              <button
                type="button"
                onClick={showEarlier}
                className="mb-2 w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-1.5 text-xs text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-muted)] hover:text-[var(--osio-fg-default)]"
              >
                Show earlier messages ({windowStart})
              </button>
            )}
            <div className="space-y-1">
              {visibleRows.map(({ message, grouped, divider }, index) => (
                <React.Fragment key={message.id}>
                  {divider && <DateDivider label={divider} />}
                  {message.id === firstUnread && <UnreadDivider />}
                  <MessageRow
                    message={message}
                    grouped={index === 0 && windowStart > 0 ? false : grouped}
                    isAuthor={canDeleteMessage(message, activeUserId, canModerate)}
                    canInteract={history.mode === "bridge"}
                    userId={activeUserId}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onReact={handleReact}
                    onReply={setReplyTarget}
                    onOpenThread={compact ? undefined : setThreadRoot}
                    askerName={message.aiRequestedBy ? authorNames[message.aiRequestedBy] : undefined}
                    onReport={reportAiAnswer}
                  />
                </React.Fragment>
              ))}
            </div>
            <div ref={endRef} />
          </div>
        </div>
        {!atBottom && newCount > 0 && (
          <button
            type="button"
            onClick={jumpToBottom}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-3 py-1 text-xs font-medium text-[var(--osio-fg-default)] shadow-[var(--osio-shadow-menu)] transition-colors hover:bg-[var(--osio-bg-hover)]"
          >
            ↓ {newCount} new {newCount === 1 ? "message" : "messages"}
          </button>
        )}
      </div>

      <div className={compact ? "px-2" : "mx-auto w-full max-w-4xl px-4"}>
        <TypingIndicator channelId={channelId} names={authorNames} />
      </div>

      <div className={compact ? "px-2" : "mx-auto w-full max-w-4xl px-4"}>
        <AiAutopostMarker autopost={autopost} />
        {aiDraft && (
          <AiDraftCard
            draft={aiDraft}
            onAccept={() => aiDraftStore.getState().accept(channelId)}
            onPost={() => { void aiDraftStore.getState().post(channelId); }}
            onRetry={() => aiDraftStore.getState().retry(channelId)}
            onDiscard={() => aiDraftStore.getState().discard(channelId)}
          />
        )}
      </div>
      <MessageComposer
        key={channelId}
        channelId={channelId}
        workspaceId={liveWorkspaceId || channel?.workspaceId || workspaceId}
        channelName={channelName}
        compact={compact}
        replyTo={replyTarget ? { authorName: replyTarget.authorName, content: replyTarget.content } : null}
        onClearReply={() => setReplyTarget(null)}
        onSend={(text, attachments, options) =>
          actions.send(text, attachments, replyTarget?.id, options).then(handleSendOutcome)
        }
      />
      </div>
      {threadRoot && !compact && (
        <ThreadPanel
          root={threadRoot}
          channelId={channelId}
          workspaceId={liveWorkspaceId || channel?.workspaceId || workspaceId}
          userId={activeUserId}
          canInteract={history.mode === "bridge"}
          canModerate={canModerate}
          authorNames={authorNames}
          onReply={setReplyTarget}
          onEdit={(id, content, options) => actions.edit(id, content, options)}
          onDelete={(id) => { void actions.remove(id).catch(() => undefined); }}
          onReact={(id, emoji, add) => { void actions.react(id, emoji, add).catch(() => undefined); }}
          onSend={(text, attachments, options) => actions.send(text, attachments, threadRoot.id, options)}
          onClose={() => setThreadRoot(null)}
          onReport={reportAiAnswer}
        />
      )}
    </div>
  );
};
