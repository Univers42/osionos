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
import { Pencil, Reply, SmilePlus, Trash2 } from 'lucide-react';

import { renderInlineToReact } from '@/shared/lib/markengine';
import type { ChatMessage } from '@/shared/chat/messageApi';

import { MessageAttachments } from './attachments/MessageAttachments';
import { LinkPreviewCard } from './attachments/LinkPreviewCard';
import { MessageTicks } from './MessageTicks';

const QUICK_EMOJI = ['👍', '❤️', '🔥', '🎉'];

interface MessageRowProps {
  message: ChatMessage;
  isAuthor: boolean;
  canInteract: boolean;
  userId: string;
  /** Consecutive message from the same author — hide the avatar + name header. */
  grouped?: boolean;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
  onReact: (messageId: string, emoji: string, add: boolean) => void;
  onReply: (message: ChatMessage) => void;
  onOpenThread?: (message: ChatMessage) => void;
}

// Hoisted: constructing an Intl.DateTimeFormat is one of the pricier JS built-ins;
// one shared instance serves every row instead of a fresh one per row per render.
const TIME_FORMAT = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
function formatTime(value: string) {
  return TIME_FORMAT.format(new Date(value));
}

function groupReactions(message: ChatMessage) {
  const byEmoji = new Map<string, string[]>();
  for (const reaction of message.reactions) {
    byEmoji.set(reaction.emoji, [...(byEmoji.get(reaction.emoji) ?? []), reaction.userId]);
  }
  return [...byEmoji.entries()];
}

// Bare http(s) links pasted into the text get an auto link card (favicon +
// platform, or an inline player for YouTube/Vimeo) — like Slack/WhatsApp. Skip
// links already sent as a /url attachment so a card is never double-rendered.
const URL_RE = /\bhttps?:\/\/[^\s<>()]+[^\s<>().,!?:;'"]/gi;

function contentLinks(message: ChatMessage): string[] {
  const already = new Set(
    (message.attachments ?? []).filter((a) => a.type === 'url' && a.url).map((a) => a.url as string),
  );
  const seen = new Set<string>();
  const links: string[] = [];
  for (const match of message.content.matchAll(URL_RE)) {
    const url = match[0];
    if (already.has(url) || seen.has(url)) continue;
    seen.add(url);
    links.push(url);
  }
  return links.slice(0, 3);
}

const MENTION_TOKEN = /(?<![\w@])(@[a-z0-9_]+(?:\.[a-z0-9_]+)*)/gi;

/** Render message text, chipping @handles; the rest goes through markengine. */
function renderContent(content: string): React.ReactNode {
  const parts = content.split(MENTION_TOKEN);
  if (parts.length === 1) return renderInlineToReact(content);
  return parts.map((part, index) =>
    /^@[a-z0-9_.]+$/i.test(part)
      ? <span key={index} className="rounded bg-[var(--osio-accent)]/15 px-0.5 font-medium text-[var(--osio-accent)]">{part}</span>
      : <React.Fragment key={index}>{renderInlineToReact(part)}</React.Fragment>,
  );
}

const MessageRowImpl: React.FC<MessageRowProps> = ({ message, isAuthor, canInteract, userId, grouped, onEdit, onDelete, onReact, onReply, onOpenThread }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [pickerOpen, setPickerOpen] = useState(false);
  const isMentioned = Boolean(message.mentions?.includes(userId));

  return (
    <article className={`group relative flex gap-3 rounded-md px-2 py-1.5 hover:bg-[var(--osio-bg-hover)] ${isMentioned ? 'border-l-2 border-[var(--osio-accent)] bg-[var(--osio-accent)]/5' : ''}`}>
      {grouped ? (
        <div className="h-9 w-9 shrink-0" aria-hidden />
      ) : (
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--osio-accent)] text-xs font-semibold text-[var(--osio-accent-fg)]">
          {message.authorAvatar
            ? <img src={message.authorAvatar} alt="" className="h-full w-full object-cover" />
            : message.authorName.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        {!grouped && (
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-semibold">{message.authorName}</span>
          <time className="text-xs text-[var(--osio-fg-subtle)]">{formatTime(message.createdAt)}</time>
          {message.editedAt && <span className="text-xs italic text-[var(--osio-fg-subtle)]">(edited)</span>}
          {isAuthor && <MessageTicks messageId={message.id} />}
        </div>
        )}
        {message.replyTo && (
          <div className="mb-1 max-w-md rounded border-l-2 border-[var(--osio-accent)] bg-[var(--osio-bg-subtle)] px-2 py-1">
            <span className="block text-xs font-medium text-[var(--osio-accent)]">{message.replyTo.authorName}</span>
            <span className="block truncate text-xs text-[var(--osio-fg-muted)]">{message.replyTo.content || 'Attachment'}</span>
          </div>
        )}
        {editing ? (
          <form
            onSubmit={(event) => { event.preventDefault(); onEdit(message.id, draft); setEditing(false); }}
            className="mt-1 flex items-center gap-2"
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Escape') setEditing(false); }}
              className="flex-1 rounded border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 py-1 text-sm outline-none focus:border-[var(--osio-accent)]"
            />
            <button type="submit" className="rounded bg-[var(--osio-accent)] px-2 py-1 text-xs text-[var(--osio-accent-fg)]">Save</button>
            <button type="button" onClick={() => setEditing(false)} className="rounded px-2 py-1 text-xs text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]">Cancel</button>
          </form>
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm leading-6">{renderContent(message.content)}</p>
        )}
        <MessageAttachments attachments={message.attachments} />
        {!editing && contentLinks(message).map((url) => (
          <LinkPreviewCard key={url} attachment={{ type: 'url', url }} />
        ))}
        {(message.replyCount ?? 0) > 0 && onOpenThread && (
          <button
            type="button"
            onClick={() => onOpenThread(message)}
            className="mt-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-[var(--osio-accent)] hover:bg-[var(--osio-bg-hover)]"
          >
            💬 {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
          </button>
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
          <button type="button" aria-label="Reply" onClick={() => onReply(message)} className="rounded p-1 text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"><Reply size={14} /></button>
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

// Memoized: a realtime frame re-renders the list container; without memo every
// row re-ran markdown + link scanning. With stable callbacks from the view,
// only the row whose message changed re-renders.
export const MessageRow = React.memo(MessageRowImpl);
