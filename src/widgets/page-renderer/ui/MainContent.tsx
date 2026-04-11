/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MainContent.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/08 19:47:31 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { Suspense, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { AssetRenderer } from '@univers42/ui-collection';

import { ErrorBoundary }  from '@/shared/ui';
import {
  getCollectionEmojiValue,
} from '@/shared/lib/uiCollectionAssets';
import { DatabaseBlock }  from '@/widgets/database-view';
import { NotionPage }     from '@/pages/notion-page';

import { usePageStore }  from '@/store/usePageStore';
import { useUserStore }  from '@/features/auth';

/**
 * Renders the right-hand content panel.
 * Shows home splash, DatabaseBlock, or the Notion-style page view.
 */
export const MainContent: React.FC = () => {
  const activePage = usePageStore(s => s.activePage);
  const pageById = usePageStore(s => s.pageById);
  const fetchPageContent = usePageStore(s => s.fetchPageContent);
  const addPage    = usePageStore(s => s.addPage);
  const openPage   = usePageStore(s => s.openPage);
  const session    = useUserStore(s => s.activeSession());
  const persona    = useUserStore(s => s.activePersona());

  const jwt       = session?.accessToken ?? '';
  const firstWsId = session?.privateWorkspaces[0]?._id ?? '';

  useEffect(() => {
    if (!activePage || activePage?.kind !== 'page' || !jwt) return;
    const page = pageById(activePage.id);
    if (!page) {
      fetchPageContent(activePage.id, jwt);
    }
  }, [activePage, jwt, pageById, fetchPageContent]);

  /* ── Home splash (no page selected) ────────────────────────────── */
  if (!activePage) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 h-full bg-[var(--color-surface-primary)]">
        <AssetRenderer
          value={persona?.emoji ?? getCollectionEmojiValue('party')}
          size={40}
        />
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[var(--color-ink)] mb-1">
            {persona?.name ?? 'Welcome'}
          </h1>
          <p className="text-sm text-[var(--color-ink-muted)]">
            {session?.privateWorkspaces[0]?.name ?? 'Your workspace'} is ready.
          </p>
        </div>
        <button
          type="button"
          disabled={!firstWsId}
          className={[
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium',
            'bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          ].join(' ')}
          onClick={async () => {
            if (!firstWsId) return;
            const p = await addPage(firstWsId, 'Untitled', jwt);
            if (p) openPage({ id: p._id, workspaceId: firstWsId, kind: 'page', title: p.title });
          }}
        >
          <Plus size={16} />
          New page
        </button>
      </div>
    );
  }

  /* ── Database view ─────────────────────────────────────────────── */
  if (activePage.kind === 'database') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingPane />}>
          <div className="flex-1 h-full overflow-auto bg-[var(--color-surface-primary)]">
            <DatabaseBlock
              databaseId={activePage.id}
              mode="full"
            />
          </div>
        </Suspense>
      </ErrorBoundary>
    );
  }

  /* ── Page view — Notion-style layout ───────────────────────────── */
  return (
    <div className="flex-1 h-full overflow-hidden">
      <NotionPage pageId={activePage.id} />
    </div>
  );
};

const LoadingPane: React.FC = () => (
  <div className="flex-1 flex items-center justify-center h-full">
    <div className="animate-spin w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full" />
  </div>
);
