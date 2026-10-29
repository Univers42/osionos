/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CollabPresenceGutter.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Who is working where: a thin member-colour bar in the left margin of every block
 * that holds a remote caret or selection, with initials chips at its top. It
 * answers "which parts of this page are being edited" at a glance, without
 * reading carets. Identity is the chip's initials plus the person's name in its
 * label, never the colour alone. Pure drawing from measured GutterBars, inside the
 * pointer-events:none overlay.
 */

import React from 'react';

import { limitWithOverflow } from '../model/presenceGeometry';
import type { GutterBar, Person } from '../model/presenceFrame';

const BAR_WIDTH = 3;
/** Distance from a block's left edge to the nearest bar. */
const BAR_OFFSET = 14;
/** Gap between side-by-side bars when several people share a block. */
const BAR_PITCH = 5;
const CHIP = 18;
/** How much each chip overlaps the one above it. */
const CHIP_OVERLAP = 6;
const MAX_BARS = 3;
/** Keep the chips this far inside the viewport while a tall block scrolls past. */
const VIEW_PAD = 4;

function chipStackHeight(count: number): number {
  return CHIP + (count - 1) * (CHIP - CHIP_OVERLAP);
}

function Chip({ person, top }: { person: Person; top: number }): React.ReactElement {
  return (
    <span
      role="img"
      aria-label={`${person.name} is editing here`}
      title={person.name}
      className="absolute grid place-items-center rounded-full text-3xs font-semibold leading-none ring-2 ring-[var(--osio-bg-page)]"
      style={{ top, left: (BAR_WIDTH - CHIP) / 2, width: CHIP, height: CHIP, background: person.color, color: person.ink }}
    >
      {person.initials}
    </span>
  );
}

function Bar({ bar, viewportTop }: { bar: GutterBar; viewportTop: number }): React.ReactElement {
  const { shown, overflow } = limitWithOverflow(bar.people, MAX_BARS);
  const chips = shown.length + (overflow > 0 ? 1 : 0);
  const stack = chipStackHeight(chips);
  // A block taller than the screen would carry its chips off the top; slide them
  // down the bar so they stay readable while any of the block is in view.
  const slack = Math.max(0, bar.height - stack);
  const chipTop = Math.min(slack, Math.max(0, viewportTop + VIEW_PAD - bar.top));
  const step = CHIP - CHIP_OVERLAP;
  return (
    <div
      className="collab-glide fixed left-0 top-0"
      style={{ transform: `translate3d(${bar.left - BAR_OFFSET}px, ${bar.top}px, 0)`, height: bar.height }}
    >
      <div className="relative h-full motion-safe:animate-[collab-flag-in_150ms_ease-out]">
        {shown.map((person, index) => (
          <span
            key={person.actor}
            className="absolute top-0 h-full rounded-full"
            style={{ left: index * BAR_PITCH, width: BAR_WIDTH, background: person.color }}
          />
        ))}
        <div className="max-sm:hidden">
          {shown.map((person, index) => (
            <Chip key={person.actor} person={person} top={chipTop + index * step} />
          ))}
          {overflow > 0 && (
            <span
              role="img"
              aria-label={`${overflow} more ${overflow === 1 ? 'collaborator' : 'collaborators'} editing here`}
              title={bar.people.slice(MAX_BARS).map((person) => person.name).join(', ')}
              className="absolute grid place-items-center rounded-full bg-[var(--osio-bg-elevated)] text-3xs font-semibold leading-none text-[var(--osio-fg-default)] ring-2 ring-[var(--osio-bg-page)]"
              style={{ top: chipTop + shown.length * step, left: (BAR_WIDTH - CHIP) / 2, width: CHIP, height: CHIP }}
            >
              +{overflow}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export const CollabPresenceGutter: React.FC<{ bars: GutterBar[]; viewportTop: number }> = ({ bars, viewportTop }) => (
  <>
    {bars.map((bar) => <Bar key={bar.blockId} bar={bar} viewportTop={viewportTop} />)}
  </>
);
