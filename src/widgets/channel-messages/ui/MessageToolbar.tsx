/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MessageToolbar.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from 'react';
import { Flag, Pencil, Reply, SmilePlus, Sparkles, Trash2 } from 'lucide-react';

import type { ChatMessage } from '@/shared/chat/messageApi';
import { IconButton } from '@/shared/ui';
import { isAiConfigured } from '@/features/ai/api/aiClient';
import { quoteForAssistant } from '@/features/chat/model/assistantHandoff';
import { openAssistantWith } from '@/features/chat/model/openAssistantWith';

const QUICK_EMOJI = ['👍', '❤️', '🔥', '🎉'];
const BUTTON_CLASS = '!h-7 !w-7';
const PILL_BASE = 'absolute -top-3 right-2 z-10 flex items-center gap-0.5 rounded-lg border border-[var(--osio-overlay-border)] bg-[var(--osio-overlay-bg)] p-0.5 shadow-[var(--osio-overlay-shadow)] transition-opacity motion-reduce:transition-none forced-colors:border-[CanvasText]';
const PILL_HIDDEN = 'pointer-events-none opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100';
const PILL_SHOWN = 'opacity-100';

interface MessageToolbarProps {
  message: ChatMessage;
  isAuthor: boolean;
  onReply: (message: ChatMessage) => void;
  onEdit: () => void;
  onDelete: (messageId: string) => void;
  onReact: (messageId: string, emoji: string, add: boolean) => void;
  onReport?: (message: ChatMessage) => void;
  userId: string;
}

/**
 * The floating action pill of a message row. It sits on the overlay tokens (so
 * the Style presets restyle it) and is revealed by hover OR keyboard focus
 * anywhere in the row; its buttons stay in the tab order while it is faint, and
 * an open reaction picker pins it.
 */
export const MessageToolbar: React.FC<MessageToolbarProps> = ({ message, isAuthor, onReply, onEdit, onDelete, onReact, onReport, userId }) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <div data-testid="message-toolbar" role="toolbar" aria-label="Message actions" className={`${PILL_BASE} ${pickerOpen ? PILL_SHOWN : PILL_HIDDEN}`}>
      <IconButton size="xs" className={BUTTON_CLASS} label="Reply" onClick={() => onReply(message)}><Reply size={14} /></IconButton>
      <IconButton size="xs" className={BUTTON_CLASS} label="Add reaction" onClick={() => setPickerOpen((open) => !open)}><SmilePlus size={14} /></IconButton>
      {isAiConfigured() && (
        <IconButton size="xs" className={BUTTON_CLASS} label="Ask AI about this message" onClick={() => openAssistantWith({ text: quoteForAssistant([{ author: message.authorName, text: message.content }]) })}>
          <Sparkles size={14} />
        </IconButton>
      )}
      {isAuthor && !message.isAi && (
        <IconButton size="xs" className={BUTTON_CLASS} label="Edit message" onClick={onEdit}><Pencil size={14} /></IconButton>
      )}
      {message.isAi && onReport && (
        <IconButton size="xs" className={BUTTON_CLASS} label="Report AI answer" onClick={() => onReport(message)}><Flag size={14} /></IconButton>
      )}
      {isAuthor && (
        <IconButton size="xs" className={BUTTON_CLASS} label="Delete message" onClick={() => onDelete(message.id)}><Trash2 size={14} /></IconButton>
      )}
      {pickerOpen && (
        <div className="absolute right-0 top-8 z-10 flex gap-1 rounded-lg border border-[var(--osio-overlay-border)] bg-[var(--osio-overlay-bg)] p-1 shadow-[var(--osio-overlay-shadow)]">
          {QUICK_EMOJI.map((emoji) => (
            <IconButton
              key={emoji}
              size="xs"
              label={`React with ${emoji}`}
              className="text-sm"
              onClick={() => {
                onReact(message.id, emoji, !message.reactions.some((r) => r.userId === userId && r.emoji === emoji));
                setPickerOpen(false);
              }}
            >
              {emoji}
            </IconButton>
          ))}
        </div>
      )}
    </div>
  );
};
