/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CommunityPanel.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * One community's detail: header (avatar + name + description + join), then its
 * channels listed via getCommunity(id).channels. Clicking a channel opens it as
 * a workspace tab (kind 'group' for group channels, else 'channel') — the pane
 * itself is the existing ChannelMessagesView. Non-members see a Join button.
 */

import React from 'react';
import { Hash, Users } from 'lucide-react';

import type { ChatChannel } from '@/shared/chat/channelApi';
import { Button, IconValueView } from '@/shared/ui';
import { genId } from '@/widgets/workspace-grid/model/layoutTree';
import { useWorkspaceLayout } from '@/widgets/workspace-grid/model/workspaceLayout';
import { useCommunity } from './useCommunity';

function openChannelTab(channel: ChatChannel) {
  useWorkspaceLayout.getState().openTab({
    tabId: genId('tab'),
    pageId: channel.id,
    workspaceId: channel.workspaceId,
    kind: channel.kind === 'group' ? 'group' : 'channel',
    title: channel.name,
    icon: channel.kind === 'group' ? 'icon:users' : 'icon:hash',
  });
}

const ChannelRow: React.FC<{ channel: ChatChannel }> = ({ channel }) => {
  const isGroup = channel.kind === 'group';
  return (
    <button
      type="button"
      onClick={() => openChannelTab(channel)}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]"
    >
      {isGroup ? (
        <Users size={15} className="text-[var(--osio-fg-muted)]" />
      ) : (
        <Hash size={15} className="text-[var(--osio-fg-muted)]" />
      )}
      <span className="truncate">{channel.name}</span>
    </button>
  );
};

export const CommunityPanel: React.FC<{ communityId: string }> = ({ communityId }) => {
  const { community, busy, error, join } = useCommunity(communityId);

  if (!community) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--osio-fg-muted)]">
        {error ? error : busy ? 'Loading community…' : 'Community not found.'}
      </div>
    );
  }

  const channels = community.channels ?? [];
  const isMember = Boolean(community.memberRole);

  return (
    <div className="flex h-full flex-col bg-[var(--osio-bg-page)] text-[var(--osio-fg-default)]">
      <header className="flex items-start gap-3 border-b border-[var(--osio-border-default)] px-4 py-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] text-xl">
          {community.avatar ? <IconValueView value={community.avatar} size={22} /> : '🏘️'}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{community.name}</h1>
          {community.description ? (
            <p className="truncate text-sm text-[var(--osio-fg-muted)]">{community.description}</p>
          ) : null}
        </div>
        {!isMember ? (
          <Button tone="primary" disabled={busy} onClick={() => void join()}>
            {busy ? 'Joining…' : 'Join'}
          </Button>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        <p className="px-2 pb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--osio-fg-muted)]">
          Channels
        </p>
        {channels.length === 0 ? (
          <p className="px-2 py-2 text-sm text-[var(--osio-fg-muted)]">No channels yet.</p>
        ) : (
          <div className="grid gap-0.5">
            {channels.map((channel) => (
              <ChannelRow key={channel.id} channel={channel} />
            ))}
          </div>
        )}
        {error ? <p className="px-2 pt-2 text-sm text-[var(--osio-danger)]">{error}</p> : null}
      </div>
    </div>
  );
};
