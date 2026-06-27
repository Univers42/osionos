/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DockPanel.tsx                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Expanded dock panel (~360px): AI row pinned on top, then recent DM
 * conversations and a "start new chat" people picker. Each conversation opens
 * as a stacked dock chat tab; unread counters come from useUnreadStore.
 */

import React, { useState } from 'react';
import { Plus, Sparkles, X } from 'lucide-react';

import { openDm } from '@/shared/chat/channelApi';
import { PeoplePickerList } from '@/shared/people/PeoplePickerList';
import { IconButton } from '@/shared/ui';
import { useUnreadStore } from '@/store/chat/useUnreadStore';
import { useDmChannels } from '@/widgets/dm-list/useDmChannels';
import { useDockStore, type DockTab } from '../model/useDockStore';
import { DockContactRow } from './DockContactRow';

interface DockPanelProps {
  onCollapse: () => void;
}

export const DockPanel: React.FC<DockPanelProps> = ({ onCollapse }) => {
  const { channels, loading, available, reload } = useDmChannels();
  const counts = useUnreadStore((s) => s.counts);
  const openTab = useDockStore((s) => s.openTab);
  const aiOpen = useDockStore((s) => s.aiOpen);
  const toggleAi = useDockStore((s) => s.toggleAi);
  const [pickerOpen, setPickerOpen] = useState(false);

  const open = (tab: DockTab) => openTab(tab);

  const startDm = (peerUserId: string) => {
    openDm(peerUserId)
      .then((channel) => {
        setPickerOpen(false);
        reload();
        open({ channelId: channel.id, workspaceId: channel.workspaceId, title: channel.name });
      })
      .catch(() => undefined);
  };

  return (
    <section
      className="pointer-events-auto flex max-h-[28rem] w-[22.5rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-elevated)] shadow-[var(--osio-shadow-modal)]"
      aria-label="Messaging"
    >
      <header className="flex min-h-11 shrink-0 items-center gap-[var(--osio-space-2)] border-b border-[var(--osio-border-default)] px-[var(--osio-space-3)]">
        <span className="flex-1 text-sm font-semibold text-[var(--osio-fg-default)]">Messaging</span>
        <IconButton size="sm" aria-label="Start a new chat" onClick={() => setPickerOpen((o) => !o)}>
          <Plus size={16} aria-hidden="true" />
        </IconButton>
        <IconButton size="sm" aria-label="Collapse messaging" onClick={onCollapse}>
          <X size={16} aria-hidden="true" />
        </IconButton>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-[var(--osio-space-2)]">
        <button
          type="button"
          onClick={toggleAi}
          aria-pressed={aiOpen}
          className="flex w-full min-h-11 items-center gap-[var(--osio-space-3)] rounded-md border-l-2 border-l-[var(--osio-accent)] bg-[var(--osio-accent-subtle)] px-[var(--osio-space-3)] py-[var(--osio-space-2)] text-left transition-colors duration-150 ease-out hover:opacity-90"
        >
          <Sparkles size={18} className="text-[var(--osio-accent)]" aria-hidden="true" />
          <span className="flex-1 truncate text-sm font-medium text-[var(--osio-accent-text)]">Ask the assistant</span>
        </button>

        {pickerOpen && (
          <div className="mt-[var(--osio-space-2)]">
            <PeoplePickerList onPick={(p) => startDm(p.id)} onEscape={() => setPickerOpen(false)} />
          </div>
        )}

        <div className="mt-[var(--osio-space-3)] space-y-0.5">
          {loading && (
            <p className="px-[var(--osio-space-2)] py-[var(--osio-space-2)] text-xs text-[var(--osio-fg-muted)]">Loading conversations…</p>
          )}
          {!available && !loading && (
            <p className="px-[var(--osio-space-2)] py-[var(--osio-space-2)] text-xs text-[var(--osio-fg-muted)]">Messaging is offline.</p>
          )}
          {available && !loading && channels.length === 0 && !pickerOpen && (
            <p className="px-[var(--osio-space-2)] py-[var(--osio-space-2)] text-xs text-[var(--osio-fg-subtle)]">No conversations yet.</p>
          )}
          {channels.map((channel) => (
            <DockContactRow
              key={channel.id}
              name={channel.name}
              unread={counts[channel.id] ?? 0}
              onOpen={() => open({ channelId: channel.id, workspaceId: channel.workspaceId, title: channel.name })}
            />
          ))}
        </div>
      </div>
    </section>
  );
};
