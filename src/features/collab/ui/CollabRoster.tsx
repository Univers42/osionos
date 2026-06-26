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

function Avatar({ member, onSummon }: { member: PresenceState; onSummon?: CollabRosterProps['onSummon'] }): React.ReactElement {
  const face = member.avatarRef
    ? <img src={member.avatarRef} alt="" className="h-full w-full object-cover" />
    : memberInitials(member.displayName);
  const ring = { ...RING, outline: `2px solid ${member.color}` };
  const cls = '-ml-1.5 flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-[var(--osio-bg-elevated)] bg-[var(--osio-bg-subtle)] text-[11px] font-medium text-[var(--osio-fg-muted)] first:ml-0';
  if (!onSummon) {
    return <span title={member.displayName} aria-label={`${member.displayName} is here`} style={ring} className={cls}>{face}</span>;
  }
  return (
    <button
      type="button"
      title={`Summon ${member.displayName} here`}
      aria-label={`Summon ${member.displayName} to this page`}
      onClick={() => onSummon(member.memberId, member.displayName)}
      style={ring}
      className={`${cls} transition-transform duration-150 hover:z-10 motion-safe:hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--osio-bg-elevated)]`}
    >
      {face}
    </button>
  );
}

export const CollabRoster: React.FC<CollabRosterProps> = ({ onSummon }) => {
  const members = useCollabStore((state) => state.members);
  const status = useCollabStore((state) => state.status);
  if (status !== 'live' || members.length === 0) return null;

  const { shown, overflow } = splitRoster(members);
  const names = members.map((member) => member.displayName).join(', ');

  return (
    <div
      className="flex items-center"
      role="group"
      aria-label={`${members.length} other ${members.length === 1 ? 'person' : 'people'} here: ${names}`}
    >
      {shown.map((member) => <Avatar key={member.memberId} member={member} onSummon={onSummon} />)}
      {overflow > 0 && (
        <span
          title={names}
          className="-ml-1.5 flex h-7 min-w-7 items-center justify-center rounded-full border border-[var(--osio-bg-elevated)] bg-[var(--osio-bg-muted)] px-1 text-[11px] font-semibold text-[var(--osio-fg-muted)]"
        >
          +{overflow}
        </span>
      )}
    </div>
  );
};
