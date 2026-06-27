/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ContactDock.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Floating LinkedIn-style contact dock. A collapsed pill (bottom-right) toggles
 * the expanded messaging panel; open conversations stack to its left as chat
 * tabs. The shell raises to --osio-z-popover whenever a chat tab is focused so
 * an active conversation floats above sticky page chrome. Mount once beside
 * <ToastViewport/> in App.tsx.
 */

import React from 'react';
import { MessageCircle } from 'lucide-react';

import { Badge } from '@/shared/ui';
import { useUnreadStore } from '@/store/chat/useUnreadStore';
import { useDockStore } from '../model/useDockStore';
import { DockPanel } from './DockPanel';
import { DockShell } from './DockShell';
import { DockTabStrip } from './DockTabStrip';

function useTotalUnread(): number {
  const counts = useUnreadStore((s) => s.counts);
  return Object.values(counts).reduce((sum, n) => sum + (n || 0), 0);
}

export const ContactDock: React.FC = () => {
  const collapsed = useDockStore((s) => s.collapsed);
  const focusedId = useDockStore((s) => s.focusedId);
  const toggleCollapsed = useDockStore((s) => s.toggleCollapsed);
  const total = useTotalUnread();

  return (
    <DockShell raised={Boolean(focusedId)}>
      <DockTabStrip />
      {collapsed ? (
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={total > 0 ? `Messaging, ${total} unread` : 'Open messaging'}
          title={total > 0 ? `Messaging — ${total} unread` : 'Messaging'}
          className="pointer-events-auto relative inline-flex h-12 w-12 min-h-11 items-center justify-center rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-elevated)] text-[var(--osio-fg-default)] shadow-[var(--osio-shadow-menu)] transition-transform duration-150 ease-out hover:-translate-y-0.5"
        >
          {/* Icon-only: aria-label + title (hover) name the control — no "Messaging" word. */}
          <MessageCircle size={20} className="text-[var(--osio-accent)]" aria-hidden="true" />
          {total > 0 && (
            <Badge tone="accent" className="absolute -right-1 -top-1">
              {total > 99 ? '99+' : total}
            </Badge>
          )}
        </button>
      ) : (
        <DockPanel onCollapse={toggleCollapsed} />
      )}
    </DockShell>
  );
};
