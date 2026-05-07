/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DatabaseBlock.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 19:04:37 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/07 14:05:47 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';
import { ObjectDatabase, type ObjectDatabaseProps } from '@notion-db/object-database';

import type { Block } from '@/entities/block';
import type { PageEntry } from '@/entities/page';
import { useUserStore } from '@/features/auth';
import { OsionosPage } from '@/pages/notion-page/ui/NotionPage';
import {
  DEFAULT_OBJECT_DATABASE_ID,
  DEFAULT_OBJECT_DATABASE_VIEW_ID,
} from '@/store/useDatabaseStore';
import { usePageStore } from '@/store/usePageStore';
import { getObjectDatabaseAdapter } from '../model/objectDatabaseAdapter';

interface DatabaseBlockProps {
  databaseId?: string;
  initialViewId?: string;
  mode?: 'inline' | 'full';
}

export const DatabaseBlock: React.FC<DatabaseBlockProps> = ({
  databaseId,
  initialViewId,
  mode = 'inline',
}) => {
  const resolvedMode = mode === 'full' ? 'page' : 'inline';
  const resolvedDatabaseId = databaseId ?? DEFAULT_OBJECT_DATABASE_ID;
  const resolvedInitialView = initialViewId
    ?? (resolvedDatabaseId === DEFAULT_OBJECT_DATABASE_ID ? DEFAULT_OBJECT_DATABASE_VIEW_ID : undefined);
  const renderPage = React.useCallback<NonNullable<ObjectDatabaseProps['renderPage']>>(
    (pageId, state, onClose) => <DatabaseObjectPage pageId={pageId} state={state} onClose={onClose} />,
    [],
  );

  return (
    <div
      className={[
        'w-full min-w-0',
        mode === 'full' ? 'h-full overflow-hidden' : 'my-2',
      ].join(' ')}
    >
      <ObjectDatabase
        adapter={getObjectDatabaseAdapter()}
        databaseId={resolvedDatabaseId}
        initialView={resolvedInitialView}
        mode={resolvedMode}
        renderPage={renderPage}
        className={mode === 'full' ? 'h-full' : undefined}
      />
    </div>
  );
};

type DatabaseObjectPageProps = {
  pageId: Parameters<NonNullable<ObjectDatabaseProps['renderPage']>>[0];
  state: Parameters<NonNullable<ObjectDatabaseProps['renderPage']>>[1];
  onClose: Parameters<NonNullable<ObjectDatabaseProps['renderPage']>>[2];
};

const DatabaseObjectPage: React.FC<DatabaseObjectPageProps> = ({ pageId, state, onClose }) => {
  const databasePage = state.pages[pageId];
  const database = databasePage ? state.databases[databasePage.databaseId] : null;
  const title = databasePage ? String(state.getPageTitle(databasePage) || 'Untitled') : 'Page unavailable';
  const activePage = usePageStore(s => s.activePage);
  const osionosPage = usePageStore(s => s.pageById(pageId));
  const activeUserId = useUserStore(s => s.activeUserId);
  const activeWorkspace = useUserStore(s => s.activeWorkspace());
  const workspaceId = activePage?.workspaceId ?? activeWorkspace?._id;

  React.useEffect(() => {
    if (!databasePage || !workspaceId) return;
    const nextEntry: PageEntry = {
      _id: pageId,
      title,
      icon: databasePage.icon ?? database?.icon ?? '📄',
      cover: databasePage.cover,
      updatedAt: databasePage.updatedAt,
      workspaceId,
      ownerId: activeUserId || null,
      visibility: 'private',
      collaborators: [],
      parentPageId: activePage?.id ?? '__database_rows__',
      databaseId: databasePage.databaseId,
      archivedAt: null,
      content: toOsionosBlocks(databasePage.content),
    };

    usePageStore.setState((current) => ({
      pages: upsertOsionosDatabasePage(current.pages, workspaceId, nextEntry),
    }));
  }, [activePage?.id, activeUserId, database?.icon, databasePage, pageId, title, workspaceId]);

  React.useEffect(() => {
    if (!databasePage || !database || !osionosPage) return;
    if (osionosPage.title !== databasePage.properties[database.titlePropertyId]) {
      state.updatePageProperty(pageId, database.titlePropertyId, osionosPage.title);
    }
  }, [database, databasePage, osionosPage, pageId, state]);

  const osionosContentKey = JSON.stringify(osionosPage?.content ?? []);

  React.useEffect(() => {
    if (!databasePage || !osionosPage) return;
    if (osionosContentKey !== JSON.stringify(databasePage.content ?? [])) {
      state.updatePageContent(pageId, (osionosPage.content ?? []) as DatabasePageContent);
    }
  }, [databasePage, osionosContentKey, osionosPage, pageId, state]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20">
      <button
        type="button"
        aria-label="Close database page"
        className="fixed inset-0 cursor-default bg-transparent"
        onClick={onClose}
      />
      <aside className="relative z-[60] h-full w-full max-w-5xl overflow-auto border-l border-[var(--color-line)] bg-[var(--color-surface-primary)] shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-surface-primary)] px-6 py-3">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
            {database?.name ?? 'Database page'} · osionos page
          </span>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-sm text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        {osionosPage ? <OsionosPage pageId={pageId} /> : (
          <div className="mx-auto max-w-3xl px-10 py-10 text-sm text-[var(--color-ink-muted)]">
            Page unavailable
          </div>
        )}
      </aside>
    </div>
  );
};

type DatabasePageContent = DatabaseObjectPageProps['state']['pages'][string]['content'];

function toOsionosBlocks(blocks: DatabasePageContent | undefined): Block[] {
  return (blocks ?? []).map((block) => ({
    ...block,
    type: block.type as Block['type'],
    children: toOsionosBlocks(block.children),
  }));
}

function upsertOsionosDatabasePage(
  pages: Record<string, PageEntry[]>,
  workspaceId: string,
  nextEntry: PageEntry,
): Record<string, PageEntry[]> {
  let found = false;
  const nextPages: Record<string, PageEntry[]> = {};

  for (const [currentWorkspaceId, entries] of Object.entries(pages)) {
    nextPages[currentWorkspaceId] = entries.map((entry) => {
      if (entry._id !== nextEntry._id) return entry;
      found = true;
      return mergeOsionosDatabasePage(entry, nextEntry);
    });
  }

  if (!found) {
    nextPages[workspaceId] = [...(nextPages[workspaceId] ?? []), nextEntry];
  }

  return nextPages;
}

function mergeOsionosDatabasePage(entry: PageEntry, nextEntry: PageEntry): PageEntry {
  return {
    ...entry,
    ...nextEntry,
    title: entry.title || nextEntry.title,
    content: entry.content?.length ? entry.content : nextEntry.content,
  };
}
