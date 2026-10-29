/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DatabaseBlock.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 19:04:37 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/13 19:11:53 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';
import ReactDOM from 'react-dom';
import { ArrowLeft } from 'lucide-react';
// The object-database entry imports its own theme CSS, so the styles ride
// with whichever lazy chunk first pulls the component. Leaflet (map view)
// still belongs here: it only matters once a database actually renders.
import { ObjectDatabase, type ObjectDatabaseProps } from '@notion-db/object-database';
import 'leaflet/dist/leaflet.css';
import '@/app/styles/database-bridge.generated.css';
import '@/app/styles/database-overrides.css';

import type { Block } from '@/entities/block';
import type { PageEntry, PagePropertyEntry } from '@/entities/page';
import {
  normalizeMediaSource,
  resolveCollectionMediaAsset,
} from '@/shared/ui/assets/collectionMedia';
import { useUserStore } from '@/features/auth';
import {
  DEFAULT_OBJECT_DATABASE_ID,
  DEFAULT_OBJECT_DATABASE_VIEW_ID,
  useDatabaseStore,
} from '@/store/useDatabaseStore';
import { usePageStore } from '@/store/usePageStore';
import { useWorkspaceLayout } from '@/widgets/workspace-grid/model/workspaceLayout';
import { liveDatabaseTab } from '@/widgets/workspace-grid/model/layoutPersist';
import { derivePageState } from '@/store/pageStore.helpers';
import { getKnownDatabaseView, KNOWN_DATABASE_VIEWS } from '../model/databaseViewCatalog';
import { getKnownDatabaseAdapter } from '../model/knownDatabaseState';
import { getLiveDatabaseAdapter, isLiveDatabaseId } from '../model/liveDatabaseAdapter';
import { toRecordPageId } from '../model/recordPageId';
import {
  projectRecordProperties,
  recordPropertyEdits,
  type RecordValueResolver,
} from '../model/recordPageProperties';
import { HomeLiveGate } from './HomeLiveEmpty';
import { useHealedLiveDatabaseId } from '../model/useHealedLiveDatabaseId';
// Side effect: registers the account-wide data-source catalog with NDS (the
// Source picker). Lives here (not only the barrel) because lazyViews imports
// this file directly, bypassing index.ts.
import '../model/dataSourceProvider';
import { getObjectDatabaseAdapter, hasObjectDatabaseRemoteAdapter } from '../model/objectDatabaseAdapter';
import { createLiveSubItemsController } from '../model/liveSubItemsController';
import {
  isWorkspaceDatabaseId,
  isWorkspaceViewId,
  isHomeLiveDatabaseId,
  isHomeLiveViewId,
  RECENTS_DB_ID,
  TEMPLATES_DB_ID,
  TEMPLATES_GALLERY_VIEW,
} from '../model/workspaceDatabaseConstants';
import { getRecentsDatabaseAdapter } from '../model/recentsDatabaseState';
import { getTemplatesDatabaseAdapter } from '../model/templatesDatabaseState';
import { withRecordLimit } from '../model/recordLimitAdapter';
import { useDatabaseHostAdapters } from '../model/databaseHostAdapters';
import { rememberDatabaseWorkspace } from '../model/objectDatabaseWorkspaces';
import { WorkspaceDatabaseBlock, WorkspaceRecordPeek } from './WorkspaceDatabaseBlock';
import { RecordSubItemsPanel } from './RecordSubItemsPanel';
import { SysDatabaseBlock } from './SysDatabaseBlock';
import { LibraryDatabaseBlock } from './LibraryDatabaseBlock';
import { LIBRARY_DB_ID } from '../model/libraryDatabaseModel';
import { isSysDatabaseId } from '../model/sysDataSources';
import './databaseBlockEmbed.css';
import { databaseShellClass } from '../model/databaseShellClass';

// Async boundary: the full osionos page (and its editor tree) loads only when
// a database row is opened — keeping the database view chunk free of the
// editor (same code-split discipline as lazyViews.tsx).
const OsionosPage = React.lazy(() =>
  import('@/pages/notion-page/ui/NotionPage').then((m) => ({ default: m.OsionosPage })),
);

/** ObjectDatabase with the app's host integrations pre-wired: workspace people
 *  for person cells and "+ Invite" opening the Discover surface. `readOnlyRecords`
 *  marks a source that drops new rows (your account data, recents, templates). */
const HostedObjectDatabase: React.FC<ObjectDatabaseProps & { readOnlyRecords?: boolean }> = ({ readOnlyRecords, ...props }) => {
  const hostAdapters = useDatabaseHostAdapters();
  const adapters = React.useMemo(
    () => (readOnlyRecords ? { ...hostAdapters, readOnlyRecords } : hostAdapters),
    [hostAdapters, readOnlyRecords],
  );
  return <ObjectDatabase {...props} hostAdapters={adapters} />;
};

const INLINE_KNOWN_DATABASE_LOAD_LIMIT = 8;

interface DatabaseBlockProps {
  databaseId?: string;
  initialViewId?: string;
  mode?: 'inline' | 'full';
  /** Cap on records an inline embed displays (its height follows this count). */
  recordLimit?: number;
}

export const DatabaseBlock: React.FC<DatabaseBlockProps> = ({
  databaseId,
  initialViewId,
  mode = 'inline',
  recordLimit,
}) => {
  // Inline embeds fall back to a compact default so a large database never
  // overflows the page — but ONLY as a fallback for a view with no Limit set:
  // an explicit per-view Limit (view settings) always wins and persists. Full
  // -page tabs stay uncapped. `recordLimit` (block-level) is a separate hard cap.
  const defaultLoadLimit = mode === 'inline' ? INLINE_KNOWN_DATABASE_LOAD_LIMIT : undefined;
  const resolvedMode = mode === 'full' ? 'page' : 'inline';
  // An orphaned live source (a mount re-registered under a new id — e.g. a
  // dashboard authored before a re-seed) heals to the current accessible mount
  // that serves the same table, rewriting its viewId in lockstep; healthy ids
  // pass through untouched.
  const { databaseId: healedDatabaseId, viewId: healedViewId } = useHealedLiveDatabaseId(databaseId, initialViewId);
  const resolvedDatabaseId = healedDatabaseId ?? DEFAULT_OBJECT_DATABASE_ID;
  const resolvedInitialView = healedViewId
    ?? (resolvedDatabaseId === DEFAULT_OBJECT_DATABASE_ID ? DEFAULT_OBJECT_DATABASE_VIEW_ID : undefined);
  const knownViewId = resolvedInitialView && getKnownDatabaseView(resolvedInitialView)
    ? resolvedInitialView
    : KNOWN_DATABASE_VIEWS.find((viewDefinition) => viewDefinition.databaseId === resolvedDatabaseId)?.id;
  // Notion collection-view header seams: the inline title/"Open as full page"
  // button open the database's ORIGIN — a kind:"database" tab (pageId == the
  // database id, so re-opening focuses instead of duplicating).
  const createdEntry = useDatabaseStore((s) => s.created.find((entry) => entry.id === resolvedDatabaseId));
  const openFullPage = React.useCallback(
    (target: { databaseId: string; viewId?: string; name?: string }) => {
      useWorkspaceLayout.getState().openTab({
        ...liveDatabaseTab(target.databaseId, target.name ?? 'Database'),
        viewId: target.viewId,
      });
    },
    [],
  );
  const handleDatabaseRenamed = React.useCallback((renamedId: string, name: string) => {
    useDatabaseStore.getState().renameCreatedDatabase(renamedId, name);
  }, []);
  const onOpenFullPage = mode === 'inline' ? openFullPage : undefined;
  const knownDatabaseAdapter = React.useMemo(
    () => getKnownDatabaseAdapter({ defaultLoadLimit, recordCap: recordLimit }),
    [defaultLoadLimit, recordLimit],
  );
  const fallbackDatabaseAdapter = React.useMemo(
    () => getKnownDatabaseAdapter({ defaultLoadLimit, recordCap: recordLimit }),
    [defaultLoadLimit, recordLimit],
  );
  const remoteDatabaseAdapter = React.useMemo(() => withRecordLimit(getObjectDatabaseAdapter(), recordLimit), [recordLimit]);
  const liveDatabaseAdapter = React.useMemo(() => {
    const live = isLiveDatabaseId(resolvedDatabaseId) ? getLiveDatabaseAdapter(resolvedDatabaseId) : null;
    return live ? withRecordLimit(live, recordLimit) : null;
  }, [resolvedDatabaseId, recordLimit]);
  const renderPage = React.useCallback<NonNullable<ObjectDatabaseProps['renderPage']>>(
    (pageId, state, onClose, openIn) => (
      <DatabaseObjectPage pageId={pageId} state={state} onClose={onClose} openIn={openIn} />
    ),
    [],
  );
  // Home live carousels: records are real osionos pages, so opening a card
  // peeks the existing page (no synthetic record-page creation).
  const renderHomePeek = React.useCallback<NonNullable<ObjectDatabaseProps['renderPage']>>(
    (pageId, _state, onClose) => <WorkspaceRecordPeek pageId={pageId} onClose={onClose} />,
    [],
  );
  const renderTemplatesPeek = React.useCallback<NonNullable<ObjectDatabaseProps['renderPage']>>(
    (pageId, _state, onClose) => (
      <WorkspaceRecordPeek
        pageId={pageId}
        onClose={onClose}
        action={{
          label: "Use template",
          onClick: () => {
            const workspaceId = useUserStore.getState().activeWorkspace()?._id;
            const jwt = useUserStore.getState().activePageJwt() ?? "";
            if (workspaceId) {
              void usePageStore.getState().createPageFromTemplate(pageId, workspaceId, jwt);
              onClose();
            }
          },
        }}
      />
    ),
    [],
  );
  // Notion-style row sub-items: every live record expands inline to its child
  // records + note sub-items as column-aligned rows. Stable identity so the
  // table's sub-items context never churns.
  const liveSubItems = React.useMemo(() => createLiveSubItemsController(), []);

  if (liveDatabaseAdapter) {
    return (
      <div
        className={databaseShellClass(mode)}
        data-database-id={resolvedDatabaseId}
        data-database-view-id={resolvedInitialView}
      >
        <HostedObjectDatabase
          adapter={liveDatabaseAdapter}
          databaseId={resolvedDatabaseId}
          initialView={resolvedInitialView}
          mode={resolvedMode}
          renderPage={renderPage}
          subItems={liveSubItems}
          className={mode === 'full' ? 'h-full' : undefined}
          // Full pages get the full chrome — the view tabs are how the curated
          // preset views (boards/timelines/dashboards/calendars) are reached.
          // Inline embeds get the Notion collection-view header (title link,
          // tabs, collapse) via the 'inline' chrome.
          chrome={mode === 'full' ? 'full' : 'inline'}
          onOpenFullPage={onOpenFullPage}
          onDatabaseRenamed={handleDatabaseRenamed}
        />
      </div>
    );
  }

  // `sys:` = the caller's own data, read-only. Before the Home and known/fallback
  // branches, so an unknown or unreachable source never shows the demo seed.
  if (isSysDatabaseId(resolvedDatabaseId)) {
    return (
      <SysDatabaseBlock
        databaseId={resolvedDatabaseId}
        initialViewId={resolvedInitialView}
        mode={mode}
        recordLimit={recordLimit}
        renderDatabase={({ adapter, initialView, renderPage: peek, key }) => (
          <HostedObjectDatabase
            key={key}
            adapter={adapter}
            databaseId={resolvedDatabaseId}
            initialView={initialView}
            mode={resolvedMode}
            renderPage={peek}
            className={mode === 'full' ? 'h-full' : undefined}
            chrome={mode === 'full' ? 'full' : 'inline'}
            readOnlyRecords
          />
        )}
      />
    );
  }

  // The Library: every workspace item as one read-only database; rows open the
  // item itself and expand to its child pages.
  if (resolvedDatabaseId === LIBRARY_DB_ID) {
    return (
      <LibraryDatabaseBlock
        initialViewId={resolvedInitialView}
        mode={mode}
        renderDatabase={({ adapter, initialView, renderPage: open, subItems }) => (
          <HostedObjectDatabase
            adapter={adapter}
            databaseId={LIBRARY_DB_ID}
            initialView={initialView}
            mode={resolvedMode}
            renderPage={open}
            subItems={subItems}
            className={mode === 'full' ? 'h-full' : undefined}
            chrome="inline"
            readOnlyRecords
          />
        )}
      />
    );
  }

  // Home live carousels (Recently visited / Templates): their records are real
  // osionos pages, so the card-open seam reuses WorkspaceRecordPeek (open the
  // existing page) exactly like the workspace databases.
  if (isHomeLiveDatabaseId(resolvedDatabaseId) || isHomeLiveViewId(resolvedInitialView)) {
    const isTemplates = resolvedDatabaseId === TEMPLATES_DB_ID || resolvedInitialView === TEMPLATES_GALLERY_VIEW;
    return (
      <div
        className={databaseShellClass(mode)}
        data-database-id={resolvedDatabaseId}
        data-database-view-id={resolvedInitialView}
      >
        <HomeLiveGate kind={isTemplates ? 'templates' : 'recents'}>
          <HostedObjectDatabase
            adapter={isTemplates ? getTemplatesDatabaseAdapter() : getRecentsDatabaseAdapter()}
            databaseId={isTemplates ? TEMPLATES_DB_ID : RECENTS_DB_ID}
            initialView={resolvedInitialView}
            mode={resolvedMode}
            renderPage={isTemplates ? renderTemplatesPeek : renderHomePeek}
            className={mode === 'full' ? 'h-full' : undefined}
            chrome="single-view"
            readOnlyRecords
          />
        </HomeLiveGate>
      </div>
    );
  }

  if (isWorkspaceDatabaseId(resolvedDatabaseId) || isWorkspaceViewId(resolvedInitialView)) {
    return (
      <WorkspaceDatabaseBlock
        databaseId={resolvedDatabaseId}
        initialViewId={resolvedInitialView}
        mode={mode}
      />
    );
  }

  if (knownViewId) {
    return (
      <div
        className={databaseShellClass(mode)}
        data-database-id={resolvedDatabaseId}
        data-database-view-id={knownViewId}
      >
        <HostedObjectDatabase
          adapter={knownDatabaseAdapter}
          databaseId={resolvedDatabaseId}
          initialView={knownViewId}
          mode={resolvedMode}
          renderPage={renderPage}
          className={mode === 'full' ? 'h-full' : undefined}
          chrome={mode === 'full' ? 'full' : 'inline'}
          onOpenFullPage={onOpenFullPage}
          onDatabaseRenamed={handleDatabaseRenamed}
        />
      </div>
    );
  }

  return (
    <div
      className={databaseShellClass(mode)}
      data-database-id={resolvedDatabaseId}
      data-database-view-id={resolvedInitialView}
    >
      <HostedObjectDatabase
        adapter={hasObjectDatabaseRemoteAdapter() && remoteDatabaseAdapter ? remoteDatabaseAdapter : fallbackDatabaseAdapter}
        databaseId={resolvedDatabaseId}
        initialView={resolvedInitialView}
        mode={resolvedMode}
        renderPage={renderPage}
        className={mode === 'full' ? 'h-full' : undefined}
        // User-created databases land here: 'full' at the origin tab (editable
        // h1 + db switcher), Notion inline header inside documents.
        chrome={mode === 'full' ? 'full' : 'inline'}
        databaseName={createdEntry?.name}
        onOpenFullPage={onOpenFullPage}
        onDatabaseRenamed={handleDatabaseRenamed}
      />
    </div>
  );
};

type DatabaseObjectPageProps = {
  pageId: Parameters<NonNullable<ObjectDatabaseProps['renderPage']>>[0];
  state: Parameters<NonNullable<ObjectDatabaseProps['renderPage']>>[1];
  onClose: Parameters<NonNullable<ObjectDatabaseProps['renderPage']>>[2];
  openIn?: Parameters<NonNullable<ObjectDatabaseProps['renderPage']>>[3];
};

/** Per-mode layout for the record surface (the view's "Open pages in" setting). */
const OPEN_IN_LAYOUT = {
  side_peek: {
    container: 'flex justify-end',
    panel: 'h-full w-full max-w-5xl border-l border-[var(--osio-border-default)]',
  },
  center_peek: {
    container: 'flex items-center justify-center p-6',
    // Definite height (not max-h): .osionos-page is container-type:size, so
    // inside an auto-height panel it collapses to zero and only the header shows.
    panel: 'h-[85vh] w-full max-w-4xl rounded-xl border border-[var(--osio-border-default)]',
  },
  full_page: {
    container: 'flex',
    panel: 'h-full w-full',
  },
} as const;

const DatabaseObjectPage: React.FC<DatabaseObjectPageProps> = ({ pageId, state, onClose, openIn }) => {
  // Engine row ids are UUIDs; a UUID-shaped projection id is published to /api/pages and 404s.
  const recordPageId = toRecordPageId(pageId);
  const databasePage = state.pages[pageId];
  const database = databasePage ? state.databases[databasePage.databaseId] : null;
  const title = databasePage ? String(state.getPageTitle(databasePage) || 'Untitled') : 'Page unavailable';
  const activePage = usePageStore(s => s.activePage);
  const osionosPage = usePageStore(s => s.pageById(recordPageId));
  const activeUserId = useUserStore(s => s.activeUserId);
  const activeWorkspace = useUserStore(s => s.activeWorkspace());
  const workspaceId = activePage?.workspaceId ?? activeWorkspace?._id;

  React.useEffect(() => {
    if (!databasePage || !workspaceId) return;
    // Opening a record names the database's workspace for the next push (C138).
    rememberDatabaseWorkspace(databasePage.databaseId, workspaceId);
    const resolver: RecordValueResolver = {
      formula: (property) => state.resolveFormula(
        databasePage.databaseId,
        databasePage,
        property.formulaConfig?.expression ?? '',
      ),
      rollup: (property) => state.resolveRollup(
        databasePage.databaseId,
        databasePage,
        property.id,
      ),
    };
    const nextEntry: PageEntry = {
      _id: recordPageId,
      title,
      icon: databasePage.icon,
      cover: databasePage.cover,
      updatedAt: databasePage.updatedAt,
      workspaceId,
      ownerId: activeUserId || null,
      visibility: 'private',
      collaborators: [],
      parentPageId: activePage?.id ?? '__database_rows__',
      databaseId: databasePage.databaseId,
      archivedAt: null,
      properties: database ? projectRecordProperties(database, databasePage, resolver) : [],
      content: toOsionosBlocks(databasePage.content),
    };

    usePageStore.setState((current) => derivePageState(
      upsertOsionosDatabasePage(current.pages, workspaceId, nextEntry),
      current.pageIdsByWorkspace,
    ));
  }, [activePage?.id, activeUserId, database, databasePage, recordPageId, state, title, workspaceId]);

  // The engine row can change while this page is open (a board drag): the
  // projection effect's setState lands a render later, so reading the row from
  // deps would compare NEW raw values with OLD osionos ones and revert the drag.
  // Fire only when the osionos properties themselves change; read the row from refs.
  const engineRef = React.useRef({ database, databasePage });
  // Keep the ref current AFTER commit: lint forbids writing it during render,
  // and that ordering still guarantees the write-back below sees this render's row.
  React.useEffect(() => {
    engineRef.current = { database, databasePage };
  });
  const osionosPropertiesKey = JSON.stringify(osionosPage?.properties ?? null);
  const updatePageProperty = state.updatePageProperty;

  React.useEffect(() => {
    const { database: engineDatabase, databasePage: enginePage } = engineRef.current;
    if (!engineDatabase || !enginePage) return;
    const entries = JSON.parse(osionosPropertiesKey) as PagePropertyEntry[] | null;
    if (!entries) return;
    for (const edit of recordPropertyEdits(engineDatabase, enginePage, entries)) {
      updatePageProperty(pageId, edit.propertyId, edit.value);
    }
  }, [osionosPropertiesKey, pageId, updatePageProperty]);

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

  // Icon/cover write-back: the record page header edits the OSIONOS entry
  // (patchPage) — mirror it into the engine page so gallery/board cards show
  // it. Covers resolve to a displayable value (URL or CSS gradient) here at
  // the boundary; the engine knows nothing about ui-collection media refs.
  const resolvedCover = osionosPage?.cover === undefined
    ? undefined
    : resolveCoverForEngine(osionosPage.cover);
  const osionosIcon = osionosPage?.icon;

  React.useEffect(() => {
    if (!databasePage || !osionosPage) return;
    const nextIcon = osionosIcon ?? databasePage.icon;
    if (resolvedCover !== databasePage.cover || nextIcon !== databasePage.icon) {
      state.updatePageMeta(pageId, { icon: nextIcon, cover: resolvedCover });
    }
  }, [databasePage, osionosIcon, osionosPage, pageId, resolvedCover, state]);

  const layout = OPEN_IN_LAYOUT[openIn ?? 'side_peek'] ?? OPEN_IN_LAYOUT.side_peek;

  // Escape always closes the record surface — in full_page mode the overlay
  // covers the app chrome, so the header breadcrumb/Close must not be the
  // only way back.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return ReactDOM.createPortal(
    <div className={`fixed inset-0 z-[var(--osio-z-modal)] bg-[var(--osio-overlay)] ${layout.container}`}>
      <button
        type="button"
        aria-label="Close database page"
        className="fixed inset-0 cursor-default bg-transparent"
        onClick={onClose}
      />
      <aside
        data-open-in={openIn ?? 'side_peek'}
        className={`relative z-[var(--osio-z-modal)] overflow-auto bg-[var(--osio-bg-surface)] shadow-[var(--osio-shadow-modal)] ${layout.panel}`}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            title="Back to database"
            className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium uppercase tracking-wide text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
          >
            <ArrowLeft size={14} className="shrink-0" />
            <span className="truncate">{database?.name ?? 'Database page'}</span>
            <span className="shrink-0 text-[var(--osio-fg-subtle)]">· osionos page</span>
          </button>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-sm text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        {osionosPage ? (
          <React.Suspense
            fallback={(
              <div className="mx-auto max-w-3xl px-10 py-10 text-sm text-[var(--osio-fg-muted)]">
                Loading page…
              </div>
            )}
          >
            <OsionosPage pageId={recordPageId} chrome="bar" />
          </React.Suspense>
        ) : (
          <div className="mx-auto max-w-3xl px-10 py-10 text-sm text-[var(--osio-fg-muted)]">
            Page unavailable
          </div>
        )}
        <RecordSubItemsPanel recordPageId={pageId} onOpenChild={onClose} />
      </aside>
    </div>,
    document.body,
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
    // Icon/cover are edited on the OSIONOS entry (page header) — the engine
    // side must never clobber them with its (possibly empty) copies.
    icon: entry.icon || nextEntry.icon,
    cover: entry.cover ?? nextEntry.cover,
    properties: nextEntry.properties,
    content: entry.content?.length ? entry.content : nextEntry.content,
  };
}

/** Cover values can be a URL, a CSS gradient, or a ui-collection media ref —
 *  the engine renders only URLs/gradients, so refs resolve here. */
function resolveCoverForEngine(cover: string): string {
  if (cover.startsWith('linear-gradient') || cover.startsWith('radial-gradient')) return cover;
  const resolved = resolveCollectionMediaAsset(cover);
  return normalizeMediaSource(resolved?.url ?? cover) ?? cover;
}
