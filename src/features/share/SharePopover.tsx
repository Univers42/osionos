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

interface SharePopoverProps {
  resource: ShareResource;
  onClose: () => void;
}

/** Notion-style Share dialog: current access list, people picker, general
 *  access. Anchored by the caller (render inside a relatively-positioned
 *  parent, e.g. next to a toolbar "Share" button). Below the sm breakpoint the
 *  right-anchored box would run off the left edge, so it spans the viewport
 *  gutters instead (fixed, top auto = just under the trigger). */
export const SharePopover: React.FC<SharePopoverProps> = ({ resource, onClose }) => {
  const model = useShareModel(resource);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) onClose();
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [onClose]);

  const generalEntries = model.entries.filter((entry) => entry.target.type === 'workspace' || entry.target.type === 'public');
  const peopleEntries = model.entries.filter((entry) => entry.target.type === 'user' || entry.target.type === 'role');

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Share"
      className="osio-surface-overlay fixed inset-x-[var(--osio-space-4)] z-[var(--osio-z-popover)] mt-2 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:w-[380px]"
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
          <p className="px-2 pb-1 text-2xs font-medium uppercase tracking-wide text-[var(--osio-fg-subtle)]">General access</p>
          {generalEntries.length === 0 && (
            <button
              type="button"
              disabled={model.busy}
              className="flex h-[var(--osio-control-h-sm)] w-full items-center rounded-[var(--osio-radius-sm)] px-2 text-left text-sm text-[var(--osio-fg-muted)] transition-colors duration-[var(--osio-dur-fast)] hover:bg-[var(--osio-bg-hover)]"
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
