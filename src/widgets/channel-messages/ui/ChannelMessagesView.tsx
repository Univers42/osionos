/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ChannelMessagesView.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
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
 */

import React, { useEffect, useMemo, useRef, useState } from "react";

import { useUserStore } from "@/features/auth";
import type { ChatMessage } from "@/shared/chat/messageApi";
import { initRealtimeMessagesBridge } from "@/services/realtime-messages";
import { useUnreadStore } from "@/store/chat/useUnreadStore";
import { useToastStore } from "@/shared/ui/primitives/useToastStore";
import { postChannelRead } from "@/shared/chat/unreadApi";
import { useChannelActions } from "../model/useChannelActions";
import { useChannelHistory } from "../model/useChannelHistory";
import { useChannelInfo } from "../model/useChannelInfo";
import { useChannelLive } from "../model/useChannelLive";
import { useChannelReceipts } from "../model/useChannelReceipts";
import { buildMessageRows, firstUnreadId } from "../model/messageGrouping";
import { CallPanel } from "./CallPanel";
import { ChannelHeader } from "./ChannelHeader";
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

const DateDivider: React.FC<{ label: string }> = ({ label }) => (
  <div className="my-3 flex items-center gap-3" role="separator" aria-label={label}>
    <span className="h-px flex-1 bg-[var(--osio-border-default)]" />
    <span className="rounded-full bg-[var(--osio-bg-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--osio-fg-muted)]">{label}</span>
    <span className="h-px flex-1 bg-[var(--osio-border-default)]" />
  </div>
);

const UnreadDivider: React.FC = () => (
  <div className="my-2 flex items-center gap-3" role="separator" aria-label="New messages">
    <span className="h-px flex-1 bg-[var(--osio-accent)]" />
    <span className="rounded-full bg-[var(--osio-accent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--osio-accent-fg)]">New</span>
    <span className="h-px flex-1 bg-[var(--osio-accent)]" />
  </div>
);

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
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const prevLenRef = useRef(0);
  const [atBottom, setAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);

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
  // Snapshot the last-seen mark ONCE per channel (before markSeen overwrites it)
  // so the "New" divider stays anchored to where the reader left off.
  const readSnapshot = useMemo(() => useUnreadStore.getState().lastSeen[channelId] ?? null, [channelId]);
  const firstUnread = useMemo(() => firstUnreadId(messages, readSnapshot, activeUserId), [messages, readSnapshot, activeUserId]);
  const authorNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of messages) map[m.authorId] = m.authorName;
    return map;
  }, [messages]);
  const markSeen = useUnreadStore((s) => s.markSeen);
  const actions = useChannelActions({
    mode: history.mode,
    channelId,
    userId: activeUserId,
    userName: persona?.name ?? activeUserId,
    setMessages: history.setMessages,
  });

  const jumpToBottom = () => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    atBottomRef.current = true;
    setAtBottom(true);
    setNewCount(0);
  };

  useEffect(() => {
    initRealtimeMessagesBridge();
  }, []);

  // Track whether the reader is parked at the bottom (≈last 120px).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const onScroll = () => {
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      atBottomRef.current = near;
      setAtBottom(near);
      if (near) setNewCount(0);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Channel switch: reset to bottom and clear the unread pill.
  useEffect(() => {
    atBottomRef.current = true;
    setAtBottom(true);
    setNewCount(0);
    prevLenRef.current = 0;
    markSeen(channelId);
    void postChannelRead(channelId).catch(() => undefined);
  }, [channelId, markSeen]);

  // New messages: stick to the bottom only if already there, else count them.
  useEffect(() => {
    const delta = messages.length - prevLenRef.current;
    prevLenRef.current = messages.length;
    if (atBottomRef.current) {
      endRef.current?.scrollIntoView({ block: "end" });
      if (delta > 0) {
        markSeen(channelId);
        void postChannelRead(channelId, messages[messages.length - 1]?.id).catch(() => undefined);
      }
      setNewCount(0);
    } else if (delta > 0) {
      setNewCount((n) => n + delta);
    }
  }, [messages, channelId, markSeen]);

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
            <div className="space-y-1">
              {rows.map(({ message, grouped, divider }) => (
                <React.Fragment key={message.id}>
                  {divider && <DateDivider label={divider} />}
                  {message.id === firstUnread && <UnreadDivider />}
                  <MessageRow
                    message={message}
                    grouped={grouped}
                    isAuthor={message.authorId === activeUserId}
                    canInteract={history.mode === "bridge"}
                    userId={activeUserId}
                    onEdit={(id, content) => { void actions.edit(id, content).catch(() => undefined); }}
                    onDelete={(id) => { void actions.remove(id).catch(() => undefined); }}
                    onReact={(id, emoji, add) => { void actions.react(id, emoji, add).catch(() => undefined); }}
                    onReply={setReplyTarget}
                    onOpenThread={compact ? undefined : setThreadRoot}
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

      <MessageComposer
        key={channelId}
        channelId={channelId}
        workspaceId={liveWorkspaceId || channel?.workspaceId || workspaceId}
        channelName={channelName}
        compact={compact}
        replyTo={replyTarget ? { authorName: replyTarget.authorName, content: replyTarget.content } : null}
        onClearReply={() => setReplyTarget(null)}
        onSend={(text, attachments) =>
          Promise.resolve(actions.send(text, attachments, replyTarget?.id)).then((ok) => {
            if (ok) setReplyTarget(null);
            else useToastStore.getState().push({ kind: "error", title: "Couldn't send message", description: "Check your connection and try again." });
            return ok;
          }).catch(() => {
            useToastStore.getState().push({ kind: "error", title: "Couldn't send message", description: "Check your connection and try again." });
            return false;
          })
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
          onReply={setReplyTarget}
          onEdit={(id, content) => { void actions.edit(id, content).catch(() => undefined); }}
          onDelete={(id) => { void actions.remove(id).catch(() => undefined); }}
          onReact={(id, emoji, add) => { void actions.react(id, emoji, add).catch(() => undefined); }}
          onSend={(text, attachments) => actions.send(text, attachments, threadRoot.id)}
          onClose={() => setThreadRoot(null)}
        />
      )}
    </div>
  );
};
