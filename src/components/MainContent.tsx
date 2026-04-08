/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MainContent.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/04 23:30:46 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { Suspense, useCallback, useRef, useEffect } from 'react';
import { Plus, FileText } from 'lucide-react';

import { ErrorBoundary }  from '@src/components/ErrorBoundary';
import { DatabaseBlock }  from '@src/components/DatabaseBlock';

import { usePageStore }  from '../store/usePageStore';
import { useUserStore }  from '../store/useUserStore';
import { PlaygroundPageEditor } from './PlaygroundPageEditor';

/**
 * Renders the right-hand content panel.
 * Shows home splash, DatabaseBlock, or block-based page view based on `activePage`.
 */
export const MainContent: React.FC = () => {
  const activePage = usePageStore(s => s.activePage);
  const addPage    = usePageStore(s => s.addPage);
  const openPage   = usePageStore(s => s.openPage);
  const pageById   = usePageStore(s => s.pageById);
  const session    = useUserStore(s => s.activeSession());
  const persona    = useUserStore(s => s.activePersona());

  const jwt       = session?.accessToken ?? '';
  const firstWsId = session?.privateWorkspaces[0]?._id ?? '';


  if (!activePage) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 h-full bg-[var(--color-surface-primary)]">
        <p className="text-4xl">{persona?.emoji ?? '🏠'}</p>
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


  const fullPage = pageById(activePage.id);

  return (
    <div className="flex-1 flex flex-col h-full overflow-auto bg-[var(--color-surface-primary)]">
      {/* Page header */}
      <div className="max-w-3xl w-full mx-auto px-14 pt-20 pb-4">
        {activePage.icon
          ? <div className="text-5xl mb-3">{activePage.icon}</div>
          : <div className="text-5xl mb-3 text-[var(--color-ink-faint)]"><FileText size={48} /></div>
        }
        <EditableTitle pageId={activePage.id} title={fullPage?.title ?? activePage.title ?? ''} />
      </div>

      {/* Page body — editable blocks */}
      <div className="max-w-3xl w-full mx-auto px-14 pb-20">
        <PlaygroundPageEditor pageId={activePage.id} />
      </div>
    </div>
  );
};


const EditableTitle: React.FC<{ pageId: string; title: string }> = ({ pageId, title }) => {
  const updatePageTitle = usePageStore(s => s.updatePageTitle);
  const openPage        = usePageStore(s => s.openPage);
  const activePage      = usePageStore(s => s.activePage);
  const ref = useRef<HTMLHeadingElement>(null);

  // Sync content once on mount and if title changes externally
  useEffect(() => {
    if (ref.current && ref.current.textContent !== title) {
      ref.current.textContent = title;
    }
  }, [title]);

  const handleInput = useCallback(() => {
    if (!ref.current) return;
    const newTitle = ref.current.textContent ?? '';
    updatePageTitle(pageId, newTitle);
    // Also update the active page title in the top bar
    if (activePage?.id === pageId) {
      openPage({ ...activePage, title: newTitle });
    }
  }, [pageId, updatePageTitle, activePage, openPage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Move focus to the first block
      const firstBlock = document.querySelector('[data-block-id] [contenteditable]') as HTMLElement;
      firstBlock?.focus();
    }
  }, []);

  return (
    <h1 // NOSONAR - contentEditable page title requires non-semantic roles
      ref={ref}
      role="textbox" // NOSONAR - contentEditable heading needs textbox role
      aria-label="Page title"
      contentEditable
      suppressContentEditableWarning
      spellCheck
      className="text-4xl font-bold text-[var(--color-ink)] outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-[var(--color-ink-faint)]"
      data-placeholder="Untitled"
      onInput={handleInput}
      onKeyDown={handleKeyDown}
    />
  );
};


const LoadingPane: React.FC = () => (
  <div className="flex-1 flex items-center justify-center h-full">
    <div className="animate-spin w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full" />
  </div>
);
