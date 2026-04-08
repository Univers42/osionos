/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   WorkspaceSwitcher.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/04 14:03:44 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from 'react';
import { ChevronDown, PenSquare } from 'lucide-react';
import { useUserStore } from '../../store/useUserStore';
import { usePageStore } from '../../store/usePageStore';
import { UserSwitcherPanel } from './UserSwitcherPanel';

interface Props {
  onNewPage?: () => void;
}

/**
 * The header button at the very top of the sidebar.
 * Shows: [avatar] [workspace name] [compose button] [chevron dropdown]
 * Matches Notion's exact layout: 32px height, 6px radius, 6px margin top, 8px margin inline.
 */
export const WorkspaceSwitcher: React.FC<Props> = ({ onNewPage }) => {
  const [open, setOpen] = useState(false);

  const persona         = useUserStore(s => s.activePersona());
  const session         = useUserStore(s => s.activeSession());
  const workspaceName   = session?.privateWorkspaces[0]?.name ?? 'My Workspace';
  const addPage         = usePageStore(s => s.addPage);
  const openPage        = usePageStore(s => s.openPage);

  const jwt       = session?.accessToken ?? '';
  const firstWsId = session?.privateWorkspaces[0]?._id ?? '';

  async function handleNewPage() {
    if (onNewPage) { onNewPage(); return; }
    if (!firstWsId) return;
    const page = await addPage(firstWsId, 'Untitled', jwt);
    if (page) openPage({ id: page._id, workspaceId: firstWsId, kind: 'page', title: page.title });
  }

  return (
    <div className="relative mx-2 mt-1.5 mb-1.5">
      <div className="flex items-center h-8 w-full">
        {/* Workspace name button (opens switcher) */}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className={[
            'flex items-center gap-2 flex-1 min-w-0 h-8 px-2 rounded-[6px]',
            'transition-colors duration-100 cursor-pointer select-none',
            open
              ? 'bg-[var(--color-surface-tertiary)]'
              : 'hover:bg-[var(--color-surface-hover)]',
          ].join(' ')}
        >
          {/* Avatar (rounded square, like Notion) */}
          <span className="flex items-center justify-center w-[22px] h-[22px] shrink-0 rounded text-base leading-none">
            {persona?.emoji ?? '⬜'}
          </span>

          <span className="flex-1 text-[14px] font-semibold text-[var(--color-ink)] truncate text-left leading-5">
            {workspaceName}
          </span>
        </button>

        {/* Right-side buttons */}
        <div className="flex items-center gap-0.5 ml-auto">
          {/* New page / compose button */}
          <button
            type="button"
            onClick={handleNewPage}
            className={[
              'flex items-center justify-center w-7 h-7 rounded shrink-0',
              'text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)]',
              'transition-colors duration-100 cursor-pointer',
            ].join(' ')}
            title="New page"
          >
            <PenSquare size={18} />
          </button>

          {/* Dropdown chevron */}
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className={[
              'flex items-center justify-center w-4 h-7 rounded shrink-0',
              'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]',
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

      {open && <UserSwitcherPanel onClose={() => setOpen(false)} />}
    </div>
  );
};
