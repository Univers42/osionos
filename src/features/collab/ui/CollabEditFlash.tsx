/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CollabEditFlash.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The flash over a block a collaborator just changed: a tint in their colour that
 * fades out over 700 ms, with their name in the corner, so a change that lands
 * outside the caret is seen and attributed. With reduced motion it is a still 2 px
 * bar for 900 ms instead (collab-activity.css).
 *
 * It subscribes only to the remote-edit store, never to the page: an edit does not
 * re-render the editor, and a flash re-renders just this layer. Marks are placed
 * with one read pass, then one write pass, per animation frame, and only while a
 * flash is alive: no frame loop runs when nobody is editing. The layer is
 * pointer-events:none, so nothing here can intercept a click meant for the page.
 *
 * Caveat: a mark is placed from the block's rect at each frame, so it follows
 * scrolling for the 900 ms it lives; a block that is not mounted (virtualised out,
 * on another page) is skipped and the flash is simply not shown.
 */

import React, { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { useCollabStore } from '../store/useCollabStore';
import { memberIdOf } from '../model/collabActor';
import { inkFor } from '../model/collabPresence';
import { blockRectOf, clipInset, scrollerEl, viewportOf } from '../model/presenceDom';
import { liveFlashes } from '../model/remoteEditFlash';
import { useRemoteEditStore } from '../model/remoteEditStore';

// Under the caret layer (45) so a caret flag is never hidden by a tint.
const FLASH_Z = 44;

function placeMarks(layer: HTMLElement): void {
  const marks = Array.from(layer.querySelectorAll<HTMLElement>('[data-flash-block]'));
  const viewport = viewportOf(scrollerEl());
  const rects = marks.map((mark) => blockRectOf(mark.dataset.flashBlock ?? ''));
  layer.style.clipPath = clipInset(viewport);
  marks.forEach((mark, index) => {
    const rect = rects[index];
    mark.hidden = rect === null;
    if (rect === null) return;
    mark.style.width = `${rect.width}px`;
    mark.style.height = `${rect.height}px`;
    mark.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
  });
}

export const CollabEditFlash: React.FC = () => {
  const flashes = useRemoteEditStore((state) => state.flashes);
  const members = useCollabStore((state) => state.members);
  const layerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer || flashes.length === 0) return undefined;
    let raf = 0;
    const frame = (): void => {
      placeMarks(layer);
      const now = Date.now();
      if (liveFlashes(flashes, now) !== flashes) {
        useRemoteEditStore.getState().prune(now);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, [flashes]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div ref={layerRef} aria-hidden className="pointer-events-none fixed inset-0" style={{ zIndex: FLASH_Z }}>
      {flashes.map((flash) => {
        const member = members.find((entry) => entry.memberId === memberIdOf(flash.actor));
        if (!member) return null;
        return (
          <div
            key={`${flash.blockId}:${flash.at}`}
            data-flash-block={flash.blockId}
            hidden
            className="collab-edit-flash fixed left-0 top-0"
          >
            <span
              className="collab-edit-flash__tint absolute inset-0 rounded-sm"
              style={{ background: `color-mix(in srgb, ${member.color} var(--collab-flash-mix), transparent)` }}
            />
            <span className="collab-edit-flash__bar absolute inset-y-0 left-0 w-0.5" style={{ background: member.color }} />
            <span
              className="absolute right-1 top-0 max-w-[60%] truncate rounded-b-sm px-1.5 py-px text-3xs font-medium"
              style={{ background: member.color, color: inkFor(member.color) }}
            >
              {member.displayName}
            </span>
          </div>
        );
      })}
    </div>,
    document.body,
  );
};
