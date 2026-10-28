/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SharePopover.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/15 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link2, X } from 'lucide-react';
import type { PageEntry } from '@/entities/page';
import { usePageStore } from '@/store/usePageStore';
import { InheritedRow, ShareRow } from './ShareRow';
import { SharePeoplePicker } from './SharePeoplePicker';
import { useShareModel, type InheritedShareRow } from './useShareModel';
import { AccessRequestsSection } from './AccessRequestsSection';
import { PublishSection } from './PublishSection';
import { getCurrentPageAccessContext } from '@/shared/lib/auth/pageAccess';
import { isPublishEnabled } from '@/shared/config/featureFlags';
import { PAGE_SHARE_LEVELS, WORKSPACE_SHARE_LEVELS } from './pageShareModel';
import type { ShareResource } from './types';

const ANCHORED = 'fixed inset-x-[var(--osio-space-4)] mt-2 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:w-[380px]';
// Both insets plus auto margins centre the box under its max width; the height cap keeps the footer reachable on a short screen.
const CENTERED = 'fixed inset-x-[var(--osio-space-4)] top-[10vh] mx-auto max-h-[80vh] max-w-[380px] overflow-y-auto';
const EMPTY_PAGES: readonly PageEntry[] = [];

interface SharePopoverProps {
  resource: ShareResource;
  onClose: () => void;
  centered?: boolean;
}

/** More inherited rows than this start collapsed: a dialog must not become a wall of rows. */
const INHERITED_COLLAPSE_AT = 5;

/** The "Inherited from parent pages" section: what the ancestors' rules do to this page.
 *  Read-only — each row's rule is edited on the page it is set on, which the row opens.
 *  Rendered only when there is something to say: no rows and no hidden restriction means
 *  no section (an old bridge, an empty chain, or a page that failed to load). */
export interface InheritedSectionProps {
  rows: InheritedShareRow[];
  hiddenInherited: boolean;
  onOpenSource: (row: InheritedShareRow) => void;
  /** A row can open its source page only while that page is in the store. */
  isOpenable?: (row: InheritedShareRow) => boolean;
}

export const InheritedSection: React.FC<InheritedSectionProps> = ({ rows, hiddenInherited, onOpenSource, isOpenable = () => true }) => {
  const [expanded, setExpanded] = useState(false);
  const headingId = useId();
  const listId = useId();
  if (rows.length === 0 && !hiddenInherited) return null;
  const collapsible = rows.length > INHERITED_COLLAPSE_AT;
  return (
    <section aria-labelledby={headingId} className="mt-2 border-t border-[var(--osio-border-default)] pt-2">
      <h4 id={headingId} className="osio-menu-label">Inherited from parent pages</h4>
      {rows.length > 0 && (
        <div id={listId} hidden={collapsible && !expanded} className="max-h-[260px] space-y-0.5 overflow-y-auto">
          {rows.map((row) => (
            <InheritedRow
              key={row.key}
              entry={row.entry}
              fromTitle={row.fromPageTitle}
              reaches={row.reaches}
              denied={row.denied}
              onOpenSource={isOpenable(row) ? () => onOpenSource(row) : undefined}
            />
          ))}
        </div>
      )}
      {collapsible && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          className="osio-menu-item min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--osio-accent)]"
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? 'Hide inherited' : `Show ${rows.length} inherited`}
        </button>
      )}
      {hiddenInherited && (
        // Neutral text, never an icon alone: it says only that something above applies.
        <p className="px-2 pt-1 text-xs text-[var(--osio-fg-muted)] [overflow-wrap:anywhere]">
          Other restrictions above this page may apply.
        </p>
      )}
    </section>
  );
};

/** Notion-style Share dialog: current access list, people picker, general
 *  access. Anchored by default: render it inside a relatively-positioned parent
 *  next to a "Share" button; from sm up it hangs below that parent's right
 *  edge, below sm it is fixed between the 16px gutters at its static position
 *  (just under the trigger). `centered` is for a host with no trigger to hang
 *  from (ShareHost): fixed in the upper part of the viewport at every width. */
export const SharePopover: React.FC<SharePopoverProps> = ({ resource, onClose, centered = false }) => {
  // The store's page titles name the source of each inherited row; the bridge decides which
  // parents carry rules the reader may see.
  const pages = usePageStore((state) => state.pages[resource.workspaceId] ?? EMPTY_PAGES);
  const model = useShareModel(resource, pages);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const page = usePageStore((s) => s.pageById(resource.resourceId));
  const accessContext = getCurrentPageAccessContext();
  const ownsPage = resource.resourceType === 'page' && !!page && !!accessContext && page.ownerId === accessContext.userId;

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
  const peopleEntries = model.entries.filter((entry) => entry.target.type === 'user' || entry.target.type === 'role' || entry.target.type === 'team');

  // The ancestor page a rule is set on is where it is edited: open that page and step aside.
  const openInheritedSource = useCallback((row: InheritedShareRow) => {
    const page = pages.find((candidate) => candidate._id.toLowerCase() === row.fromPageId.toLowerCase());
    if (!page) return;
    usePageStore.getState().openPage({
      id: page._id,
      workspaceId: page.workspaceId,
      kind: page.databaseId ? 'database' : 'page',
      title: page.title,
      icon: page.icon,
      databaseId: page.databaseId,
    });
    onClose();
  }, [onClose, pages]);

  /** Only pages the store holds can be opened: every other source title is plain text. */
  const openablePageIds = useMemo(() => new Set(pages.map((page) => page._id.toLowerCase())), [pages]);
  const isInheritedSourceOpenable = useCallback(
    (row: InheritedShareRow) => openablePageIds.has(row.fromPageId.toLowerCase()),
    [openablePageIds],
  );

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
          teams={model.teams}
          excludedKeys={model.entries.map((entry) => entry.key)}
          disabled={model.busy || model.loading}
          onPick={(person) => { void model.setLevel({ type: 'user', person }, 'can_view'); }}
          onPickTeam={(team) => { void model.setLevel({ type: 'team', team }, 'can_view'); }}
        />
      </div>

      {ownsPage && (
        <AccessRequestsSection
          workspaceId={resource.workspaceId}
          pageId={resource.resourceId}
          onApproved={() => { void model.refresh(); }}
        />
      )}

      <div className="mt-3 max-h-[260px] space-y-0.5 overflow-y-auto">
        {model.loading && <p className="px-2 py-3 text-xs text-[var(--osio-fg-muted)]">Loading access…</p>}
        {!model.loading && peopleEntries.length === 0 && (
          <p className="px-2 py-3 text-xs text-[var(--osio-fg-muted)]">
            {model.isLive ? 'Only workspace defaults apply. Add people above.' : 'Add members of this workspace above.'}
          </p>
        )}
        {peopleEntries.map((entry) => (
          <ShareRow
            key={entry.key}
            entry={entry}
            levels={model.isLive || entry.sourceId ? undefined : PAGE_SHARE_LEVELS}
            busy={model.busy || model.loading}
            onLevel={(level) => { void model.setLevel(entry.target, level); }}
            onRemove={() => { void model.removeEntry(entry); }}
          />
        ))}
      </div>

      {!model.isLive && model.loading && (
        // One row's height, skeleton line: the list below must not jump when rows land.
        <div className="mt-2 border-t border-[var(--osio-border-default)] pt-2" aria-hidden="true">
          <div className="flex min-h-17 items-center px-2">
            <span className="h-3 w-full animate-pulse rounded-xs bg-[var(--osio-bg-subtle)]" />
          </div>
        </div>
      )}
      {!model.isLive && !model.loading && (
        <InheritedSection
          rows={model.inherited}
          hiddenInherited={model.hiddenInherited}
          onOpenSource={openInheritedSource}
          isOpenable={isInheritedSourceOpenable}
        />
      )}

      {!model.isLive && (
        <div className="mt-2 border-t border-[var(--osio-border-default)] pt-2">
          <p className="osio-menu-label">General access</p>
          {generalEntries.length === 0 && (
            <button
              type="button"
              disabled={model.busy || model.loading}
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
              levels={entry.sourceId ? undefined : WORKSPACE_SHARE_LEVELS}
              busy={model.busy || model.loading}
              onLevel={(level) => { void model.setLevel(entry.target, level); }}
              onRemove={() => { void model.removeEntry(entry); }}
            />
          ))}
        </div>
      )}

      <div data-testid="share-footer" className="mt-2 flex items-center justify-between border-t border-[var(--osio-border-default)] px-2 pt-2">
        {model.error
          ? <span className="truncate text-xs text-[var(--osio-danger)]">{model.error}</span>
          : <span className="text-xs text-[var(--osio-fg-subtle)]">{model.isLive ? 'Levels persist as engine policies.' : 'Only the page owner can change access.'}</span>}
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
