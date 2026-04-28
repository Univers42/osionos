import React, { useEffect, useMemo, useState } from "react";
import { Hash, MessageSquare, Send } from "lucide-react";

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
    <div className="flex h-full flex-col bg-[var(--color-surface-primary)] text-[var(--color-ink)]">
      <header className="flex items-center gap-3 border-b border-[var(--color-line)] px-6 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-surface-secondary)] text-[var(--color-ink-muted)]">
          {channel?.type === "forum" ? <MessageSquare size={18} /> : <Hash size={18} />}
        </span>
        <div>
          <h1 className="text-lg font-semibold">{channelName}</h1>
          <p className="text-xs text-[var(--color-ink-muted)]">
            Real-time workspace messages are persisted locally and synced across open tabs.
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center">
            <div className="max-w-sm rounded-2xl border border-dashed border-[var(--color-line)] bg-[var(--color-surface-secondary)] px-6 py-8">
              <MessageSquare className="mx-auto mb-3 text-[var(--color-ink-muted)]" size={28} />
              <p className="text-sm font-medium">No messages yet</p>
              <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                Write below to start the channel conversation.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <article key={message.id} className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-xs font-semibold text-white">
                  {message.authorName.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold">{message.authorName}</span>
                    <time className="text-[11px] text-[var(--color-ink-faint)]">
                      {formatMessageTime(message.createdAt)}
                    </time>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
                    {message.body}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-[var(--color-line)] p-4">
        <div className="flex items-end gap-2 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-secondary)] p-2 focus-within:border-[var(--color-accent)]">
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
            rows={2}
            placeholder={`Message #${channelName}`}
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-[var(--color-ink-faint)]"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="mb-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-accent)] text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="mt-2 text-[11px] text-[var(--color-ink-faint)]">
          Press Ctrl/Cmd + Enter to send. Enter adds a new line.
        </p>
      </form>
    </div>
  );
};
