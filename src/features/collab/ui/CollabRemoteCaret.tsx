/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CollabRemoteCaret.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * One remote collaborator's caret, selection and control ring, drawn from a
 * measured CaretMark. The caret line glides with a transform (compositor-only);
 * its head is the member's name while they are active and a small dot once they
 * rest, swapping back on their next move. Motion lives in app/styles/collab.css
 * behind prefers-reduced-motion, so with reduced motion everything is simply
 * placed and swapped, never animated.
 */

import React from 'react';

import type { CaretMark } from '../model/presenceFrame';

function Selection({ mark }: { mark: CaretMark }): React.ReactElement {
  return (
    <>
      {mark.selection.map((box, index) => (
        <span
          key={index}
          className="fixed left-0 top-0 rounded-[2px]"
          style={{
            transform: `translate3d(${box.left}px, ${box.top}px, 0)`,
            width: box.width,
            height: box.height,
            background: `color-mix(in srgb, ${mark.color} var(--collab-selection-mix), transparent)`,
          }}
        />
      ))}
    </>
  );
}

function CaretLine({ mark, caret }: { mark: CaretMark; caret: NonNullable<CaretMark['caret']> }): React.ReactElement {
  const { flag, idle } = mark;
  const flagSide = flag === 'above' ? 'bottom-full mb-0.5 origin-bottom-left' : 'top-full mt-0.5 origin-top-left';
  return (
    <span
      className="collab-glide fixed left-0 top-0 will-change-transform"
      style={{ transform: `translate3d(${caret.left - 1}px, ${caret.top}px, 0)`, height: caret.height }}
    >
      <span className="block rounded-[1px]" style={{ width: 'var(--collab-caret-w)', height: '100%', background: mark.color }} />
      <span
        data-on={idle ? '' : undefined}
        className="collab-head absolute -left-0.5 -top-[3px] h-1.5 w-1.5 rounded-full"
        style={{ background: mark.color }}
      />
      <span
        data-on={idle ? undefined : ''}
        className={`collab-head absolute left-0 whitespace-nowrap rounded-[4px] px-1 text-3xs font-semibold leading-4 ${flagSide}`}
        style={{ background: mark.color, color: mark.ink, boxShadow: 'var(--osio-shadow-menu)' }}
      >
        {mark.name}
      </span>
    </span>
  );
}

export const CollabRemoteCaret: React.FC<{ mark: CaretMark }> = ({ mark }) => (
  <>
    <Selection mark={mark} />
    {mark.caret && <CaretLine mark={mark} caret={mark.caret} />}
  </>
);

/** The ring around a control a remote member is using. Static; it arrives with
 *  one 250 ms ring-in; the caller keys it by control id, so only a change of
 *  control (not every re-measure) replays it. */
export const CollabControlRing: React.FC<{ mark: CaretMark }> = ({ mark }) => {
  const { control } = mark;
  if (!control) return null;
  return (
    <span
      className="collab-ring-enter fixed"
      style={{
        left: control.left - 2,
        top: control.top - 2,
        width: control.width + 4,
        height: control.height + 4,
        border: `2px solid ${mark.color}`,
        borderRadius: 'var(--osio-radius-card)',
      }}
    />
  );
};
