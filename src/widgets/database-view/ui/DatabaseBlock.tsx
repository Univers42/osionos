/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DatabaseBlock.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 19:04:37 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/10 00:35:54 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';
import { ObjectDatabase, type ObjectDatabaseProps } from '@notion-db/object-database';

import type { Block } from '@/entities/block';
import type { PageEntry, PagePropertyEntry } from '@/entities/page';
import { useUserStore } from '@/features/auth';
import { OsionosPage } from '@/pages/notion-page/ui/NotionPage';
import {
  DEFAULT_OBJECT_DATABASE_ID,
  DEFAULT_OBJECT_DATABASE_VIEW_ID,
} from '@/store/useDatabaseStore';
import { usePageStore } from '@/store/usePageStore';
import { getKnownDatabaseView, KNOWN_DATABASE_VIEWS } from '../model/databaseViewCatalog';
import { createKnownDatabaseAdapter } from '../model/knownDatabaseState';
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
  const knownViewId = resolvedInitialView && getKnownDatabaseView(resolvedInitialView)
    ? resolvedInitialView
    : KNOWN_DATABASE_VIEWS.find((viewDefinition) => viewDefinition.databaseId === resolvedDatabaseId)?.id;
  const knownDatabaseAdapter = React.useMemo(
    () => createKnownDatabaseAdapter({ inlineLoadLimit: mode === 'inline' ? 16 : undefined }),
    [mode],
  );
  const renderPage = React.useCallback<NonNullable<ObjectDatabaseProps['renderPage']>>(
    (pageId, state, onClose) => <DatabaseObjectPage pageId={pageId} state={state} onClose={onClose} />,
    [],
  );

  if (knownViewId) {
    return (
      <div
        className={[
          'osionos-database-block w-full min-w-0',
          mode === 'full' ? 'osionos-database-block--full h-full overflow-auto' : 'osionos-database-block--inline my-2',
        ].join(' ')}
        data-database-id={resolvedDatabaseId}
        data-database-view-id={knownViewId}
      >
        <ObjectDatabase
          adapter={knownDatabaseAdapter}
          databaseId={resolvedDatabaseId}
          initialView={knownViewId}
          mode={resolvedMode}
          renderPage={renderPage}
          className={mode === 'full' ? 'h-full' : undefined}
          chrome="single-view"
        />
      </div>
    );
  }

  return (
    <div
      className={[
        'osionos-database-block w-full min-w-0',
        mode === 'full' ? 'osionos-database-block--full h-full overflow-auto' : 'osionos-database-block--inline my-2',
      ].join(' ')}
      data-database-id={resolvedDatabaseId}
      data-database-view-id={resolvedInitialView}
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
      properties: database ? toOsionosPageProperties(database, databasePage) : [],
      content: toOsionosBlocks(databasePage.content),
    };

    usePageStore.setState((current) => ({
      pages: upsertOsionosDatabasePage(current.pages, workspaceId, nextEntry),
    }));
  }, [activePage?.id, activeUserId, database, databasePage, pageId, title, workspaceId]);

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
    <div className="fixed inset-0 z-[var(--osio-z-modal)] flex justify-end bg-[var(--osio-overlay)]">
      <button
        type="button"
        aria-label="Close database page"
        className="fixed inset-0 cursor-default bg-transparent"
        onClick={onClose}
      />
      <aside className="relative z-[var(--osio-z-modal)] h-full w-full max-w-5xl overflow-auto border-l border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-6 py-3">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--osio-fg-muted)]">
            {database?.name ?? 'Database page'} · osionos page
          </span>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-sm text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        {osionosPage ? <OsionosPage pageId={pageId} /> : (
          <div className="mx-auto max-w-3xl px-10 py-10 text-sm text-[var(--osio-fg-muted)]">
            Page unavailable
          </div>
        )}
      </aside>
    </div>
  );
};

type DatabasePageContent = DatabaseObjectPageProps['state']['pages'][string]['content'];
type DatabaseSchema = DatabaseObjectPageProps['state']['databases'][string];
type DatabasePage = DatabaseObjectPageProps['state']['pages'][string];

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
    properties: nextEntry.properties,
    content: entry.content?.length ? entry.content : nextEntry.content,
  };
}

function toOsionosPageProperties(database: DatabaseSchema, page: DatabasePage): PagePropertyEntry[] {
  return Object.values(database.properties).map((property) => ({
    key: property.id,
    label: property.name,
    type: toOsionosPropertyType(property.type),
    value: toOsionosPropertyValue(page.properties[property.id], property.type),
    options: property.options?.map((option) => option.value),
    relationTarget: property.type === 'relation' ? 'page' : undefined,
  }));
}

function toOsionosPropertyType(type: DatabaseSchema['properties'][string]['type']): PagePropertyEntry['type'] {
  if (type === 'number') return 'number';
  if (type === 'checkbox') return 'checkbox';
  if (type === 'date' || type === 'created_time' || type === 'last_edited_time' || type === 'due_date') return 'date';
  if (type === 'select' || type === 'status') return 'select';
  if (type === 'url') return 'url';
  if (type === 'relation') return 'relation';
  return 'text';
}

function toOsionosPropertyValue(value: unknown, type: DatabaseSchema['properties'][string]['type']): PagePropertyEntry['value'] {
  if (type === 'relation') return toStringArray(value);
  if (type === 'checkbox') return Boolean(value);
  if (type === 'number') return toNumber(value);
  if (Array.isArray(value)) return value.map(toSafeString).filter(Boolean).join(', ');
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(toSafeString).filter(Boolean);
  const item = toSafeString(value);
  return item ? [item] : [];
}

function toSafeString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}
