/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CallPanel.tsx                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * In-channel call surface for voice/video channels: mounts the LiveKit
 * VideoRoomView above the chat. The deep lazy import keeps livekit-client
 * out of the channel chunk until someone actually joins a call. Room name
 * follows the documented `channel-<id>` convention (bridge-rtc default).
 */

import React, { Suspense, lazy } from 'react';

const LazyVideoRoomView = lazy(() =>
  import('@/widgets/video-room/VideoRoomView').then((m) => ({ default: m.VideoRoomView })),
);

interface CallPanelProps {
  channelId: string;
  workspaceId?: string;
  /** Called when the local participant leaves — unmount the panel. */
  onLeave: () => void;
}

export const CallPanel: React.FC<CallPanelProps> = ({ channelId, workspaceId, onLeave }) => (
  <div className="h-[340px] shrink-0 border-b border-[var(--osio-border-default)]" data-call-panel>
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-sm text-[var(--osio-fg-muted)]">
          Loading call…
        </div>
      }
    >
      <LazyVideoRoomView
        channelId={channelId}
        room={`channel-${channelId}`}
        workspaceId={workspaceId}
        onLeave={onLeave}
      />
    </Suspense>
  </div>
);
