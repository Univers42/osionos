/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ChannelMessagesView.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Channel chat view. History + writes go through the bridge (/api/chat),
 * live cross-user updates arrive over the Rust realtime gateway WS topic
 * `chat:<ws>:<channel>`; without a bridge the legacy BroadcastChannel echo
 * keeps the view alive (model/useChannelHistory decides the mode once).
 */

import React, { useEffect, useRef, useState } from "react";
import { Hash, MessageSquare, Send, Video, Volume2 } from "lucide-react";

import { useUserStore } from "@/features/auth";
import { initRealtimeMessagesBridge } from "@/services/realtime-messages";
import { useChannelActions } from "../model/useChannelActions";
import { useChannelHistory } from "../model/useChannelHistory";
import { useChannelInfo } from "../model/useChannelInfo";
import { useChannelLive } from "../model/useChannelLive";
import { CallPanel } from "./CallPanel";
import { MessageRow } from "./MessageRow";

interface ChannelMessagesViewProps {
  channelId: string;
  workspaceId: string;
  title?: string;
}

function channelIcon(kind?: string) {
  if (kind === "dm") return <MessageSquare size={18} />;
  if (kind === "voice" || kind === "audio") return <Volume2 size={18} />;
  if (kind === "video") return <Video size={18} />;
  return <Hash size={18} />;
}

export const ChannelMessagesView: React.FC<ChannelMessagesViewProps> = ({
  channelId,
  workspaceId,
  title,
}) => {
  const [draft, setDraft] = useState("");
  const [inCall, setInCall] = useState(false);
  const activeUserId = useUserStore((s) => s.activeUserId) || "anonymous";
  const persona = useUserStore((s) => s.activePersona());
  const endRef = useRef<HTMLDivElement>(null);

  const channel = useChannelInfo(channelId);
  const isCallChannel = channel?.kind === "voice" || channel?.kind === "video";
  const history = useChannelHistory(channelId);
  const liveWorkspaceId = history.workspaceId || workspaceId;
  useChannelLive(history.mode === "bridge" ? liveWorkspaceId : "", channelId, history.setMessages);
  const actions = useChannelActions({
    mode: history.mode,
    channelId,
    userId: activeUserId,
    userName: persona?.name ?? activeUserId,
    setMessages: history.setMessages,
  });

  useEffect(() => {
    initRealtimeMessagesBridge();
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [history.messages.length]);

  const submit = () => {
    void actions.send(draft).then((sent) => { if (sent) setDraft(""); }).catch(() => undefined);
  };
  const channelName = title || "messages";

  return (
    <div className="flex h-full flex-col bg-[var(--osio-bg-page)] text-[var(--osio-fg-default)]">
      <header className="flex min-h-14 items-center gap-3 border-b border-[var(--osio-border-default)] px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--osio-bg-subtle)] text-[var(--osio-fg-muted)]">
          {channelIcon(channel?.kind)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{channelName}</h1>
          <p className="truncate text-xs text-[var(--osio-fg-muted)]">
            {history.mode === "bridge" ? "Connected" : "Local"} · {history.messages.length} messages
          </p>
        </div>
        {isCallChannel && !inCall && (
          <button
            type="button"
            onClick={() => setInCall(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--osio-accent)] px-3 py-1.5 text-xs font-medium text-[var(--osio-accent-fg)] hover:opacity-90"
          >
            <Video size={14} /> Join call
          </button>
        )}
      </header>

      {inCall && (
        <CallPanel
          channelId={channelId}
          workspaceId={liveWorkspaceId || channel?.workspaceId}
          onLeave={() => setInCall(false)}
        />
      )}

      <div className="flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto max-w-4xl">
          <div className="mb-6 border-b border-[var(--osio-border-default)] pb-5">
            <h2 className="text-2xl font-bold leading-tight">Welcome to {channelName}</h2>
            <p className="mt-1 text-sm text-[var(--osio-fg-muted)]">This is the start of the channel.</p>
          </div>
          {history.loading && (
            <div className="py-4 text-sm text-[var(--osio-fg-muted)]">Loading messages…</div>
          )}
          {!history.loading && history.messages.length === 0 && (
            <div className="rounded-lg border border-dashed border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-4 py-5 text-sm text-[var(--osio-fg-muted)]">
              No messages yet.
            </div>
          )}
          <div className="space-y-1">
            {history.messages.map((message) => (
              <MessageRow
                key={message.id}
                message={message}
                isAuthor={message.authorId === activeUserId}
                canInteract={history.mode === "bridge"}
                userId={activeUserId}
                onEdit={(id, content) => { void actions.edit(id, content).catch(() => undefined); }}
                onDelete={(id) => { void actions.remove(id).catch(() => undefined); }}
                onReact={(id, emoji, add) => { void actions.react(id, emoji, add).catch(() => undefined); }}
              />
            ))}
          </div>
          <div ref={endRef} />
        </div>
      </div>

      <form
        onSubmit={(event) => { event.preventDefault(); submit(); }}
        className="border-t border-[var(--osio-border-default)] p-4"
      >
        <div className="mx-auto flex max-w-4xl items-end gap-2 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-2 focus-within:border-[var(--osio-accent)]">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={`Message #${channelName}`}
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-[var(--osio-fg-subtle)]"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="mb-0.5 inline-flex h-9 w-9 items-center justify-center rounded-md bg-[var(--osio-accent)] text-[var(--osio-accent-fg)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        </div>
      </form>
    </div>
  );
};
