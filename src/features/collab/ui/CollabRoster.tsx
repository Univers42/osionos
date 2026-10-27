/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CollabRoster.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 16:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 16:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The Shared-space roster (AOC §6): a compact stack of who else is present,
 * each avatar ringed in that member's identity color. Purely presentational —
 * it reads the collab store and renders; it never touches the transport. Names
 * convey identity alongside color (R-A8: never color alone). Overflow collapses
 * to "+N". Tokens only; no animation on the idle path.
 */

import React from 'react';

import { useCollabStore } from '../store/useCollabStore';
import { memberInitials, splitRoster } from '../model/collabPresence';
import type { PresenceState } from '../model/realtimeTransport.port';

const RING: React.CSSProperties = { outlineOffset: '1px' };

interface CollabRosterProps {
  /** Summon a member to the current page (AOC §7). Avatars are buttons when set. */
  onSummon?: (memberId: string, name: string) => void;
}

function Avatar({ member, onSummon, onPage }: { member: PresenceState; onSummon?: CollabRosterProps['onSummon']; onPage: boolean }): React.ReactElement {
  const face = member.avatarRef
    ? <img src={member.avatarRef} alt="" className="h-full w-full object-cover" />
    : memberInitials(member.displayName);
  const ring = { ...RING, outline: `2px solid ${member.color}` };
  const cls = '-ml-1.5 flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-[var(--osio-bg-elevated)] bg-[var(--osio-bg-subtle)] text-2xs font-medium text-[var(--osio-fg-muted)] first:ml-0';
  // Presence is split: the page channel says who is on THIS page; everyone else
  // in the workspace roster is "in this space" (C501), never a leaky route.
  const where = onPage ? 'is on this page' : 'is in this space';
  if (!onSummon) {
    return <span title={`${member.displayName} ${where}`} aria-label={`${member.displayName} ${where}`} style={ring} className={cls}>{face}</span>;
  }
  return (
    <button
      type="button"
      title={`Summon ${member.displayName} here`}
      aria-label={`Summon ${member.displayName} to this page`}
      onClick={() => onSummon(member.memberId, member.displayName)}
      style={ring}
      className={`${cls} transition-transform duration-(--osio-dur-fast) hover:z-10 motion-safe:hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--osio-bg-elevated)]`}
    >
      {face}
    </button>
  );
}

export const CollabRoster: React.FC<CollabRosterProps> = ({ onSummon }) => {
  const members = useCollabStore((state) => state.members);
  const pageMembers = useCollabStore((state) => state.pageMembers);
  const status = useCollabStore((state) => state.status);
  if (status !== 'live' || members.length === 0) return null;

  const onPage = new Set(pageMembers.map((member) => member.memberId));
  const { shown, overflow } = splitRoster(members);
  const names = members.map((member) => `${member.displayName} ${onPage.has(member.memberId) ? 'here' : 'in this space'}`).join(', ');

  return (
    <div
      className="flex items-center"
      role="group"
      aria-label={`${members.length} other ${members.length === 1 ? 'person' : 'people'} in this space: ${names}`}
    >
      {shown.map((member) => (
        <Avatar key={member.memberId} member={member} onSummon={onSummon} onPage={onPage.has(member.memberId)} />
      ))}
      {overflow > 0 && (
        <span
          title={names}
          className="-ml-1.5 flex h-7 min-w-7 items-center justify-center rounded-full border border-[var(--osio-bg-elevated)] bg-[var(--osio-bg-muted)] px-1 text-2xs font-semibold text-[var(--osio-fg-muted)]"
        >
          +{overflow}
        </span>
      )}
    </div>
  );
};
