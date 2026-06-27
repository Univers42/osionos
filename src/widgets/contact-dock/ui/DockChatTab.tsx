/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DockChatTab.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * One LinkedIn-style stacked chat tab: a title bar (minimize / close) over the
 * existing ChannelMessagesView in its compact variant. Focused tabs expand to
 * full height; minimized tabs collapse to the bar. Opening clears unread.
 */

import React, { lazy, Suspense, useEffect } from 'react';
import { Minus, X } from 'lucide-react';

import { IconButton } from '@/shared/ui';
import { useUnreadStore } from '@/store/chat/useUnreadStore';
import type { DockTab } from '../model/useDockStore';

// Lazy: the dock chat view (ChannelMessagesView + composer + message rows, ~42KB)
// only mounts when a stacked chat tab is expanded, so it must stay off the warm
// entry chunk — same code-split discipline as lazyViews.tsx.
const ChannelMessagesView = lazy(() =>
  import('@/widgets/channel-messages/ui/ChannelMessagesView').then((m) => ({ default: m.ChannelMessagesView })),
);

interface DockChatTabProps {
  tab: DockTab;
  focused: boolean;
  minimized: boolean;
  onFocus: () => void;
  onMinimize: () => void;
  onClose: () => void;
}

export const DockChatTab: React.FC<DockChatTabProps> = ({
  tab,
  focused,
  minimized,
  onFocus,
  onMinimize,
  onClose,
}) => {
  const markSeen = useUnreadStore((s) => s.markSeen);

  useEffect(() => {
    if (focused && !minimized) markSeen(tab.channelId);
  }, [focused, minimized, tab.channelId, markSeen]);

  const expanded = focused && !minimized;

  return (
    <section
      className="pointer-events-auto flex w-[19rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-t-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-elevated)] shadow-[var(--osio-shadow-menu)]"
      style={{ height: expanded ? '26rem' : 'auto' }}
      aria-label={`Chat with ${tab.title}`}
    >
      <header
        onClick={minimized ? onFocus : undefined}
        className="flex min-h-11 shrink-0 items-center gap-[var(--osio-space-2)] border-b border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-[var(--osio-space-3)]"
      >
        <button
          type="button"
          onClick={onFocus}
          className="min-w-0 flex-1 truncate py-[var(--osio-space-2)] text-left text-sm font-semibold text-[var(--osio-fg-default)]"
        >
          {tab.title}
        </button>
        <IconButton size="sm" aria-label={minimized ? 'Expand conversation' : 'Minimize conversation'} onClick={onMinimize}>
          <Minus size={15} aria-hidden="true" />
        </IconButton>
        <IconButton size="sm" aria-label="Close conversation" onClick={onClose}>
          <X size={15} aria-hidden="true" />
        </IconButton>
      </header>
      {expanded && (
        <div className="min-h-0 flex-1">
          <Suspense fallback={<div className="flex h-full items-center justify-center"><div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--osio-accent)] border-t-transparent" /></div>}>
            <ChannelMessagesView
              channelId={tab.channelId}
              workspaceId={tab.workspaceId}
              title={tab.title}
              variant="compact"
            />
          </Suspense>
        </div>
      )}
    </section>
  );
};
