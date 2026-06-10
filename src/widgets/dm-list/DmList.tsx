/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DmList.tsx                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Direct-message list: my DM channels (bridge-persisted), each opening as a
 * channel tab, plus a people picker (shared /api/people search) to start a
 * new DM. Hidden entirely when the bridge has no chat endpoints.
 */

import React, { useState } from 'react';
import { MessageCircle, Plus } from 'lucide-react';

import { openDm, type ChatChannel } from '@/shared/chat/channelApi';
import { usePeopleSearch } from '@/shared/people/usePeopleSearch';
import { genId } from '@/widgets/workspace-grid/model/layoutTree';
import { useWorkspaceLayout } from '@/widgets/workspace-grid/model/workspaceLayout';
import { useDmChannels } from './useDmChannels';

function openChannelTab(channel: ChatChannel) {
  useWorkspaceLayout.getState().openTab({
    tabId: genId('tab'),
    pageId: channel.id,
    workspaceId: channel.workspaceId,
    kind: 'channel',
    title: channel.name,
    icon: 'icon:message-circle',
  });
}

export const DmList: React.FC = () => {
  const { channels, loading, available, reload } = useDmChannels();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { people } = usePeopleSearch(query);

  if (!available) return null;

  const startDm = (peerUserId: string) => {
    openDm(peerUserId)
      .then((channel) => {
        setPickerOpen(false);
        setQuery('');
        reload();
        openChannelTab(channel);
      })
      .catch(() => undefined);
  };

  return (
    <section className="px-2 py-1">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase text-[var(--osio-fg-subtle)]">Direct messages</h2>
        <button
          type="button"
          aria-label="Start a direct message"
          title="Start a direct message"
          onClick={() => setPickerOpen((open) => !open)}
          className="rounded p-1 text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
        >
          <Plus size={14} />
        </button>
      </div>
      {pickerOpen && (
        <div className="mt-1 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-1.5">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Escape') setPickerOpen(false); }}
            placeholder="Search people…"
            className="w-full rounded border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 py-1 text-sm outline-none focus:border-[var(--osio-accent)]"
          />
          <ul className="mt-1 max-h-44 overflow-y-auto">
            {people.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  onClick={() => startDm(person.id)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-[var(--osio-bg-hover)]"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${person.online ? 'bg-green-500' : 'bg-[var(--osio-fg-subtle)]'}`} />
                  <span className="truncate">{person.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="mt-1 space-y-0.5">
        {channels.map((channel) => (
          <li key={channel.id}>
            <button
              type="button"
              onClick={() => openChannelTab(channel)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
            >
              <MessageCircle size={14} className="shrink-0" />
              <span className="truncate">{channel.name}</span>
            </button>
          </li>
        ))}
        {!loading && channels.length === 0 && !pickerOpen && (
          <li className="px-2 py-1 text-xs text-[var(--osio-fg-subtle)]">No conversations yet.</li>
        )}
      </ul>
    </section>
  );
};
