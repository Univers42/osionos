/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ThreadPanel.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Right-side thread view: the root + its replies, reusing MessageRow and the
 * MessageComposer in thread mode (every reply carries replyTo=rootId, so the
 * bridge derives thread_root_id). Falls back to the passed root while loading.
 */

import React from 'react';
import { X } from 'lucide-react';

import type { Attachment, ChatMessage } from '@/shared/chat/messageApi';
import { MessageRow } from './MessageRow';
import { MessageComposer } from './composer/MessageComposer';
import { useThread } from '../model/useThread';

interface ThreadPanelProps {
  root: ChatMessage;
  channelId: string;
  workspaceId: string;
  userId: string;
  canInteract: boolean;
  onReply: (message: ChatMessage) => void;
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onReact: (id: string, emoji: string, add: boolean) => void;
  onSend: (text: string, attachments?: Attachment[]) => Promise<unknown> | unknown;
  onClose: () => void;
}

export const ThreadPanel: React.FC<ThreadPanelProps> = ({
  root, channelId, workspaceId, userId, canInteract, onReply, onEdit, onDelete, onReact, onSend, onClose,
}) => {
  const { messages, loading } = useThread(root.id, channelId, workspaceId);
  const list = messages.length ? messages : [root];

  return (
    <aside className="flex h-full w-96 shrink-0 flex-col border-l border-[var(--osio-border-default)] bg-[var(--osio-bg-page)]">
      <header className="flex min-h-14 items-center justify-between border-b border-[var(--osio-border-default)] px-4">
        <h2 className="text-sm font-semibold">Thread · {list.length - 1} {list.length - 1 === 1 ? 'reply' : 'replies'}</h2>
        <button type="button" aria-label="Close thread" onClick={onClose} className="rounded p-1 text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"><X size={16} /></button>
      </header>
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {loading && <div className="py-4 text-sm text-[var(--osio-fg-muted)]">Loading thread…</div>}
        <div className="space-y-1">
          {list.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              isAuthor={message.authorId === userId}
              canInteract={canInteract}
              userId={userId}
              onEdit={onEdit}
              onDelete={onDelete}
              onReact={onReact}
              onReply={onReply}
            />
          ))}
        </div>
      </div>
      <MessageComposer key={`thread-${root.id}`} channelId={channelId} workspaceId={workspaceId} channelName="thread" compact onSend={onSend} />
    </aside>
  );
};
