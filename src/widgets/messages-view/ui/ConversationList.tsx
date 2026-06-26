/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ConversationList.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Left rail of the full-page messaging view: one row per conversation with a
 * round avatar initial, last-message preview, and an unread Badge. Row markup
 * replicates the avatar pattern from PeopleSearchBar (no DockContactRow fork).
 */

import React from 'react';

import { Badge } from '@/shared/ui';
import type { Conversation } from '../model/useConversations';

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (channelId: string) => void;
}

interface RowProps {
  convo: Conversation;
  selected: boolean;
  onSelect: (channelId: string) => void;
}

const ConversationRow: React.FC<RowProps> = ({ convo, selected, onSelect }) => {
  const { channel, preview, unread } = convo;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(channel.id)}
        aria-current={selected}
        className={`flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-[var(--osio-bg-hover)] ${
          selected ? 'bg-[var(--osio-bg-hover)]' : ''
        }`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--osio-accent)] text-sm font-semibold text-[var(--osio-accent-fg)]">
          {channel.avatar
            ? <img src={channel.avatar} alt={channel.name} className="h-full w-full object-cover" />
            : channel.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-[var(--osio-fg-default)]">{channel.name}</span>
          <span className="block truncate text-xs text-[var(--osio-fg-muted)]">{preview || 'No messages yet'}</span>
        </span>
        {unread > 0 && <Badge tone="accent">{unread > 99 ? '99+' : unread}</Badge>}
      </button>
    </li>
  );
};

export const ConversationList: React.FC<ConversationListProps> = ({ conversations, selectedId, loading, onSelect }) => (
  <ul className="space-y-0.5 px-2 py-2">
    {conversations.map((convo) => (
      <ConversationRow key={convo.channel.id} convo={convo} selected={convo.channel.id === selectedId} onSelect={onSelect} />
    ))}
    {loading && conversations.length === 0 && (
      <li className="px-2 py-3 text-sm text-[var(--osio-fg-muted)]">Loading conversations…</li>
    )}
    {!loading && conversations.length === 0 && (
      <li className="px-2 py-3 text-sm text-[var(--osio-fg-subtle)]">No conversations yet.</li>
    )}
  </ul>
);
