/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MessageRow.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 15:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from 'react';

import { renderInlineToReact } from '@osionos/markdown-engine/react';
import type { ChatMessage } from '@/shared/chat/messageApi';
import { Button } from '@/shared/ui';
import { AssistantAvatar } from '@/shared/ui/mascot/AssistantAvatar';

import type { SendOutcome } from '../model/channelWrites';
import { MessageAttachments } from './attachments/MessageAttachments';
import { LinkPreviewCard } from './attachments/LinkPreviewCard';
import { MessageEditForm } from './MessageEditForm';
import { MessageTicks } from './MessageTicks';
import { MessageToolbar } from './MessageToolbar';

interface MessageRowProps {
  message: ChatMessage;
  isAuthor: boolean;
  canInteract: boolean;
  userId: string;
  /** Consecutive message from the same author — hide the avatar + name header. */
  grouped?: boolean;
  /** Saves an edit. The answer is typed: a warning is not a failure. */
  onEdit: (
    messageId: string,
    content: string,
    options?: { acknowledgeWarning?: boolean },
  ) => Promise<SendOutcome> | SendOutcome;
  onDelete: (messageId: string) => void;
  onReact: (messageId: string, emoji: string, add: boolean) => void;
  onReply: (message: ChatMessage) => void;
  onOpenThread?: (message: ChatMessage) => void;
  /** The asker's display name, on an AI answer someone else asked for. */
  askerName?: string;
  /** Reports an AI answer (OB6); a person's row is reported from their profile. */
  onReport?: (message: ChatMessage) => void;
}

// Hoisted: constructing an Intl.DateTimeFormat is one of the pricier JS built-ins;
// one shared instance serves every row instead of a fresh one per row per render.
const TIME_FORMAT = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
/** Short 24h time for the 36px avatar gutter of a grouped row. */
const GUTTER_TIME_FORMAT = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
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
  // OB4: an AI answer gets no card. A card fetches a favicon or a player for
  // every reader, and an answer can be steered into naming any URL.
  if (message.isAi) return [];
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

const AI_BODY = 'whitespace-pre-wrap break-words rounded-xl bg-[color-mix(in_srgb,var(--osio-accent)_6%,transparent)] px-3 py-2 text-sm leading-6';
const HUMAN_BODY = 'whitespace-pre-wrap break-words text-sm leading-6';
const ROW_PLAIN = 'hover:bg-[var(--osio-bg-hover)]';
const ROW_MENTIONED = 'bg-[color-mix(in_srgb,var(--osio-accent)_8%,transparent)] shadow-[inset_2px_0_0_var(--osio-accent)] border-l-2 border-transparent pl-1.5 forced-colors:border-[CanvasText]';

const MENTION_TOKEN = /(?<![\w@])(@[a-z0-9_]+(?:\.[a-z0-9_]+)*)/gi;

/** Render message text, chipping @handles; the rest goes through markengine. */
function renderContent(content: string): React.ReactNode {
  const parts = content.split(MENTION_TOKEN);
  if (parts.length === 1) return renderInlineToReact(content);
  return parts.map((part, index) =>
    /^@[a-z0-9_.]+$/i.test(part)
      ? <span key={index} className="rounded-xs bg-[var(--osio-accent)]/15 px-0.5 font-medium text-[var(--osio-accent-text)]">{part}</span>
      : <React.Fragment key={index}>{renderInlineToReact(part)}</React.Fragment>,
  );
}

function askedBy(message: ChatMessage, userId: string, askerName?: string): string {
  if (message.aiRequestedBy === userId) return 'AI answer, asked by you';
  return `AI answer, asked by ${askerName || 'a member'}`;
}

const MessageRowImpl: React.FC<MessageRowProps> = ({ message, isAuthor, canInteract, userId, grouped, onEdit, onDelete, onReact, onReply, onOpenThread, askerName, onReport }) => {
  const [editing, setEditing] = useState(false);
  const isMentioned = Boolean(message.mentions?.includes(userId));

  return (
    <article className={`group relative flex gap-3 rounded-md px-2 py-1.5 ${isMentioned ? ROW_MENTIONED : ROW_PLAIN}`}>
      {grouped ? (
        <div className="flex h-9 w-9 shrink-0 items-start justify-end pt-1" aria-hidden>
          <time className="text-3xs tabular-nums text-[var(--osio-fg-subtle)] opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">{GUTTER_TIME_FORMAT.format(new Date(message.createdAt))}</time>
        </div>
      ) : message.isAi ? (
        <div className="mt-0.5 shrink-0"><AssistantAvatar size={36} /></div>
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
          {message.isAi && (
            <span className="osio-chip text-xs text-[var(--osio-fg-muted)]">
              {askedBy(message, userId, askerName)}
            </span>
          )}
          <time className="text-xs text-[var(--osio-fg-subtle)]">{formatTime(message.createdAt)}</time>
          {message.editedAt && <span className="text-xs italic text-[var(--osio-fg-subtle)]">(edited)</span>}
          {isAuthor && <MessageTicks messageId={message.id} />}
        </div>
        )}
        {message.replyTo && (
          <div className="mb-1 max-w-md rounded-xs border-l-2 border-[var(--osio-accent)] bg-[var(--osio-bg-subtle)] px-2 py-1">
            <span className="block text-xs font-medium text-[var(--osio-accent)]">{message.replyTo.authorName}</span>
            <span className="block truncate text-xs text-[var(--osio-fg-muted)]">{message.replyTo.content || 'Attachment'}</span>
          </div>
        )}
        {editing ? (
          <MessageEditForm
            messageId={message.id}
            content={message.content}
            onEdit={onEdit}
            onClose={() => setEditing(false)}
          />
        ) : (
          // OB4: an AI answer stays plain text, so markdown cannot inline an image.
          <p className={message.isAi ? AI_BODY : HUMAN_BODY}>{message.isAi ? message.content : renderContent(message.content)}</p>
        )}
        {!message.isAi && <MessageAttachments attachments={message.attachments} />}
        {!editing && contentLinks(message).map((url) => (
          <LinkPreviewCard key={url} attachment={{ type: 'url', url }} />
        ))}
        {(message.replyCount ?? 0) > 0 && onOpenThread && (
          <Button
            tone="ghost"
            size="sm"
            className="mt-1 !text-[var(--osio-accent)]"
            onClick={() => onOpenThread(message)}
          >
            💬 {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
          </Button>
        )}
        {message.reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {groupReactions(message).map(([emoji, users]) => (
              <button
                key={emoji}
                type="button"
                className="osio-chip cursor-pointer border border-[var(--osio-border-default)] hover:border-[var(--osio-border-strong)] aria-pressed:border-[var(--osio-accent)] aria-pressed:bg-[var(--osio-accent-subtle)]"
                aria-pressed={users.includes(userId)}
                onClick={() => canInteract && onReact(message.id, emoji, !users.includes(userId))}
              >
                {emoji} {users.length}
              </button>
            ))}
          </div>
        )}
      </div>
      {canInteract && (
        <MessageToolbar message={message} isAuthor={isAuthor} userId={userId} onReply={onReply} onEdit={() => setEditing(true)} onDelete={onDelete} onReact={onReact} onReport={onReport} />
      )}
    </article>
  );
};

// Memoized: a realtime frame re-renders the list container; without memo every
// row re-ran markdown + link scanning. With stable callbacks from the view,
// only the row whose message changed re-renders.
export const MessageRow = React.memo(MessageRowImpl);
