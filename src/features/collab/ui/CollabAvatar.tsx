/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CollabAvatar.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * One roster avatar: the member's face ringed in their colour, a status dot, a
 * typing badge while they edit, and a second ring while the editor follows them.
 * It is a button that opens the member's menu (ui/CollabRosterMenu.tsx).
 *
 * Status is shape first, colour second: a FILLED dot and a solid ring mean the
 * member is on this page; a HOLLOW dot, a dashed ring and a dimmed photo mean they
 * are elsewhere in the space. Only the photo is dimmed, never the button: opacity on
 * the whole avatar pushed the initials (text, 4.5:1) and the ring (graphic, 3:1)
 * under WCAG AA, and the button is still active, so no exemption applied. The
 * accessible name says the same in words, with "typing" and "followed" when they
 * apply. The hit area (the pseudo-element) measures 38 x 40 px, not the 44 px tall it
 * is drawn: upward it stops at the window's top edge, and downward the page column
 * below the bar (painted later, overflow-hidden) takes the taps beyond the bar's
 * 40 px. It is only 38 px wide because wider would cross half the roster's 10 px gap
 * and let the neighbouring avatar take the tap. It meets WCAG 2.5.8 (24 px minimum),
 * not the 44 px AAA target.
 *
 * On keyboard focus the identity ring is replaced by the accent focus ring, 2 px
 * further out (collab.css). The ring is a utility on purpose: an inline outline would
 * beat that rule, and a Tailwind ring never paints, because global.css's unlayered
 * :focus-visible box-shadow overrides it. The status dot keeps the member's colour.
 */

import React from 'react';

import { memberInitials } from '../model/collabPresence';
import type { PresenceState } from '../model/realtimeTransport.port';

interface CollabAvatarProps {
  member: PresenceState;
  onPage: boolean;
  typing: boolean;
  followed: boolean;
  open: boolean;
  onToggle: (memberId: string, trigger: HTMLButtonElement) => void;
  onOpen: (memberId: string, trigger: HTMLButtonElement) => void;
}

function StatusDot({ color, filled }: { color: string; filled: boolean }): React.ReactElement {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-solid"
      style={filled
        ? { background: color, borderColor: 'var(--osio-bg-elevated)' }
        : { background: 'var(--osio-bg-elevated)', borderColor: color }}
    />
  );
}

function TypingBadge({ color }: { color: string }): React.ReactElement {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -right-2 -top-1.5 flex items-center gap-[2px] rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-elevated)] px-1 py-[3px]"
    >
      {[0, 1, 2].map((dot) => (
        <span key={dot} className="collab-typing-dot h-[3px] w-[3px] rounded-full" style={{ background: color }} />
      ))}
    </span>
  );
}

export const CollabAvatar: React.FC<CollabAvatarProps> = ({ member, onPage, typing, followed, open, onToggle, onOpen }) => {
  const where = onPage ? 'is on this page' : 'is in this space';
  const label = `${member.displayName} ${where}${typing ? ', typing' : ''}${followed ? ', followed' : ''}`;
  return (
    <span className={`relative inline-flex h-7 w-7 shrink-0 ${followed ? 'z-10' : ''}`}>
      {followed && (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-[6px] rounded-full border-2 border-solid"
          style={{ borderColor: member.color }}
        />
      )}
      <button
        type="button"
        title={`${member.displayName} ${where}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => onToggle(member.memberId, event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          onOpen(member.memberId, event.currentTarget);
        }}
        style={{ '--collab-member': member.color } as React.CSSProperties}
        className={`relative flex h-7 w-7 cursor-pointer items-center justify-center collab-avatar rounded-full before:absolute before:-inset-y-2 before:-inset-x-[5px] before:content-[''] transition-transform duration-(--osio-dur-fast) hover:z-10 motion-safe:hover:scale-110 active:scale-95 outline-offset-1 [outline-width:2px] [outline-color:var(--collab-member)] ${onPage ? '[outline-style:solid]' : '[outline-style:dashed]'}`}
      >
        <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-[var(--osio-bg-elevated)] bg-[var(--osio-bg-subtle)] text-2xs font-medium text-[var(--osio-fg-muted)]">
          {member.avatarRef
            ? <img src={member.avatarRef} alt="" className={`h-full w-full object-cover ${onPage ? '' : 'opacity-55'}`} />
            : memberInitials(member.displayName)}
        </span>
      </button>
      <StatusDot color={member.color} filled={onPage} />
      {typing && <TypingBadge color={member.color} />}
    </span>
  );
};
