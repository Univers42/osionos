/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SharePopover.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useRef } from 'react';
import { Link2, X } from 'lucide-react';
import { ShareRow } from './ShareRow';
import { SharePeoplePicker } from './SharePeoplePicker';
import { useShareModel } from './useShareModel';
import { PublishSection } from './PublishSection';
import { isPublishEnabled } from '@/shared/config/featureFlags';
import type { ShareResource } from './types';

const ANCHORED = 'fixed inset-x-[var(--osio-space-4)] mt-2 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:w-[380px]';
// Both insets plus auto margins centre the box under its max width; the height cap keeps the footer reachable on a short screen.
const CENTERED = 'fixed inset-x-[var(--osio-space-4)] top-[10vh] mx-auto max-h-[80vh] max-w-[380px] overflow-y-auto';

interface SharePopoverProps {
  resource: ShareResource;
  onClose: () => void;
  centered?: boolean;
}

/** Notion-style Share dialog: current access list, people picker, general
 *  access. Anchored by default: render it inside a relatively-positioned parent
 *  next to a "Share" button; from sm up it hangs below that parent's right
 *  edge, below sm it is fixed between the 16px gutters at its static position
 *  (just under the trigger). `centered` is for a host with no trigger to hang
 *  from (ShareHost): fixed in the upper part of the viewport at every width. */
export const SharePopover: React.FC<SharePopoverProps> = ({ resource, onClose, centered = false }) => {
  const model = useShareModel(resource);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose();
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  // Centred, there is no trigger keeping focus, so it would stay on <body>: start
  // in the people field, or on the dialog itself when that field is disabled.
  useEffect(() => {
    if (!centered) return;
    const root = rootRef.current;
    (root?.querySelector<HTMLInputElement>('input:not([disabled])') ?? root)?.focus();
  }, [centered]);

  const generalEntries = model.entries.filter((entry) => entry.target.type === 'workspace' || entry.target.type === 'public');
  const peopleEntries = model.entries.filter((entry) => entry.target.type === 'user' || entry.target.type === 'role');

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Share"
      tabIndex={-1}
      className={`osio-surface-overlay z-[var(--osio-z-popover)] ${centered ? CENTERED : ANCHORED}`}
    >
      <div className="mb-2 flex items-center justify-between px-2 pt-1">
        <div>
          <h3 className="text-sm font-semibold text-[var(--osio-fg-default)]">Share</h3>
          <p className="text-xs text-[var(--osio-fg-muted)]">{resource.liveResourceName ? `live database · ${resource.liveResourceName}` : resource.resourceType}</p>
        </div>
        <button type="button" aria-label="Close share dialog" className="rounded-[var(--osio-radius-sm)] p-1 text-[var(--osio-fg-muted)] transition-colors duration-[var(--osio-dur-fast)] hover:bg-[var(--osio-bg-hover)]" onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      <div className="px-2">
        <SharePeoplePicker
          people={model.people}
          excludedKeys={model.entries.map((entry) => entry.key)}
          disabled={model.busy}
          onPick={(person) => { void model.setLevel({ type: 'user', person }, 'can_view'); }}
        />
      </div>

      <div className="mt-3 max-h-[260px] space-y-0.5 overflow-y-auto">
        {model.loading && <p className="px-2 py-3 text-xs text-[var(--osio-fg-muted)]">Loading access…</p>}
        {!model.loading && peopleEntries.length === 0 && (
          <p className="px-2 py-3 text-xs text-[var(--osio-fg-muted)]">Only workspace defaults apply. Add people above.</p>
        )}
        {peopleEntries.map((entry) => (
          <ShareRow
            key={entry.key}
            entry={entry}
            busy={model.busy}
            onLevel={(level) => { void model.setLevel(entry.target, level); }}
            onRemove={() => { void model.removeEntry(entry); }}
          />
        ))}
      </div>

      {!model.isLive && (
        <div className="mt-2 border-t border-[var(--osio-border-default)] pt-2">
          <p className="osio-menu-label">General access</p>
          {generalEntries.length === 0 && (
            <button
              type="button"
              disabled={model.busy}
              className="osio-menu-item"
              data-tone="muted"
              onClick={() => { void model.setLevel({ type: 'workspace' }, 'can_view'); }}
            >
              + Let everyone in the workspace view
            </button>
          )}
          {generalEntries.map((entry) => (
            <ShareRow
              key={entry.key}
              entry={entry}
              busy={model.busy}
              onLevel={(level) => { void model.setLevel(entry.target, level); }}
              onRemove={() => { void model.removeEntry(entry); }}
            />
          ))}
        </div>
      )}

      <div data-testid="share-footer" className="mt-2 flex items-center justify-between border-t border-[var(--osio-border-default)] px-2 pt-2">
        {model.error
          ? <span className="truncate text-xs text-[var(--osio-danger)]">{model.error}</span>
          : <span className="text-xs text-[var(--osio-fg-subtle)]">{model.isLive ? 'Levels persist as engine policies.' : 'Levels persist as access rules.'}</span>}
        <button
          type="button"
          className="inline-flex h-[var(--osio-control-h-sm)] shrink-0 items-center gap-1 rounded-[var(--osio-radius-sm)] px-2 text-xs text-[var(--osio-fg-muted)] transition-colors duration-[var(--osio-dur-fast)] hover:bg-[var(--osio-bg-hover)]"
          onClick={() => { void navigator.clipboard.writeText(globalThis.location?.href ?? ''); }}
        >
          <Link2 size={12} /> Copy link
        </button>
      </div>
      {isPublishEnabled() && resource.resourceType === 'page' && <PublishSection pageId={resource.resourceId} />}
    </div>
  );
};
