/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   WorkspaceSwitcher.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/11 05:03:33 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { lazy, Suspense, useRef, useState } from 'react';
import { ChevronDown, PanelLeftClose, PenSquare } from 'lucide-react';
import { IconValueView } from "@/shared/ui/atoms/IconValueView";
import { useUserStore } from '@/features/auth';

// Lazy + deep path (NOT the auth barrel): the account-switcher popover (~37KB)
// only mounts on click, so it must not be stapled to the warm entry chunk.
const UserSwitcherPanel = lazy(() =>
  import('@/features/auth/ui/UserSwitcherPanel').then((m) => ({ default: m.UserSwitcherPanel })),
);
import { usePageStore } from '@/store/usePageStore';
import { useUIStore } from '@/shared/config/uiStore';
import {
  getCollectionEmojiValue,
} from '@/shared/lib/markengine/uiCollectionAssets';
import { useWorkspaceConfigStore, workspaceConfigKey } from '@/shared/config/workspaceConfigStore';

interface Props {
  onNewPage?: () => void;
}

/**
 * The header button at the very top of the sidebar.
 * Shows: [avatar] [workspace name] [compose button] [chevron dropdown]
 * Matches osionos's exact layout: 32px height, 6px radius, 6px margin top, 8px margin inline.
 */
export const WorkspaceSwitcher: React.FC<Props> = ({ onNewPage }) => {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  const persona         = useUserStore(s => s.activePersona());
  const session         = useUserStore(s => s.activeSession());
  const jwt             = useUserStore(s => s.activePageJwt() ?? '');
  const activeWorkspace = useUserStore(s => s.activeWorkspace());
  const workspaceName   = activeWorkspace?.name ?? session?.privateWorkspaces[0]?.name ?? 'My Workspace';
  const addPage         = usePageStore(s => s.addPage);
  const openPage        = usePageStore(s => s.openPage);
  const setSidebarOpen  = useUIStore(s => s.setSidebarOpen);
  const renameWorkspace = useUserStore(s => s.renameWorkspace);
  const activeUserId    = useUserStore(s => s.activeUserId);
  // Icon precedence: durable workspace config (Settings → Workspace → Icon) → session record.
  const configIcon = useWorkspaceConfigStore(s =>
    activeUserId && activeWorkspace ? s.configs[workspaceConfigKey(activeUserId, activeWorkspace._id)]?.icon : undefined);
  const workspaceIcon = configIcon ?? activeWorkspace?.icon;
  const [renaming, setRenaming] = useState(false);
  const canRename = !!activeWorkspace && activeWorkspace.ownerId === activeUserId;

  function commitRename(value: string) {
    const name = value.trim();
    if (name && activeWorkspace && name !== activeWorkspace.name) renameWorkspace(activeWorkspace._id, name);
    setRenaming(false);
  }

  const firstWsId = activeWorkspace?._id ?? session?.privateWorkspaces[0]?._id ?? '';

  async function handleNewPage() {
    if (onNewPage) { onNewPage(); return; }
    if (!firstWsId) return;
    const page = await addPage(firstWsId, 'Untitled', jwt);
    if (page) openPage({ id: page._id, workspaceId: firstWsId, kind: 'page', title: page.title });
  }

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  React.useEffect(() => {
    if (open) setAnchorEl(anchorRef.current);
    else setAnchorEl(null);
  }, [open]);

  return (
    <div ref={anchorRef} className="relative mx-2 mt-1.5 mb-1.5">
      <div className="flex items-center h-8 w-full">
        {/* Workspace name (single-click opens switcher; double-click renames) */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => { if (!renaming) setOpen(o => !o); }}
          onKeyDown={(event) => { if (!renaming && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setOpen(o => !o); } }}
          className={[
            'flex items-center gap-2 flex-1 min-w-0 h-8 px-2 rounded-[6px]',
            'transition-colors duration-100 cursor-pointer select-none',
            open ? 'bg-[var(--osio-bg-muted)]' : 'hover:bg-[var(--osio-bg-hover)]',
          ].join(' ')}
        >
          {/* Avatar (rounded square, like osionos) */}
          <span className="flex items-center justify-center w-[22px] h-[22px] shrink-0 rounded text-base leading-none">
            <IconValueView
              value={workspaceIcon ?? persona?.emoji ?? getCollectionEmojiValue('package')}
              size={18}
            />
          </span>

          {renaming ? (
            <input
              autoFocus
              defaultValue={workspaceName}
              aria-label="Workspace name"
              onClick={(event) => event.stopPropagation()}
              onBlur={(event) => commitRename(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter') commitRename((event.target as HTMLInputElement).value);
                else if (event.key === 'Escape') setRenaming(false);
              }}
              className="flex-1 min-w-0 rounded px-1 bg-transparent text-base font-semibold text-[var(--osio-fg-default)] leading-5 outline-none ring-1 ring-[var(--osio-accent)]"
            />
          ) : (
            <span
              onDoubleClick={(event) => { if (canRename) { event.stopPropagation(); setRenaming(true); } }}
              title={canRename ? 'Double-click to rename' : undefined}
              className="flex-1 text-base font-semibold text-[var(--osio-fg-default)] truncate text-left leading-5"
            >
              {workspaceName}
            </span>
          )}
        </div>

        {/* Right-side buttons */}
        <div className="flex items-center gap-0.5 ml-auto">
          {/* New page / compose button */}
          <button
            type="button"
            onClick={handleNewPage}
            className={[
              'flex items-center justify-center w-7 h-7 rounded shrink-0',
              'text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]',
              'transition-colors duration-100 cursor-pointer',
            ].join(' ')}
            title="New page"
          >
            <PenSquare size={18} />
          </button>

          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className={[
              'flex items-center justify-center w-7 h-7 rounded shrink-0',
              'text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]',
              'transition-colors duration-100 cursor-pointer',
            ].join(' ')}
            title="Close sidebar"
          >
            <PanelLeftClose size={18} />
          </button>

          {/* Dropdown chevron */}
          <button
            type="button"
            aria-label="More workspace options"
            aria-expanded={open}
            onClick={() => setOpen(o => !o)}
            className={[
              'flex items-center justify-center w-6 h-7 rounded shrink-0',
              'text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]',
              'transition-all duration-100 cursor-pointer',
            ].join(' ')}
            title="More options"
          >
            <ChevronDown
              size={14}
              className={[
                'transition-transform duration-150',
                open ? 'rotate-180' : '',
              ].join(' ')}
            />
          </button>
        </div>
      </div>

      {open && (
        <Suspense fallback={null}>
          <UserSwitcherPanel onClose={() => setOpen(false)} anchorElement={anchorEl} />
        </Suspense>
      )}
    </div>
  );
};
