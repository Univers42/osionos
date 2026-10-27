/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CollabRoster.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 16:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The Shared-space roster (AOC §6): a compact row of who else is present. Each
 * avatar is a button that opens that member's menu (CollabRosterMenu): jump to
 * their cursor, follow them, or summon them to this page. Purely presentational:
 * it reads the collab, follow and remote-edit stores and renders; it never
 * touches the transport. Names convey identity alongside colour (R-A8: never
 * colour alone). Overflow collapses to "+N". Tokens only.
 *
 * Caveat: the "+N" overflow chip is not a menu, so a member past the visible
 * limit (ROSTER_VISIBLE_LIMIT) can be summoned, jumped to or followed only once
 * they sort into the visible set.
 */

import React, { useCallback, useReducer, useState } from 'react';

import { useCollabStore } from '../store/useCollabStore';
import { splitRoster } from '../model/collabPresence';
import { memberIdOf } from '../model/collabActor';
import { useFollowStore } from '../model/followStore';
import { MENU_CLOSED, menuReducer } from '../model/rosterMenu';
import { CollabAvatar } from './CollabAvatar';
import { CollabRosterMenu } from './CollabRosterMenu';
import { useTypingMembers } from './useTypingMembers';

interface CollabRosterProps {
  /** Summon a member to the current page (AOC §7). Shown in each member's menu when set. */
  onSummon?: (memberId: string, name: string) => void;
}

export const CollabRoster: React.FC<CollabRosterProps> = ({ onSummon }) => {
  const members = useCollabStore((state) => state.members);
  const pageMembers = useCollabStore((state) => state.pageMembers);
  const status = useCollabStore((state) => state.status);
  const followedMemberId = useFollowStore((state) => (state.following === null ? null : memberIdOf(state.following)));
  const typing = useTypingMembers();
  const [menu, dispatch] = useReducer(menuReducer, MENU_CLOSED);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);

  // The avatar that opened the menu; focus goes back to it, unless the menu closed
  // because the person clicked or tabbed somewhere else on purpose.
  const close = useCallback((restoreFocus: boolean) => {
    dispatch({ type: 'close' });
    if (restoreFocus) anchor?.focus();
    setAnchor(null);
  }, [anchor]);

  const open = menu.openFor !== null && status === 'live' ? members.find((member) => member.memberId === menu.openFor) : undefined;
  // Derived-state reset, in render and not an effect: the member left (or the
  // channel dropped) while their menu was open, so the menu must not wait for a
  // re-render to close or it would reopen on their return.
  if (menu.openFor !== null && !open) { dispatch({ type: 'close' }); setAnchor(null); }

  if (status !== 'live' || members.length === 0) return null;

  const onPage = new Set(pageMembers.map((member) => member.memberId));
  const { shown, overflow } = splitRoster(members);
  const names = members.map((member) => `${member.displayName} ${onPage.has(member.memberId) ? 'here' : 'in this space'}`).join(', ');

  return (
    <div
      className="flex items-center gap-2.5"
      role="group"
      aria-label={`${members.length} other ${members.length === 1 ? 'person' : 'people'} in this space: ${names}`}
    >
      {shown.map((member) => (
        <CollabAvatar
          key={member.memberId}
          member={member}
          onPage={onPage.has(member.memberId)}
          typing={typing.has(member.memberId)}
          followed={followedMemberId === member.memberId}
          open={menu.openFor === member.memberId}
          onToggle={(memberId, trigger) => { setAnchor(trigger); dispatch({ type: 'toggle', memberId }); }}
          onOpen={(memberId, trigger) => { setAnchor(trigger); dispatch({ type: 'open', memberId }); }}
        />
      ))}
      {overflow > 0 && (
        <span
          title={names}
          className="flex h-7 min-w-7 items-center justify-center rounded-full border border-[var(--osio-bg-elevated)] bg-[var(--osio-bg-muted)] px-1 text-2xs font-semibold text-[var(--osio-fg-muted)]"
        >
          +{overflow}
        </span>
      )}
      {open && anchor && (
        <CollabRosterMenu
          member={open}
          onPage={onPage.has(open.memberId)}
          anchor={anchor}
          active={menu.active}
          dispatch={dispatch}
          onClose={close}
          onSummon={onSummon}
        />
      )}
    </div>
  );
};
