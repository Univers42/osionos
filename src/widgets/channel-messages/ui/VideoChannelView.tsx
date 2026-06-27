/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   VideoChannelView.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Voice/video channel = the conference IS the channel (Discord-style): the
 * LiveKit room fills the pane and auto-connects on open, with the channel chat
 * available as a side toggle. Leaving drops to a Rejoin screen (remounting the
 * room reconnects). livekit-client stays lazy until the channel is opened.
 */

import React, { Suspense, lazy, useState } from 'react';
import { MessageSquare } from 'lucide-react';

import { ChannelMessagesView } from './ChannelMessagesView';

const LazyVideoRoomView = lazy(() =>
  import('@/widgets/video-room/VideoRoomView').then((m) => ({ default: m.VideoRoomView })),
);

interface VideoChannelViewProps {
  channelId: string;
  workspaceId?: string;
  title?: string;
}

export const VideoChannelView: React.FC<VideoChannelViewProps> = ({ channelId, workspaceId, title }) => {
  const [showChat, setShowChat] = useState(false);
  const [joined, setJoined] = useState(true);

  return (
    <div className="flex h-full bg-[var(--osio-bg-page)] text-[var(--osio-fg-default)]">
      <div className="relative flex h-full min-w-0 flex-1 flex-col">
        {joined ? (
          <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-[var(--osio-fg-muted)]">Loading call…</div>}>
            <LazyVideoRoomView channelId={channelId} room={`channel-${channelId}`} workspaceId={workspaceId} onLeave={() => setJoined(false)} />
          </Suspense>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="text-sm text-[var(--osio-fg-muted)]">You left {title ? `#${title}` : 'the call'}.</p>
            <button
              type="button"
              onClick={() => setJoined(true)}
              className="rounded-md bg-[var(--osio-accent)] px-4 py-2 text-sm font-semibold text-[var(--osio-accent-fg)] hover:opacity-90"
            >
              Rejoin call
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowChat((value) => !value)}
          aria-label={showChat ? 'Hide chat' : 'Show chat'}
          className={`absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium backdrop-blur transition-colors ${showChat
            ? 'border-[var(--osio-accent)] bg-[var(--osio-bg-muted)] text-[var(--osio-fg-default)]'
            : 'border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)]/80 text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]'}`}
        >
          <MessageSquare size={14} /> {showChat ? 'Hide chat' : 'Chat'}
        </button>
      </div>
      {showChat && (
        <aside className="flex h-full w-80 shrink-0 flex-col border-l border-[var(--osio-border-default)]">
          <ChannelMessagesView channelId={channelId} workspaceId={workspaceId ?? ''} title={title} variant="compact" />
        </aside>
      )}
    </div>
  );
};
