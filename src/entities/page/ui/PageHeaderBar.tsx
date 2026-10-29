/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageHeaderBar.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

import { usePageActions } from '@/entities/page';
import { runPageAction } from '@/entities/page/model/runPageAction';
import { canEditPage, usePageAccessContext } from '@/shared/lib/auth/pageAccess';
import { IconButton, useEscapeKey, useToastStore } from '@/shared/ui';
import { canTurnIntoDashboard } from '@/services/page-actions';
import { usePageStore } from '@/store/usePageStore';
import { openAssistantWith } from '@/features/chat/model/openAssistantWith';
import { MovePageModal } from '@/features/page-management/ui/MovePageModal';

import { PageBreadcrumbs } from './PageBreadcrumbs';
import { PageShareButton } from './PageShareButton';
import { PageEditToggle } from './PageEditToggle';
import { PageFavoriteButton } from './PageFavoriteButton';
import { PageCommentsButton } from '@/features/comments/ui/PageCommentsButton';
import { PageMenu } from './page-menu/PageMenu';

export interface PageHeaderBarProps {
  pageId: string;
  workspaceId: string;
}

function openPageActionsHome() {
  usePageStore.setState({ activePage: null, showTrash: false, navigationPath: [] });
}

export const PageHeaderBar: React.FC<PageHeaderBarProps> = ({ pageId, workspaceId }) => {
  const actions = usePageActions(pageId, workspaceId);
  const [configOpen, setConfigOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const pushToast = useToastStore((state) => state.push);
  const importInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeConfig = useCallback(() => setConfigOpen(false), []);
  // Notion's "Turn into wiki": only an ordinary page or a wiki can switch, not a
  // folder, an agent, a code file or Home.
  const pageSurface = usePageStore((state) => state.pageById(pageId)?.surface);
  const canToggleWiki = pageSurface === undefined || pageSurface === 'page' || pageSurface === 'wiki';
  const toggleWiki = useCallback(() => {
    usePageStore.getState().patchPage(pageId, { surface: pageSurface === 'wiki' ? undefined : 'wiki' });
    setConfigOpen(false);
  }, [pageId, pageSurface]);
  // "Turn into dashboard": an ordinary page, an agent or Home can become one.
  // A locked page is read-only and a viewer may not edit the body at all — the
  // store refuses that write too, the item just is not offered.
  const accessContext = usePageAccessContext();
  const canDashboard = actions.page
    ? canTurnIntoDashboard(actions.page, actions.config.locked) && canEditPage(actions.page, accessContext)
    : false;
  useEscapeKey(closeConfig, configOpen);
  // The Appearance submenu is portalled to the body so the scrolling menu
  // cannot clip it; a press there is still a press inside the menu.
  useEffect(() => {
    if (!configOpen) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      if (target?.closest?.('[data-page-menu-layer]')) return;
      closeConfig();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [closeConfig, configOpen]);

  function showActionError(message: string) {
    pushToast({ kind: 'error', title: message });
  }

  function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) runPageAction(actions.importFile(file), showActionError);
  }

  function openMoveTo() {
    setConfigOpen(false);
    setMoveOpen(true);
  }

  function openWithAssistant() {
    closeConfig();
    openAssistantWith({ text: '', pageId });
  }

  return (
    <div className="sticky top-0 z-[var(--osio-z-raised)] flex h-11 w-full min-w-0 items-center border-b border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)]">
      <div className="flex w-full min-w-0 items-center justify-between px-4">
        <div className="min-w-0 flex-1 overflow-hidden">
          <PageBreadcrumbs pageId={pageId} onOpenHome={openPageActionsHome} />
        </div>

        <div className="flex shrink-0 items-center gap-3 pl-4">
          <span className="hidden whitespace-nowrap text-sm text-[var(--osio-fg-subtle)] sm:inline">{actions.editedLabel}</span>
          <PageFavoriteButton pageId={pageId} />
          <PageCommentsButton pageId={pageId} />
          <PageEditToggle pageId={pageId} />
          <PageShareButton pageId={pageId} workspaceId={workspaceId} />
          <div className="relative">
            <IconButton ref={triggerRef} label="Open page configuration" onClick={() => setConfigOpen((open) => !open)}>
              <MoreHorizontal size={18} />
            </IconButton>
            {configOpen && (
              <div ref={menuRef} className="contents">
              <PageMenu
                actions={actions}
                pageSurface={pageSurface}
                canToggleWiki={canToggleWiki}
                toggleWiki={toggleWiki}
                canDashboard={canDashboard}
                onImport={() => { closeConfig(); importInputRef.current?.click(); }}
                onMoveTo={openMoveTo}
                onUseAI={openWithAssistant}
                onError={showActionError}
                onClose={closeConfig}
              />
              </div>
            )}
          </div>
        </div>
      </div>

      <input ref={importInputRef} type="file" accept=".json,.md,.markdown,.txt" className="hidden" onChange={handleImportFile} />
      {moveOpen && <MovePageModal sourcePageId={pageId} onClose={() => setMoveOpen(false)} />}
    </div>
  );
};
