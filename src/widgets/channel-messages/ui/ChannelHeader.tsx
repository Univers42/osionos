/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ChannelHeader.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Channel header: icon, name, connection/count line, search, optional Join-call. */

import React, { useState } from 'react';
import { Hash, MessageSquare, Search, Video, Volume2 } from 'lucide-react';

import { MessageSearchPanel } from './MessageSearchPanel';

interface ChannelHeaderProps {
  channelId: string;
  name: string;
  kind?: string;
  connected: boolean;
  messageCount: number;
  showJoinCall: boolean;
  onJoinCall: () => void;
}

function channelIcon(kind?: string) {
  if (kind === 'dm') return <MessageSquare size={18} />;
  if (kind === 'voice' || kind === 'audio') return <Volume2 size={18} />;
  if (kind === 'video') return <Video size={18} />;
  return <Hash size={18} />;
}

export const ChannelHeader: React.FC<ChannelHeaderProps> = ({
  channelId,
  name,
  kind,
  connected,
  messageCount,
  showJoinCall,
  onJoinCall,
}) => {
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <header className="flex min-h-14 items-center gap-3 border-b border-[var(--osio-border-default)] px-5">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--osio-bg-subtle)] text-[var(--osio-fg-muted)]">
        {channelIcon(kind)}
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold">{name}</h1>
        <p className="truncate text-xs text-[var(--osio-fg-muted)]">
          {connected ? 'Connected' : 'Local'} · {messageCount} messages
        </p>
      </div>
      {connected && (
        <div className="relative">
          <button
            type="button"
            aria-label="Search messages"
            onClick={() => setSearchOpen((open) => !open)}
            className="rounded-md p-2 text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
          >
            <Search size={16} />
          </button>
          {searchOpen && <MessageSearchPanel channelId={channelId} onClose={() => setSearchOpen(false)} />}
        </div>
      )}
      {showJoinCall && (
        <button
          type="button"
          onClick={onJoinCall}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--osio-accent)] px-3 py-1.5 text-xs font-medium text-[var(--osio-accent-fg)] hover:opacity-90"
        >
          <Video size={14} /> Join call
        </button>
      )}
    </header>
  );
};
