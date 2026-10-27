/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   rosterMenu.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The decisions behind the roster's avatar menu, with no DOM: which actions a
 * member offers and why one is unavailable, which of a member's tabs to point
 * Jump and Follow at, how the open/active state moves under the keyboard, and
 * where the popover sits. The menu component (ui/CollabRosterMenu.tsx) only draws
 * what these return.
 *
 * Caveat: a member with two tabs open on the page is reduced to the tab whose
 * caret moved last, so Jump and Follow can land on the other tab's caret after
 * they switch tabs, until that caret moves too.
 */

import { memberIdOf } from './collabActor';
import type { RemoteCursor } from './remoteCursors';

export type RosterMenuItemId = 'jump' | 'follow' | 'unfollow' | 'summon';

export interface RosterMenuItem {
  id: RosterMenuItemId;
  label: string;
  enabled: boolean;
  /** Shown under the label while the item is disabled; null when enabled. */
  reason: string | null;
}

export interface RosterMenuInput {
  onPage: boolean;
  /** Actor of the member's tab with a caret on this page, or null. */
  caretActor: string | null;
  /** True while the local editor follows this member. */
  followed: boolean;
  canSummon: boolean;
}

const NOT_HERE = 'Not on this page';
const NO_CURSOR = 'No cursor on this page yet';

/** The member's tab to jump to or follow: the one whose caret moved last. */
export function pickCaretActor(cursors: ReadonlyMap<string, RemoteCursor>, memberId: string): string | null {
  let best: RemoteCursor | null = null;
  for (const cursor of cursors.values()) {
    if (cursor.caret && memberIdOf(cursor.actor) === memberId && (best === null || cursor.movedAt > best.movedAt)) best = cursor;
  }
  return best === null ? null : best.actor;
}

export function rosterMenuItems({ onPage, caretActor, followed, canSummon }: RosterMenuInput): RosterMenuItem[] {
  const reason = onPage ? (caretActor ? null : NO_CURSOR) : NOT_HERE;
  const reachable = reason === null;
  const items: RosterMenuItem[] = [
    { id: 'jump', label: 'Jump to cursor', enabled: reachable, reason },
    followed
      // Stopping is always allowed: the member may have left the page since.
      ? { id: 'unfollow', label: 'Stop following', enabled: true, reason: null }
      : { id: 'follow', label: 'Follow', enabled: reachable, reason },
  ];
  if (canSummon) items.push({ id: 'summon', label: 'Summon here', enabled: true, reason: null });
  return items;
}

export interface MenuState {
  openFor: string | null;
  active: number;
}

export type MenuAction =
  | { type: 'toggle'; memberId: string }
  | { type: 'open'; memberId: string }
  | { type: 'close' }
  | { type: 'move'; delta: 1 | -1; count: number }
  | { type: 'set'; index: number };

export const MENU_CLOSED: MenuState = { openFor: null, active: 0 };

/** Returns the SAME state when nothing changes, so React skips the render. */
export function menuReducer(state: MenuState, action: MenuAction): MenuState {
  switch (action.type) {
    case 'toggle':
      return state.openFor === action.memberId ? MENU_CLOSED : { openFor: action.memberId, active: 0 };
    case 'open':
      return state.openFor === action.memberId ? state : { openFor: action.memberId, active: 0 };
    case 'close':
      return state.openFor === null ? state : MENU_CLOSED;
    case 'move':
      if (state.openFor === null || action.count <= 0) return state;
      return { ...state, active: (state.active + action.delta + action.count) % action.count };
    case 'set':
      return state.openFor === null || state.active === action.index ? state : { ...state, active: action.index };
  }
}

export const MENU_WIDTH = 240;

/** Viewport position for the popover: centred under the avatar, kept `margin` px
 *  inside the viewport. Always opens downwards: the roster lives in the top bar. */
export function placeMenu(
  anchor: { left: number; right: number; bottom: number },
  viewportWidth: number,
  width = MENU_WIDTH,
  gap = 6,
  margin = 8,
): { left: number; top: number } {
  const centred = (anchor.left + anchor.right) / 2 - width / 2;
  const left = Math.max(margin, Math.min(centred, viewportWidth - width - margin));
  return { left, top: anchor.bottom + gap };
}
