/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MessageSearchPanel.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Channel-header message search dropdown: a query box + this-channel/all scope
 * toggle + membership-scoped results. Clicking a hit opens that channel's tab
 * (reusing the workspace layout, same as the sidebar lists).
 */

import React, { useState } from 'react';
import { Search, X } from 'lucide-react';

import type { MessageHit } from '@/shared/chat/searchApi';
import { genId } from '@/widgets/workspace-grid/model/layoutTree';
import { useWorkspaceLayout } from '@/widgets/workspace-grid/model/workspaceLayout';
import { useMessageSearch } from '../model/useMessageSearch';

function openHit(hit: MessageHit) {
  if (!hit.workspaceId) return;
  useWorkspaceLayout.getState().openTab({
    tabId: genId('tab'), pageId: hit.channelId, workspaceId: hit.workspaceId,
    kind: 'channel', title: hit.channelName, icon: 'icon:hash',
  });
}

interface MessageSearchPanelProps {
  channelId: string;
  onClose: () => void;
}

export const MessageSearchPanel: React.FC<MessageSearchPanelProps> = ({ channelId, onClose }) => {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'channel' | 'all'>('channel');
  const { hits, loading } = useMessageSearch(query, scope === 'channel' ? channelId : undefined);
  const tabClass = (active: boolean) => `rounded px-2 py-0.5 ${active ? 'bg-[var(--osio-bg-muted)] text-[var(--osio-fg-default)]' : 'text-[var(--osio-fg-muted)]'}`;

  return (
    <div className="absolute right-0 top-full z-[var(--osio-z-modal)] mt-2 w-96 overflow-hidden rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] shadow-[var(--osio-shadow-menu)]">
      <div className="flex items-center gap-2 border-b border-[var(--osio-border-default)] p-2">
        <Search size={14} className="shrink-0 text-[var(--osio-fg-muted)]" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}
          placeholder="Search messages…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--osio-fg-subtle)]"
        />
        <button type="button" aria-label="Close search" onClick={onClose} className="rounded p-1 text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"><X size={14} /></button>
      </div>
      <div className="flex gap-1 border-b border-[var(--osio-border-default)] p-1.5 text-xs">
        <button type="button" onClick={() => setScope('channel')} className={tabClass(scope === 'channel')}>This channel</button>
        <button type="button" onClick={() => setScope('all')} className={tabClass(scope === 'all')}>All my channels</button>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {loading && <div className="px-3 py-2 text-xs text-[var(--osio-fg-muted)]">Searching…</div>}
        {!loading && query.trim().length >= 2 && hits.length === 0 && <div className="px-3 py-2 text-xs text-[var(--osio-fg-muted)]">No matches.</div>}
        {hits.map((hit) => (
          <button
            key={hit.messageId}
            type="button"
            onClick={() => { openHit(hit); onClose(); }}
            className="block w-full px-3 py-2 text-left hover:bg-[var(--osio-bg-hover)]"
          >
            <span className="block truncate text-xs text-[var(--osio-fg-subtle)]">#{hit.channelName} · {hit.authorName}</span>
            <span className="block truncate text-sm text-[var(--osio-fg-default)]">{hit.snippet}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
