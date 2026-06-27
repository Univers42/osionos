/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CollabCaretLayer.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 17:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 17:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Renders remote keyboard carets + selection highlights as a viewport overlay
 * (AOC §3). It is a SEPARATE layer portaled to <body> — it never re-renders the
 * editable content, so a remote caret moving costs nothing in the editor tree.
 * Rects are measured from the live DOM (caretDom) and recomputed at most once
 * per frame on scroll/resize. pointer-events:none, so it never intercepts input.
 * Each caret carries its owner's name (R-A8: identity by name + color, not color
 * alone). Colors come from the roster join; no raw literals.
 */

import React, { useEffect, useReducer } from 'react';
import { createPortal } from 'react-dom';

import { useCollabStore } from '../store/useCollabStore';
import { caretRectAt, controlRectFor, selectionRectsFor } from '../model/caretDom';

const OVERLAY_Z = 45; // above editor content, below modals/toasts

function CaretFlag({ left, top, height, color, name }: {
  left: number; top: number; height: number; color: string; name: string;
}): React.ReactElement {
  return (
    <span aria-hidden style={{ position: 'fixed', left, top, height, transform: 'translateX(-1px)' }}>
      <span style={{ display: 'block', width: 'var(--collab-caret-w)', height: '100%', background: color, borderRadius: '1px' }} />
      <span
        style={{ position: 'absolute', top: -16, left: 0, background: color, color: 'var(--osio-bg-elevated)' }}
        className="whitespace-nowrap rounded-[4px] px-1 text-[10px] font-semibold leading-4 shadow-[var(--osio-shadow-menu)] motion-safe:animate-[collab-flag-in_120ms_ease-out]"
      >
        {name}
      </span>
    </span>
  );
}

export const CollabCaretLayer: React.FC = () => {
  const cursors = useCollabStore((state) => state.cursors);
  const members = useCollabStore((state) => state.members);
  const status = useCollabStore((state) => state.status);
  const [, recompute] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    let raf: number | null = null;
    const onMove = () => { if (raf == null) raf = requestAnimationFrame(() => { raf = null; recompute(); }); };
    window.addEventListener('scroll', onMove, true); // capture: catch nested scroll containers
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, []);

  if (status !== 'live' || cursors.size === 0 || typeof document === 'undefined') return null;

  const meta = new Map(members.map((m) => [m.memberId, { color: m.color, name: m.displayName }]));
  const nodes: React.ReactElement[] = [];

  cursors.forEach((cursor) => {
    const who = meta.get(cursor.actor);
    if (!who) return;
    if (cursor.selection) {
      selectionRectsFor(cursor.selection).forEach((r, i) => nodes.push(
        <span
          key={`${cursor.actor}-sel-${i}`}
          aria-hidden
          style={{
            position: 'fixed', left: r.left, top: r.top, width: r.width, height: r.height,
            background: `color-mix(in srgb, ${who.color} var(--collab-selection-mix), transparent)`,
            borderRadius: '2px',
          }}
        />,
      ));
    }
    if (cursor.caret) {
      const rect = caretRectAt(cursor.caret);
      if (rect) nodes.push(
        <CaretFlag key={`${cursor.actor}-caret`} left={rect.left} top={rect.top} height={rect.height} color={who.color} name={who.name} />,
      );
    }
    if (cursor.focusedElementId) {
      const cr = controlRectFor(cursor.focusedElementId);
      if (cr) nodes.push(
        <span
          key={`${cursor.actor}-ctrl`}
          aria-hidden
          className="motion-safe:animate-[collab-pulse_1200ms_ease-in-out_infinite]"
          style={{
            position: 'fixed', left: cr.left - 2, top: cr.top - 2, width: cr.width + 4, height: cr.height + 4,
            border: `2px solid ${who.color}`, borderRadius: 'var(--osio-radius-card)',
          }}
        />,
      );
    }
  });

  if (nodes.length === 0) return null;
  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0" style={{ zIndex: OVERLAY_Z }}>{nodes}</div>,
    document.body,
  );
};
