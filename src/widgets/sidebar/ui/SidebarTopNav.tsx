/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SidebarTopNav.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/05 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 21:26:11 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';
import { Search, Home, Mic, Inbox, MessageCircle } from 'lucide-react';

interface SidebarTopNavProps {
  isHomeActive: boolean;
  onOpenHome?: () => void;
}

/** Horizontal top-level navigation items: Home, Chat, Meetings, Inbox, Search. */

export const SidebarTopNav: React.FC<SidebarTopNavProps> = ({ isHomeActive, onOpenHome }) => {
  const tabs = [
    { id: 'home', label: 'Home', icon: <Home size={16} />, active: isHomeActive, onClick: () => onOpenHome?.() },
    { id: 'chat', label: 'Chat', icon: <MessageCircle size={16} />, active: false, onClick: () => undefined },
    { id: 'meetings', label: 'Meetings', icon: <Mic size={16} />, active: false, onClick: () => undefined },
    { id: 'inbox', label: 'Inbox', icon: <Inbox size={16} />, active: false, onClick: () => undefined },
  ];

  return (
    <div className="mx-2 flex items-center gap-0.5 pb-2 cursor-pointer min-w-0">
      <div role="tablist" aria-label="Sidebar navigation" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.active}
            aria-label={tab.label}
            onClick={tab.onClick}
            className={[
              'flex h-8 min-w-0 shrink items-center justify-center overflow-hidden rounded-md px-2 text-sm font-medium transition-colors',
              tab.active
                ? 'bg-[var(--color-surface-tertiary)] text-[var(--color-ink)]'
                : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]',
            ].join(' ')}
            title={tab.label}
          >
            <span className="flex shrink-0 items-center opacity-80">{tab.icon}</span>
            <span className={tab.active ? 'ml-1.5 truncate' : 'sr-only'}>{tab.label}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-label="Search"
        title="Search"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]"
        onClick={() => undefined}
      >
        <Search size={18} />
      </button>
    </div>
  );
};
