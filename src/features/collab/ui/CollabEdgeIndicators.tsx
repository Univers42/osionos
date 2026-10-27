/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CollabEdgeIndicators.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Pills at the top and bottom edge of the editor for collaborators whose caret is
 * out of view: scrolled past, or in a block the virtualizer has not mounted. One
 * click scrolls to them (keyboard: Tab, then Enter), a second small button follows
 * them. The pills are the only part of the overlay that takes pointer events, and
 * they never take FOCUS from the editor: pressing one keeps the caret where it is.
 */

import React, { useRef } from 'react';
import { ArrowDown, ArrowUp, Eye } from 'lucide-react';

import { jumpToActor, useFollowStore } from '../model/followStore';
import { limitWithOverflow } from '../model/presenceGeometry';
import type { Person, PresenceFrame } from '../model/presenceFrame';

const MAX_PILLS = 3;
const BUTTON = 'relative inline-flex h-8 cursor-pointer items-center gap-1.5 text-xs font-medium text-[var(--osio-fg-default)] before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[""] hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)] motion-safe:transition-colors';

function Pill({ person, side }: { person: Person; side: 'above' | 'below' }): React.ReactElement {
  // Where focus was before the keyboard reached the pill, so a keyboard jump can
  // hand it back: the pill unmounts once the caret is in view.
  const origin = useRef<HTMLElement | null>(null);
  const Arrow = side === 'above' ? ArrowUp : ArrowDown;

  return (
    <div
      role="group"
      aria-label={person.name}
      className="pointer-events-auto flex items-stretch rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-elevated)] shadow-[var(--osio-shadow-menu)] motion-safe:animate-[collab-flag-in_150ms_ease-out]"
    >
      <button
        type="button"
        aria-label={`Jump to ${person.name}'s cursor (${side})`}
        // A mouse press must not move focus out of the editor.
        onMouseDown={(event) => event.preventDefault()}
        onFocus={(event) => { origin.current = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null; }}
        onClick={(event) => {
          useFollowStore.getState().stop();
          jumpToActor(person.actor);
          if (event.detail === 0) origin.current?.focus({ preventScroll: true });
        }}
        className={`${BUTTON} rounded-l-full pl-2.5 pr-2`}
      >
        <Arrow size={14} aria-hidden />
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: person.color }} />
        <span className="max-w-[8rem] truncate">{person.name}</span>
      </button>
      <button
        type="button"
        aria-label={`Follow ${person.name}`}
        title={`Follow ${person.name}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => useFollowStore.getState().follow(person.actor)}
        className={`${BUTTON} w-8 justify-center rounded-r-full border-l border-[var(--osio-border-default)]`}
      >
        <Eye size={14} aria-hidden />
      </button>
    </div>
  );
}

function Edge({ people, side }: { people: Person[]; side: 'above' | 'below' }): React.ReactElement | null {
  const { shown, overflow } = limitWithOverflow(people, MAX_PILLS);
  if (shown.length === 0) return null;
  const place = side === 'above' ? 'top-2' : 'bottom-2';
  return (
    <div className={`absolute inset-x-3 flex flex-wrap items-center justify-center gap-1.5 ${place}`}>
      {shown.map((person) => <Pill key={person.actor} person={person} side={side} />)}
      {overflow > 0 && (
        <span
          role="img"
          aria-label={`${overflow} more ${overflow === 1 ? 'collaborator' : 'collaborators'} ${side}`}
          title={people.slice(MAX_PILLS).map((person) => person.name).join(', ')}
          className="grid h-8 min-w-8 place-items-center rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-elevated)] px-2 text-xs font-medium text-[var(--osio-fg-default)]"
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}

export const CollabEdgeIndicators: React.FC<{ frame: PresenceFrame }> = ({ frame }) => {
  const { viewport, above, below } = frame;
  if (above.length === 0 && below.length === 0) return null;
  return (
    <div
      className="fixed"
      style={{ left: viewport.left, top: viewport.top, width: viewport.width, height: viewport.height }}
    >
      <Edge people={above} side="above" />
      <Edge people={below} side="below" />
    </div>
  );
};
