/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ConversationFilters.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * WhatsApp-style conversation filters: a search input + All/Unread/Groups
 * scope pills (MiniTabs). Purely presentational — selection + query live in
 * MessagesView and feed useConversationFilter.
 */

import React from 'react';
import { Search } from 'lucide-react';

import { MiniTabs } from '@/shared/ui';
import type { ConversationScope } from '../model/useConversationFilter';

interface ConversationFiltersProps {
  scope: ConversationScope;
  query: string;
  onScope: (scope: ConversationScope) => void;
  onQuery: (query: string) => void;
}

const SCOPES: { value: ConversationScope; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'groups', label: 'Groups' },
];

export const ConversationFilters: React.FC<ConversationFiltersProps> = ({
  scope,
  query,
  onScope,
  onQuery,
}) => (
  <div className="grid gap-2 px-3 py-2">
    <div className="relative">
      <Search
        size={15}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--osio-fg-subtle)]"
      />
      <input
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        placeholder="Search or start a new chat"
        aria-label="Search conversations"
        className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] py-1.5 pl-8 pr-2 text-sm outline-none focus:border-[var(--osio-accent)]"
      />
    </div>
    <MiniTabs value={scope} options={SCOPES} onChange={onScope} size="sm" />
  </div>
);
