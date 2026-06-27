/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageShareButton.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * "Share" entry in the page header bar: anchors the WS-C SharePopover
 * (features/share) next to the trigger. The caller-decided resource here is
 * the page itself (AccessRule mode — no liveResourceName); the popover is
 * lazy so the share feature stays out of the editor chunk until opened.
 * While open, pointerdown is contained so the popover's own outside-close
 * does not race the trigger's toggle.
 */

import React, { Suspense, lazy, useState } from 'react';
import { Share2 } from 'lucide-react';

const LazySharePopover = lazy(() =>
  import('@/features/share/SharePopover').then((m) => ({ default: m.SharePopover })),
);

interface PageShareButtonProps {
  pageId: string;
  workspaceId: string;
}

export const PageShareButton: React.FC<PageShareButtonProps> = ({ pageId, workspaceId }) => {
  const [open, setOpen] = useState(false);

  if (!pageId || !workspaceId) return null;

  return (
    <div
      className="relative"
      onPointerDown={(event) => {
        if (open) event.stopPropagation();
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-7 items-center gap-1.5 rounded px-2 text-sm text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
        aria-label="Share page"
        aria-expanded={open}
      >
        <Share2 size={15} />
        <span className="hidden sm:inline">Share</span>
      </button>
      {open && (
        <Suspense fallback={null}>
          <LazySharePopover
            resource={{ workspaceId, resourceId: pageId, resourceType: 'page' }}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
};
