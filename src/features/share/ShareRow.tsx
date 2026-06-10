/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ShareRow.tsx                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';
import { Globe, Shield, Users, X } from 'lucide-react';
import { ShareLevelSelect } from './ShareLevelSelect';
import type { ShareEntry, ShareLevel } from './types';

interface ShareRowProps {
  entry: ShareEntry;
  busy?: boolean;
  onLevel: (level: ShareLevel) => void;
  onRemove: () => void;
}

function rowIdentity(entry: ShareEntry): { title: string; subtitle: string; icon: React.ReactNode } {
  if (entry.target.type === 'user') {
    const { person } = entry.target;
    return { title: person.name, subtitle: person.email, icon: initialsBadge(person.name) };
  }
  if (entry.target.type === 'role') {
    return { title: entry.target.role, subtitle: 'Role', icon: <Shield size={14} /> };
  }
  if (entry.target.type === 'public') {
    return { title: 'Anyone with the link', subtitle: 'Public', icon: <Globe size={14} /> };
  }
  return { title: 'Everyone in the workspace', subtitle: 'Workspace', icon: <Users size={14} /> };
}

function initialsBadge(name: string): React.ReactNode {
  const initials = name.split(/\s+/).map((part) => part[0] ?? '').join('').slice(0, 2).toUpperCase();
  return <span className="text-[10px] font-semibold">{initials || '?'}</span>;
}

/** One person/role/general-access row: identity + level dropdown + remove. */
export const ShareRow: React.FC<ShareRowProps> = ({ entry, busy = false, onLevel, onRemove }) => {
  const identity = rowIdentity(entry);
  return (
    <div className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-[var(--osio-bg-hover)]">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] text-[var(--osio-fg-muted)]">
        {identity.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[var(--osio-fg-default)]">{identity.title}</div>
        <div className="truncate text-xs text-[var(--osio-fg-muted)]">{identity.subtitle}</div>
      </div>
      <ShareLevelSelect value={entry.level} disabled={busy} onChange={onLevel} />
      <button
        type="button"
        aria-label={`Remove access for ${identity.title}`}
        className="rounded p-1 text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-danger)]"
        onClick={onRemove}
        disabled={busy}
      >
        <X size={14} />
      </button>
    </div>
  );
};
