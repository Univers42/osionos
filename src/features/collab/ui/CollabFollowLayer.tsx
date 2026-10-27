/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CollabFollowLayer.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * What follow mode shows: a 2px frame in the followed member's colour around the
 * editor, and a chip that names them and offers Stop. The frame cannot be missed
 * and the chip says how to leave, so follow never feels like the page scrolling
 * by itself. The chip's text is member ink on member colour, the same pair the
 * contrast test checks for the name flags. Escape is handled in the hook.
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import { useCollabStore } from '../store/useCollabStore';
import { memberIdOf } from '../model/collabActor';
import { inkFor } from '../model/collabPresence';
import { useFollowStore } from '../model/followStore';
import { useFollowCollaborator } from './useFollowCollaborator';

// One above the caret layer (45) so the chip is never covered by a caret flag.
const FOLLOW_Z = 46;

export const CollabFollowLayer: React.FC = () => {
  const following = useFollowStore((state) => state.following);
  const member = useCollabStore((state) =>
    following ? state.members.find((entry) => entry.memberId === memberIdOf(following)) : undefined);
  const { box, message } = useFollowCollaborator();

  return (
    <>
      <span role="status" aria-live="polite" className="sr-only">{message}</span>
      {following && member && box && typeof document !== 'undefined' && createPortal(
        <div
          className="pointer-events-none fixed"
          style={{
            left: box.left, top: box.top, width: box.width, height: box.height, zIndex: FOLLOW_Z,
            boxShadow: `inset 0 0 0 2px ${member.color}`,
          }}
        >
          <button
            type="button"
            onClick={() => useFollowStore.getState().stop()}
            className="pointer-events-auto absolute left-3 top-2 inline-flex h-8 max-w-[calc(100%-1.5rem)] cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-medium shadow-[var(--osio-shadow-menu)] before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--osio-bg-page)]"
            style={{ background: member.color, color: inkFor(member.color) }}
          >
            <span className="truncate">Following {member.displayName}</span>
            <span aria-hidden className="shrink-0 opacity-80">·</span>
            <span className="inline-flex shrink-0 items-center gap-1">
              <X size={14} aria-hidden />
              Stop (Esc)
            </span>
          </button>
        </div>,
        document.body,
      )}
    </>
  );
};
