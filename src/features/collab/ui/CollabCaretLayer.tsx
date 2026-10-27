/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CollabCaretLayer.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 17:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Viewport overlay for remote collaborators (AOC §3): carets with name flags,
 * selections, control rings, the per-block gutter and the edge jump pills. It is a
 * SEPARATE layer portaled to <body>, so a remote caret moving never re-renders
 * the editable content. Everything it draws comes from one measured PresenceFrame
 * (usePresenceFrame), read in a single pass per animation frame.
 *
 * The layer is pointer-events:none; only the edge pills opt back in. Carets,
 * selections and rings are aria-hidden (they are pictures of someone else's
 * cursor); the gutter chips and pills carry names and labels for assistive tech.
 * Colours are --collab-* tokens only: identity is the name plus the colour.
 */

import React, { useRef } from 'react';
import { createPortal } from 'react-dom';

import { CollabControlRing, CollabRemoteCaret } from './CollabRemoteCaret';
import { CollabPresenceGutter } from './CollabPresenceGutter';
import { CollabEdgeIndicators } from './CollabEdgeIndicators';
import { usePresenceFrame } from './usePresenceFrame';

const OVERLAY_Z = 45; // above editor content, below modals/toasts

export const CollabCaretLayer: React.FC = () => {
  const layerRef = useRef<HTMLDivElement>(null);
  const frame = usePresenceFrame(layerRef);

  if (!frame || typeof document === 'undefined') return null;
  const { carets, bars, viewport, clip } = frame;
  if (carets.length === 0 && bars.length === 0 && frame.above.length === 0 && frame.below.length === 0) return null;

  return createPortal(
    <div ref={layerRef} className="collab-layer pointer-events-none fixed inset-0" style={{ zIndex: OVERLAY_Z }}>
      {/* Clipped to the editor: a caret scrolled under the top bar is cut at its edge. */}
      <div className="absolute inset-0" style={{ clipPath: clip }}>
        <CollabPresenceGutter bars={bars} viewportTop={viewport.top} />
        <div aria-hidden>
          {carets.map((mark) => <CollabRemoteCaret key={mark.actor} mark={mark} />)}
        </div>
      </div>
      {/* Controls live in toolbars outside the editor, so their rings are not clipped. */}
      <div aria-hidden>
        {carets.map((mark) => <CollabControlRing key={`${mark.actor}:${mark.controlId}`} mark={mark} />)}
      </div>
      <CollabEdgeIndicators frame={frame} />
    </div>,
    document.body,
  );
};
