/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ChannelList.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Channel list: bridge text/voice/video channels I can see (#general, War
 * Room, …) across my workspaces — same cross-workspace shape as DmList —
 * each opening as a channel tab through the exact same mechanism as DmList.
 * Voice/video channels carry a small camera glyph. Hidden when the bridge
 * is absent or there are no channels.
 */

import React, { useState } from 'react';
import { Hash, Plus, Video } from 'lucide-react';

import type { ChatChannel } from '@/shared/chat/channelApi';
import { genId } from '@/widgets/workspace-grid/model/layoutTree';
import { useWorkspaceLayout } from '@/widgets/workspace-grid/model/workspaceLayout';
import { useUnreadStore } from '@/store/chat/useUnreadStore';
import { UnreadBadge } from '@/shared/chat/UnreadBadge';
import { CreateChannelModal } from './CreateChannelModal';
import { useWorkspaceChannels } from './useWorkspaceChannels';

function isCallChannel(channel: ChatChannel): boolean {
  return channel.kind === 'voice' || channel.kind === 'video';
}

function openChannelTab(channel: ChatChannel) {
  useWorkspaceLayout.getState().openTab({
    tabId: genId('tab'),
    pageId: channel.id,
    workspaceId: channel.workspaceId,
    kind: 'channel',
    title: channel.name,
    icon: isCallChannel(channel) ? 'icon:video' : 'icon:hash',
  });
}

export const ChannelList: React.FC = () => {
  const { channels, available, reload } = useWorkspaceChannels();
  const counts = useUnreadStore((s) => s.counts);
  const [createOpen, setCreateOpen] = useState(false);

  if (!available) return null;

  return (
    <section className="px-2 py-1" data-channel-list>
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase text-[var(--osio-fg-subtle)]">Channels</h2>
        <button
          type="button"
          aria-label="Create channel"
          title="Create channel"
          onClick={() => setCreateOpen(true)}
          className="rounded p-1 text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
        >
          <Plus size={14} />
        </button>
      </div>
      <CreateChannelModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={reload} />
      <ul className="mt-1 space-y-0.5">
        {channels.map((channel) => (
          <li key={channel.id}>
            <button
              type="button"
              onClick={() => openChannelTab(channel)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
            >
              {isCallChannel(channel)
                ? <Video size={14} className="shrink-0" aria-label="Voice or video channel" />
                : <Hash size={14} className="shrink-0" />}
              <span className="truncate">{channel.name}</span>
              <UnreadBadge count={counts[channel.id] ?? 0} />
            </button>
          </li>
        ))}
        {channels.length === 0 && (
          <li className="px-2 py-1 text-xs text-[var(--osio-fg-subtle)]">No channels yet — use + to create one.</li>
        )}
      </ul>
    </section>
  );
};
