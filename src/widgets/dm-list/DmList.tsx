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

import React, { useMemo, useState } from 'react';
import { MessageCircle, Plus, Users } from 'lucide-react';

import { openDm, type ChatChannel } from '@/shared/chat/channelApi';
import { CreateGroupModal } from '@/features/group-chat/CreateGroupModal';
import { PeoplePickerList } from '@/shared/people/PeoplePickerList';
import type { PersonHit } from '@/shared/people/usePeopleSearch';
import { useContactsStore } from '@/store/social/useContactsStore';
import { useToastStore } from '@/shared/ui';
import { UnreadBadge } from '@/shared/chat/UnreadBadge';
import { genId } from '@/widgets/workspace-grid/model/layoutTree';
import { useWorkspaceLayout } from '@/widgets/workspace-grid/model/workspaceLayout';
import { useUnreadStore } from '@/store/chat/useUnreadStore';
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
  const counts = useUnreadStore((s) => s.counts);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  // Your accepted connections, shown first in the picker so connected people are who you
  // reach for — not the full seeded directory. Falls back to directory search on type.
  const contacts = useContactsStore((s) => s.data);
  const connectionPeople = useMemo<PersonHit[]>(
    () => contacts
      .filter((edge) => edge?.peer)
      .map((edge) => ({ id: edge.peer.id, name: edge.peer.name, username: null, avatar: edge.peer.avatar, wsRole: null, online: !!edge.peer.online })),
    [contacts],
  );

  if (!available) return null;

  const startDm = (peerUserId: string) => {
    openDm(peerUserId)
      .then((channel) => {
        setPickerOpen(false);
        reload();
        openChannelTab(channel);
      })
      .catch((error) => {
        // Don't swallow — a silent failure looks like "clicking does nothing".
        useToastStore.getState().push({
          kind: 'error',
          title: 'Could not open the conversation',
          description: error instanceof Error ? error.message : undefined,
        });
      });
  };

  return (
    <section className="px-2 py-1">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase text-[var(--osio-fg-subtle)]">Direct messages</h2>
        <span className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="New group"
            title="New group"
            onClick={() => setGroupOpen(true)}
            className="rounded p-1 text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
          >
            <Users size={14} />
          </button>
          <button
            type="button"
            aria-label="Start a direct message"
            title="Start a direct message"
            onClick={() => setPickerOpen((open) => !open)}
            className="rounded p-1 text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
          >
            <Plus size={14} />
          </button>
        </span>
      </div>
      <CreateGroupModal open={groupOpen} onClose={() => setGroupOpen(false)} />
      {pickerOpen && (
        <div className="mt-1">
          <PeoplePickerList
            onPick={(person) => startDm(person.id)}
            onEscape={() => setPickerOpen(false)}
            connections={connectionPeople}
          />
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
              <UnreadBadge count={counts[channel.id] ?? 0} />
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
