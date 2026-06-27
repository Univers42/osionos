/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ChannelPane.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Routes a channel pane by kind: a voice/video channel opens as the LiveKit
 * conference (VideoChannelView); text/dm/group open as the chat
 * (ChannelMessagesView). The kind lookup is a cheap cached fetch, so the heavy
 * chat hooks only mount when actually rendering chat. Compact (dock) always
 * uses chat — no room in a docked tab for a call grid.
 */

import React from 'react';

import { useChannelInfo } from '../model/useChannelInfo';
import { ChannelMessagesView } from './ChannelMessagesView';
import { VideoChannelView } from './VideoChannelView';

interface ChannelPaneProps {
  channelId: string;
  workspaceId: string;
  title?: string;
  variant?: 'full' | 'compact';
}

export const ChannelPane: React.FC<ChannelPaneProps> = ({ channelId, workspaceId, title, variant }) => {
  const channel = useChannelInfo(channelId);
  const isCall = channel?.kind === 'voice' || channel?.kind === 'video';

  if (isCall && variant !== 'compact') {
    return <VideoChannelView channelId={channelId} workspaceId={workspaceId || channel?.workspaceId} title={title} />;
  }
  return <ChannelMessagesView channelId={channelId} workspaceId={workspaceId} title={title} variant={variant} />;
};
