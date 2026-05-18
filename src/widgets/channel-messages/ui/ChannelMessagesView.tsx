/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ChannelMessagesView.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useState } from "react";
import { GitBranch, Hash, MessageSquare, Send, Video, Volume2 } from "lucide-react";

import { useUserStore } from "@/features/auth";
import {
  initRealtimeMessagesBridge,
  type RealtimeMessage,
  useRealtimeMessagesStore,
} from "@/services/realtime-messages";
import {
  resolveWorkspaceConfig,
  useWorkspaceConfigStore,
  workspaceConfigKey,
} from "@/shared/config/workspaceConfigStore";

interface ChannelMessagesViewProps {
  channelId: string;
  workspaceId: string;
  title?: string;
}

const EMPTY_MESSAGES: RealtimeMessage[] = [];

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function channelIcon(type?: string) {
  if (type === "forum") return <MessageSquare size={18} />;
  if (type === "audio" || type === "stage") return <Volume2 size={18} />;
  if (type === "video") return <Video size={18} />;
  if (type === "thread") return <GitBranch size={18} />;
  return <Hash size={18} />;
}

function channelKindLabel(type?: string) {
  if (type === "forum") return "Forum";
  if (type === "audio") return "Voice";
  if (type === "video") return "Video";
  if (type === "stage") return "Stage";
  if (type === "thread") return "Thread";
  return "Text";
}

export const ChannelMessagesView: React.FC<ChannelMessagesViewProps> = ({
  channelId,
  workspaceId,
  title,
}) => {
  const [draft, setDraft] = useState("");
  const activeUserId = useUserStore((s) => s.activeUserId) || "anonymous";
  const persona = useUserStore((s) => s.activePersona());
  const storedConfig = useWorkspaceConfigStore(
    (s) => s.configs[workspaceConfigKey(activeUserId, workspaceId)],
  );
  const channel = useMemo(() => {
    const config = resolveWorkspaceConfig(storedConfig);
    return config.channels.find((item) => item.id === channelId) ?? null;
  }, [channelId, storedConfig]);
  const threads = useMemo(() => {
    const config = resolveWorkspaceConfig(storedConfig);
    return config.channels.filter((item) => item.parentChannelId === channelId);
  }, [channelId, storedConfig]);
  const messages = useRealtimeMessagesStore(
    (s) => s.messagesByThread[`channel:${channelId}`] ?? EMPTY_MESSAGES,
  );
  const sendMessage = useRealtimeMessagesStore((s) => s.sendMessage);
  const authorName = persona?.name ?? activeUserId;

  useEffect(() => {
    initRealtimeMessagesBridge();
  }, []);

  const handleSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    const sent = sendMessage(`channel:${channelId}`, activeUserId, authorName, draft);
    if (sent) setDraft("");
  };

  const channelName = channel?.name ?? title ?? "messages";

  return (
    <div className="flex h-full bg-[var(--osio-bg-page)] text-[var(--osio-fg-default)]">
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--osio-border-default)] px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--osio-bg-subtle)] text-[var(--osio-fg-muted)]">
              {channelIcon(channel?.type)}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">{channelName}</h1>
              <p className="truncate text-xs text-[var(--osio-fg-muted)]">
                {channelKindLabel(channel?.type)} channel · {messages.length} messages
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-1 sm:flex">
            <button type="button" className="rounded-md px-2 py-1 text-xs font-medium text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]">Pins</button>
            <button type="button" className="rounded-md px-2 py-1 text-xs font-medium text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]">Members</button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          <div className="mx-auto max-w-4xl">
            <div className="mb-6 border-b border-[var(--osio-border-default)] pb-5">
              <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--osio-bg-muted)] text-[var(--osio-fg-muted)]">
                {channelIcon(channel?.type)}
              </span>
              <h2 className="text-2xl font-bold leading-tight">Welcome to {channelName}</h2>
              <p className="mt-1 text-sm text-[var(--osio-fg-muted)]">
                This is the start of the channel.
              </p>
            </div>

            {messages.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-4 py-5 text-sm text-[var(--osio-fg-muted)]">
                No messages yet.
              </div>
            ) : (
              <div className="space-y-1">
                {messages.map((message) => (
                  <article key={message.id} className="group flex gap-3 rounded-md px-2 py-1.5 hover:bg-[var(--osio-bg-hover)]">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--osio-accent)] text-xs font-semibold text-[var(--osio-accent-fg)]">
                      {message.authorName.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-sm font-semibold">{message.authorName}</span>
                        <time className="text-xs text-[var(--osio-fg-subtle)]">
                          {formatMessageTime(message.createdAt)}
                        </time>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm leading-6">
                        {message.body}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="border-t border-[var(--osio-border-default)] p-4">
          <div className="mx-auto flex max-w-4xl items-end gap-2 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-2 focus-within:border-[var(--osio-accent)]">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  const sent = sendMessage(`channel:${channelId}`, activeUserId, authorName, draft);
                  if (sent) setDraft("");
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
      </main>

      <aside className="hidden w-64 shrink-0 border-l border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-4 lg:block">
        <h2 className="mb-3 text-xs font-semibold uppercase text-[var(--osio-fg-subtle)]">Threads</h2>
        {threads.length > 0 ? (
          <div className="space-y-1">
            {threads.map((thread) => (
              <div key={thread.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]">
                <GitBranch size={14} />
                <span className="truncate">{thread.name}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--osio-fg-muted)]">No threads yet.</p>
        )}
      </aside>
    </div>
  );
};
