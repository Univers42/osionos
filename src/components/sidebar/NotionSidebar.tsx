/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   NotionSidebar.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/05 01:31:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useState } from 'react';

import { useUserStore }  from '../../store/useUserStore';
import { usePageStore }  from '../../store/usePageStore';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { SidebarTopNav }     from './SidebarTopNav';
import { SidebarPageTree }   from './SidebarPageTree';
import { SidebarFooter }     from './SidebarFooter';

interface Props {
  onOpenHome?:     () => void;
  onOpenSettings?: () => void;
}

/** Renders the 275px Notion-style sidebar with navigation, page tree, and user switching. */
export const NotionSidebar: React.FC<Props> = ({ onOpenHome, onOpenSettings }) => {
  const session        = useUserStore(s => s.activeSession());
  const _persona       = useUserStore(s => s.activePersona());
  const activePage     = usePageStore(s => s.activePage);
  const recents        = usePageStore(s => s.recents);
  const fetchPages     = usePageStore(s => s.fetchPages);
  const openPage       = usePageStore(s => s.openPage);
  const addPage        = usePageStore(s => s.addPage);
  const pagesForWs     = usePageStore(s => s.pagesForWorkspace);

  const [showInviteCTA, setShowInviteCTA] = useState(true);

  const jwt = session?.accessToken ?? '';

  const privateWorkspaces = useMemo(() => session?.privateWorkspaces ?? [], [session?.privateWorkspaces]);
  const sharedWorkspaces  = useMemo(() => session?.sharedWorkspaces  ?? [], [session?.sharedWorkspaces]);

  // Fetch pages whenever the active user's workspaces change
  useEffect(() => {
    const allWs = [...privateWorkspaces, ...sharedWorkspaces];
    for (const ws of allWs) {
      if (jwt) fetchPages(ws._id, jwt);
    }
  }, [privateWorkspaces, sharedWorkspaces, jwt, fetchPages]);


  function handleAddToWorkspace(wsId: string) {
    addPage(wsId, 'Untitled', jwt).then(page => {
      if (page) openPage({ id: page._id, workspaceId: wsId, kind: 'page', title: page.title });
    });
  }


  return (
    <aside
      className="w-[275px] h-full flex flex-col shrink-0 overflow-hidden bg-[var(--color-surface-secondary)]"
      style={{ boxShadow: 'inset -1px 0 0 0 var(--color-line)' }}
    >
      <WorkspaceSwitcher />

      <SidebarTopNav isHomeActive={activePage === null} onOpenHome={onOpenHome} />

      <div className="h-px w-full shrink-0 -mt-px z-[99]" style={{ boxShadow: 'transparent 0px 0px 0px', transition: 'box-shadow 300ms' }} />

      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 pt-1.5 pb-5">
        <SidebarPageTree
          recents={recents}
          activePage={activePage}
          openPage={openPage}
          privateWorkspaces={privateWorkspaces}
          sharedWorkspaces={sharedWorkspaces}
          pagesForWs={pagesForWs}
          jwt={jwt}
          onAddToWorkspace={handleAddToWorkspace}
        />
      </nav>

      <SidebarFooter
        onOpenSettings={onOpenSettings}
        showInviteCTA={showInviteCTA}
        onDismissInvite={() => setShowInviteCTA(false)}
      />
    </aside>
  );
};
