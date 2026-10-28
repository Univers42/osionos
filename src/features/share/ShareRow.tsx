/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ShareRow.tsx                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/15 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';
import { Ban, Globe, Shield, Users, X } from 'lucide-react';
import { ShareLevelSelect, SHARE_LEVEL_LABELS } from './ShareLevelSelect';
import type { ShareEntry, ShareLevel } from './types';

interface ShareRowProps {
  entry: ShareEntry;
  levels?: readonly ShareLevel[];
  busy?: boolean;
  onLevel: (level: ShareLevel) => void;
  onRemove: () => void;
}

function rowIdentity(entry: ShareEntry): { title: string; subtitle: string; icon: React.ReactNode } {
  if (entry.target.type === 'user') {
    const { person } = entry.target;
    return { title: person.name, subtitle: person.email || person.role, icon: initialsBadge(person.name) };
  }
  if (entry.target.type === 'role') {
    return { title: entry.target.role, subtitle: 'Role', icon: <Shield size={14} /> };
  }
  if (entry.target.type === 'team') {
    const { team } = entry.target;
    return { title: team.name, subtitle: `Team · ${team.memberCount} ${team.memberCount === 1 ? 'member' : 'members'}`, icon: <Users size={14} /> };
  }
  if (entry.target.type === 'attribute') {
    return { title: `Members with ${entry.target.name} = ${entry.target.value}`, subtitle: 'Attribute', icon: <Users size={14} /> };
  }
  if (entry.target.type === 'public') {
    return { title: 'Anyone with the link', subtitle: 'Public', icon: <Globe size={14} /> };
  }
  return { title: 'Everyone in the workspace', subtitle: 'Workspace', icon: <Users size={14} /> };
}

function initialsBadge(name: string): React.ReactNode {
  const initials = name.split(/\s+/).map((part) => part[0] ?? '').join('').slice(0, 2).toUpperCase();
  return <span className="text-3xs font-semibold">{initials || '?'}</span>;
}

/** One person/role/general-access row: identity + level dropdown + remove. */
export const ShareRow: React.FC<ShareRowProps> = ({ entry, levels, busy = false, onLevel, onRemove }) => {
  const identity = rowIdentity(entry);
  return (
    <div className="flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors duration-(--osio-dur-fast) hover:bg-[var(--osio-bg-hover)]">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] text-[var(--osio-fg-muted)]">
        {identity.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[var(--osio-fg-default)]">{identity.title}</div>
        <div className="truncate text-xs text-[var(--osio-fg-muted)]">{identity.subtitle}</div>
      </div>
      <ShareLevelSelect value={entry.level} levels={levels} disabled={busy} onChange={onLevel} />
      <button
        type="button"
        aria-label={`Remove access for ${identity.title}`}
        className="rounded-md p-1 text-[var(--osio-fg-muted)] transition-colors duration-(--osio-dur-fast) hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-danger)] disabled:cursor-not-allowed disabled:opacity-60"
        onClick={onRemove}
        disabled={busy}
      >
        <X size={14} />
      </button>
    </div>
  );
};

/** The ancestor page a rule is set on: a button, because that page is where it is edited.
 *  It is only a button while the page is in the store — a title the reader cannot open is
 *  plain text, never a dead control. */
const SourceLabel: React.FC<{ title: string; onOpen?: () => void; muted?: boolean }> = ({ title, onOpen, muted = false }) => {
  const tone = muted ? 'text-[var(--osio-fg-muted)]' : 'text-[var(--osio-fg-default)]';
  if (!onOpen) return <span className={`font-medium ${tone}`}>{title}</span>;
  return (
    <button
      type="button"
      aria-label={`Open ${title}`}
      className={`inline-flex min-h-11 items-center rounded-xs px-0.5 font-medium underline underline-offset-2 transition-colors duration-(--osio-dur-fast) hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--osio-accent)] pointer-coarse:px-2 ${tone}`}
      onClick={onOpen}
    >
      {title}
    </button>
  );
};

interface InheritedRowProps {
  entry: ShareEntry;
  fromTitle: string;
  /** Structural: false = the rule cannot affect this page (shown, never hidden). */
  reaches: boolean;
  denied?: boolean;
  /** Present only when the source page is in the store (it is readable by construction). */
  onOpenSource?: () => void;
}

/** One inherited access row: read-only, since the rule lives on the parent page that
 *  carries it — no level select, no remove. Same scaffold as ShareRow so the list keeps
 *  one layout, plus the source line that says where the rule comes from. */
export const InheritedRow: React.FC<InheritedRowProps> = ({ entry, fromTitle, reaches, denied = false, onOpenSource }) => {
  const identity = rowIdentity(entry);
  const muted = !reaches;
  return (
    <div className={`flex min-h-17 items-start gap-3 rounded-md px-2 py-1.5 ${muted ? 'text-[var(--osio-fg-muted)]' : ''}`}>
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] text-[var(--osio-fg-muted)]">
        {identity.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-medium [overflow-wrap:anywhere] ${muted ? 'text-[var(--osio-fg-muted)]' : 'text-[var(--osio-fg-default)]'}`}>{identity.title}</div>
        <div className="text-xs text-[var(--osio-fg-muted)] [overflow-wrap:anywhere]">{identity.subtitle}</div>
        {muted
          ? (
            // Text, not colour alone: the row says why the parent's rule does nothing here.
            <p className="text-xs text-[var(--osio-fg-muted)] [overflow-wrap:anywhere]">
              Does not apply here — <SourceLabel title={fromTitle} onOpen={onOpenSource} muted /> is not this page&apos;s owner&apos;s private parent.
            </p>
          )
          : denied
            ? (
              // Icon AND text, never colour alone: this row says the rule above every grant here.
              <p className="flex items-start gap-1 text-xs text-[var(--osio-danger)]">
                <Ban size={12} aria-hidden="true" className="mt-0.5 shrink-0" />
                <span className="[overflow-wrap:anywhere]">
                  No access — set on <SourceLabel title={fromTitle} onOpen={onOpenSource} />; it overrides access granted here.
                </span>
              </p>
            )
            : (
              <p className="text-xs text-[var(--osio-fg-muted)] [overflow-wrap:anywhere]">
                from <SourceLabel title={fromTitle} onOpen={onOpenSource} /> — can affect this page.
              </p>
            )}
      </div>
      <span className={`mt-0.5 shrink-0 text-xs ${muted || !denied ? 'text-[var(--osio-fg-muted)]' : 'text-[var(--osio-danger)]'}`}>{SHARE_LEVEL_LABELS[entry.level]}</span>
    </div>
  );
};
