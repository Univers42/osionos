/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MessagesView.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Full-page messaging surface (tab.kind === "messages"): a WhatsApp-style
 * inbox — left is the filtered conversation list (search + All/Unread/Groups)
 * with a New-chat menu, center is the EXISTING ChannelMessagesView for the
 * selected channel, and an optional right "Contact info" rail (ContactInfoPanel
 * with the Media/links/docs gallery). No router; selection is plain state.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Info, MessageSquare, SquarePen, Users } from 'lucide-react';

import { useUnreadStore } from '@/store/chat/useUnreadStore';
import { ChannelMessagesView } from '@/widgets/channel-messages/ui/ChannelMessagesView';
import { IconButton, Popover } from '@/shared/ui';
import { useConversations } from '../model/useConversations';
import { useConversationFilter, type ConversationScope } from '../model/useConversationFilter';
import { ConversationList } from './ConversationList';
import { ConversationFilters } from './ConversationFilters';
import { NewChatMenu } from './NewChatMenu';
import { ContactInfoPanel } from './contact-info/ContactInfoPanel';
import { useWorkspaceLayout } from '@/widgets/workspace-grid/model/workspaceLayout';
import { communityTab } from '@/widgets/workspace-grid/model/layoutPersist';

export const MessagesView: React.FC = () => {
  const { conversations, loading, available, reload } = useConversations();
  const [picked, setPicked] = useState<string | null>(null);
  const [scope, setScope] = useState<ConversationScope>('all');
  const [query, setQuery] = useState('');
  const [showInfo, setShowInfo] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const newChatRef = useRef<HTMLButtonElement>(null);
  const markSeen = useUnreadStore((s) => s.markSeen);

  const visible = useConversationFilter(conversations, scope, query);
  const selected = useMemo(() => {
    const byPick = picked ? conversations.find((c) => c.channel.id === picked)?.channel : undefined;
    return byPick ?? visible[0]?.channel ?? conversations[0]?.channel ?? null;
  }, [conversations, visible, picked]);
  const selectedId = selected?.id ?? null;

  useEffect(() => {
    if (selectedId) markSeen(selectedId);
  }, [selectedId, markSeen]);

  return (
    <div className="flex h-full bg-[var(--osio-bg-page)] text-[var(--osio-fg-default)]">
      <aside className="flex w-72 shrink-0 flex-col border-r border-[var(--osio-border-default)]">
        <header className="flex min-h-14 items-center gap-2 border-b border-[var(--osio-border-default)] px-4">
          <MessageSquare size={18} className="text-[var(--osio-fg-muted)]" />
          <h1 className="flex-1 text-base font-semibold">Messages</h1>
          <IconButton aria-label="Communities" onClick={() => useWorkspaceLayout.getState().openTab(communityTab())}>
            <Users size={18} />
          </IconButton>
          <IconButton ref={newChatRef} aria-label="New chat" onClick={() => setNewChatOpen(true)}>
            <SquarePen size={18} />
          </IconButton>
        </header>
        <ConversationFilters scope={scope} query={query} onScope={setScope} onQuery={setQuery} />
        <div className="flex-1 overflow-y-auto">
          <ConversationList conversations={visible} selectedId={selectedId} loading={loading} onSelect={setPicked} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1">
        {selected ? (
          <>
            <div className="relative min-w-0 flex-1">
              <IconButton
                aria-label="Contact info"
                aria-pressed={showInfo}
                onClick={() => setShowInfo((value) => !value)}
                className="absolute right-3 top-3 z-10"
              >
                <Info size={18} />
              </IconButton>
              <ChannelMessagesView
                key={selected.id}
                channelId={selected.id}
                workspaceId={selected.workspaceId}
                title={selected.name}
              />
            </div>
            {showInfo && <ContactInfoPanel channel={selected} onClose={() => setShowInfo(false)} />}
          </>
        ) : (
          <div className="flex h-full flex-1 items-center justify-center text-sm text-[var(--osio-fg-muted)]">
            {available ? 'Select a conversation to start chatting.' : 'Messaging is unavailable.'}
          </div>
        )}
      </div>

      <Popover anchorRef={newChatRef} open={newChatOpen} onClose={() => setNewChatOpen(false)} align="end" className="w-72">
        <NewChatMenu onClose={() => { setNewChatOpen(false); reload(); }} onDmOpened={(channel) => setPicked(channel.id)} />
      </Popover>
    </div>
  );
};
