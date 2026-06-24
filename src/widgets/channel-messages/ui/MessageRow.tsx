/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MessageRow.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from 'react';
import { Pencil, SmilePlus, Trash2 } from 'lucide-react';

import type { ChatMessage } from '@/shared/chat/messageApi';

const QUICK_EMOJI = ['👍', '❤️', '🔥', '🎉'];

interface MessageRowProps {
  message: ChatMessage;
  isAuthor: boolean;
  canInteract: boolean;
  userId: string;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
  onReact: (messageId: string, emoji: string, add: boolean) => void;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function groupReactions(message: ChatMessage) {
  const byEmoji = new Map<string, string[]>();
  for (const reaction of message.reactions) {
    byEmoji.set(reaction.emoji, [...(byEmoji.get(reaction.emoji) ?? []), reaction.userId]);
  }
  return [...byEmoji.entries()];
}

export const MessageRow: React.FC<MessageRowProps> = ({ message, isAuthor, canInteract, userId, onEdit, onDelete, onReact }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <article className="group relative flex gap-3 rounded-md px-2 py-1.5 hover:bg-[var(--osio-bg-hover)]">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--osio-accent)] text-xs font-semibold text-[var(--osio-accent-fg)]">
        {message.authorAvatar
          ? <img src={message.authorAvatar} alt="" className="h-full w-full object-cover" />
          : message.authorName.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-semibold">{message.authorName}</span>
          <time className="text-xs text-[var(--osio-fg-subtle)]">{formatTime(message.createdAt)}</time>
          {message.editedAt && <span className="text-xs italic text-[var(--osio-fg-subtle)]">(edited)</span>}
        </div>
        {editing ? (
          <form
            onSubmit={(event) => { event.preventDefault(); onEdit(message.id, draft); setEditing(false); }}
            className="mt-1 flex items-center gap-2"
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={(event) => { if (event.key === 'Escape') setEditing(false); }}
              className="flex-1 rounded border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 py-1 text-sm outline-none focus:border-[var(--osio-accent)]"
            />
            <button type="submit" className="rounded bg-[var(--osio-accent)] px-2 py-1 text-xs text-[var(--osio-accent-fg)]">Save</button>
          </form>
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>
        )}
        {message.reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {groupReactions(message).map(([emoji, users]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => canInteract && onReact(message.id, emoji, !users.includes(userId))}
                className={`rounded-full border px-1.5 py-0.5 text-xs ${users.includes(userId) ? 'border-[var(--osio-accent)] bg-[var(--osio-bg-muted)]' : 'border-[var(--osio-border-default)]'}`}
              >
                {emoji} {users.length}
              </button>
            ))}
          </div>
        )}
      </div>
      {canInteract && (
        <div className="absolute -top-2 right-2 hidden items-center gap-0.5 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-0.5 shadow-osio-menu group-hover:flex">
          <button type="button" aria-label="Add reaction" onClick={() => setPickerOpen((open) => !open)} className="rounded p-1 text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"><SmilePlus size={14} /></button>
          {isAuthor && (
            <>
              <button type="button" aria-label="Edit message" onClick={() => { setDraft(message.content); setEditing(true); }} className="rounded p-1 text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"><Pencil size={14} /></button>
              <button type="button" aria-label="Delete message" onClick={() => onDelete(message.id)} className="rounded p-1 text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"><Trash2 size={14} /></button>
            </>
          )}
          {pickerOpen && (
            <div className="absolute right-0 top-7 z-10 flex gap-1 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-1 shadow-[var(--osio-shadow-menu)]">
              {QUICK_EMOJI.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onReact(message.id, emoji, !message.reactions.some((r) => r.userId === userId && r.emoji === emoji));
                    setPickerOpen(false);
                  }}
                  className="rounded p-1 text-sm hover:bg-[var(--osio-bg-hover)]"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
};
