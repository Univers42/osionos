/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CollabRosterMenu.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The menu a roster avatar opens: Jump to cursor, Follow / Stop following and
 * Summon here. The decisions (what is offered, what is disabled and why, where
 * the arrow keys land) are model/rosterMenu.ts; this draws them and runs the
 * chosen action.
 *
 * It is portaled to <body> above the follow layer, so it escapes the 40 px top
 * bar. Escape is stopped here: the follow hook ends follow on a window Escape,
 * and closing a menu must not also end a follow. A disabled item stays focusable
 * and says why in text (aria-describedby), because a greyed-out row with no
 * reason teaches nothing. Scrolling does not close it (follow mode scrolls the
 * page constantly); resizing does, since the anchor has moved.
 */

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff, LocateFixed, Megaphone, type LucideIcon } from 'lucide-react';

import { useCollabStore } from '../store/useCollabStore';
import { memberIdOf } from '../model/collabActor';
import { jumpToActor, useFollowStore } from '../model/followStore';
import type { PresenceState } from '../model/realtimeTransport.port';
import {
  MENU_WIDTH, pickCaretActor, placeMenu, rosterMenuItems,
  type MenuAction, type RosterMenuItem, type RosterMenuItemId,
} from '../model/rosterMenu';

interface CollabRosterMenuProps {
  member: PresenceState;
  onPage: boolean;
  anchor: HTMLElement;
  active: number;
  dispatch: React.Dispatch<MenuAction>;
  /** `restoreFocus` returns focus to the avatar (Escape, a chosen action). */
  onClose: (restoreFocus: boolean) => void;
  onSummon?: (memberId: string, name: string) => void;
}

const ICONS: Record<RosterMenuItemId, LucideIcon> = {
  jump: LocateFixed,
  follow: Eye,
  unfollow: EyeOff,
  summon: Megaphone,
};

export const CollabRosterMenu: React.FC<CollabRosterMenuProps> = ({ member, onPage, anchor, active, dispatch, onClose, onSummon }) => {
  // Selecting the actor (a string) keeps this from re-rendering on every caret move.
  const caretActor = useCollabStore((state) => pickCaretActor(state.cursors, member.memberId));
  const followed = useFollowStore((state) => state.following !== null && memberIdOf(state.following) === member.memberId);
  const items = rosterMenuItems({ onPage, caretActor, followed, canSummon: !!onSummon });
  const menuRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const rect = anchor.getBoundingClientRect();
  const { left, top } = placeMenu(rect, window.innerWidth);

  useEffect(() => {
    menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')[active]?.focus();
  }, [active]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !anchor.contains(target)) onClose(false);
    };
    const onResize = (): void => onClose(false);
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', onResize);
    };
  }, [anchor, onClose]);

  const run = (item: RosterMenuItem): void => {
    if (!item.enabled) return;
    if (item.id === 'jump' && caretActor) jumpToActor(caretActor);
    else if (item.id === 'follow' && caretActor) useFollowStore.getState().follow(caretActor);
    else if (item.id === 'unfollow') useFollowStore.getState().stop();
    else if (item.id === 'summon') onSummon?.(member.memberId, member.displayName);
    onClose(true);
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    const count = items.length;
    switch (event.key) {
      case 'ArrowDown': dispatch({ type: 'move', delta: 1, count }); break;
      case 'ArrowUp': dispatch({ type: 'move', delta: -1, count }); break;
      case 'Home': dispatch({ type: 'set', index: 0 }); break;
      case 'End': dispatch({ type: 'set', index: count - 1 }); break;
      case 'Escape': event.stopPropagation(); onClose(true); break;
      case 'Tab': onClose(false); return;
      default: return;
    }
    event.preventDefault();
  };

  return createPortal(
    <div
      ref={panelRef}
      className="fixed rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-elevated)] p-1 shadow-[var(--osio-shadow-menu)] motion-safe:animate-[collab-flag-in_150ms_ease-out]"
      style={{ left, top, width: MENU_WIDTH, zIndex: 'var(--osio-z-modal)' }}
      onKeyDown={onKeyDown}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-solid" style={onPage
          ? { background: member.color, borderColor: member.color }
          : { borderColor: member.color }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-[var(--osio-fg-default)]">{member.displayName}</span>
          <span className="block text-xs text-[var(--osio-fg-muted)]">{onPage ? 'On this page' : 'In this space'}</span>
        </span>
      </div>
      <div ref={menuRef} role="menu" aria-label={`${member.displayName} actions`}>
        {items.map((item, index) => {
          const Icon = ICONS[item.id];
          const reasonId = `roster-menu-${item.id}-reason`;
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              tabIndex={index === active ? 0 : -1}
              aria-disabled={!item.enabled || undefined}
              aria-describedby={item.reason ? reasonId : undefined}
              aria-label={item.id === 'summon' ? `Summon ${member.displayName} to this page` : undefined}
              title={item.id === 'summon' ? `Summon ${member.displayName} here` : undefined}
              onClick={() => run(item)}
              onMouseEnter={() => dispatch({ type: 'set', index })}
              className={`flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)] ${item.enabled
                ? 'cursor-pointer text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]'
                : 'cursor-not-allowed text-[var(--osio-fg-muted)]'}`}
            >
              <Icon size={16} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{item.label}</span>
                {item.reason && <span id={reasonId} className="block text-xs text-[var(--osio-fg-muted)]">{item.reason}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
};
