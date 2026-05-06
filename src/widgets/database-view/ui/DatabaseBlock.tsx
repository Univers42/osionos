/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DatabaseBlock.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 19:04:37 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/07 00:51:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';
import { ObjectDatabase, type ObjectDatabaseProps } from '@notion-db/object-database';

import {
  DEFAULT_OBJECT_DATABASE_ID,
  DEFAULT_OBJECT_DATABASE_VIEW_ID,
} from '@/store/useDatabaseStore';
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
  const resolvedInitialView = initialViewId ?? DEFAULT_OBJECT_DATABASE_VIEW_ID;
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
  const page = state.pages[pageId];
  const database = page ? state.databases[page.databaseId] : null;
  const title = page ? state.getPageTitle(page) : 'Page unavailable';
  const properties = database && page
    ? Object.values(database.properties).filter(property => property.id !== database.titlePropertyId)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20">
      <button
        type="button"
        aria-label="Close database page"
        className="fixed inset-0 cursor-default bg-transparent"
        onClick={onClose}
      />
      <aside className="relative z-[60] h-full w-full max-w-2xl overflow-auto border-l border-[var(--color-line)] bg-[var(--color-surface-primary)] shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-surface-primary)] px-6 py-3">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
            {database?.name ?? 'Database page'}
          </span>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-sm text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="mx-auto max-w-3xl px-10 py-10">
          <h1 className="mb-8 text-4xl font-bold tracking-tight text-[var(--color-ink)]">
            {title || 'Untitled'}
          </h1>
          {page && properties.length > 0 && (
            <dl className="mb-8 divide-y divide-[var(--color-line)] rounded-xl border border-[var(--color-line)]">
              {properties.map((property) => (
                <div key={property.id} className="grid grid-cols-[160px_1fr] gap-4 px-4 py-3 text-sm">
                  <dt className="text-[var(--color-ink-muted)]">{property.name}</dt>
                  <dd className="min-w-0 text-[var(--color-ink)]">{formatDatabaseValue(page.properties[property.id])}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="rounded-xl border border-dashed border-[var(--color-line)] p-6 text-sm text-[var(--color-ink-muted)]">
            This row is opened with the osionos host page surface, not the embedded database modal.
          </div>
        </div>
      </aside>
    </div>
  );
};

function formatDatabaseValue(value: unknown): string {
  if (value == null || value === '') return 'Empty';
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'Empty';
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return value.toString();
  return 'Unsupported value';
}
