/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DockContactRow.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** One conversation/contact row: avatar + presence dot + unread Badge. */

import React from 'react';

import { Badge } from '@/shared/ui';

interface DockContactRowProps {
  name: string;
  avatar?: string | null;
  online?: boolean;
  unread?: number;
  onOpen: () => void;
}

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || '?';
}

export const DockContactRow: React.FC<DockContactRowProps> = ({
  name,
  avatar,
  online,
  unread = 0,
  onOpen,
}) => (
  <button
    type="button"
    onClick={onOpen}
    aria-label={`Open conversation with ${name}`}
    className="flex w-full min-h-11 items-center gap-[var(--osio-space-3)] rounded-md px-[var(--osio-space-2)] py-[var(--osio-space-2)] text-left transition-colors duration-150 ease-out hover:bg-[var(--osio-bg-hover)]"
  >
    <span className="relative shrink-0">
      <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[var(--osio-bg-subtle)] text-xs font-medium text-[var(--osio-fg-muted)]">
        {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : initials(name)}
      </span>
      <span
        aria-hidden="true"
        className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--osio-bg-elevated)] ${
          online ? 'bg-[var(--osio-success)]' : 'bg-[var(--osio-fg-subtle)]'
        }`}
      />
    </span>
    <span className="min-w-0 flex-1 truncate text-sm text-[var(--osio-fg-default)]">{name}</span>
    {unread > 0 && (
      <Badge tone="accent" className="ml-auto">
        {unread > 99 ? '99+' : unread}
      </Badge>
    )}
  </button>
);
