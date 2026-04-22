/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   Sidebar.tsx                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/11 15:00:00 by gemini-cli       ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useState } from "react";

import { useUserStore } from "@/features/auth";
import { usePageStore } from "@/store/usePageStore";
import { useUIStore } from "@/shared/config/uiStore";
import { WorkspaceSwitcher } from "@/features/auth";
import { SidebarTopNav } from "./SidebarTopNav";
import { SidebarPageTree } from "./SidebarPageTree";
import { SidebarFooter } from "./SidebarFooter";

import styles from "./Sidebar.module.scss";

interface Props {
  onOpenHome?: () => void;
  onOpenSettings?: () => void;
  onOpenTrash?: () => void;
}

/** Renders the Notion-style sidebar with navigation, page tree, and user switching. */
export const Sidebar: React.FC<Props> = ({
  onOpenHome,
  onOpenSettings,
  onOpenTrash,
}) => {
  const session = useUserStore((s) => s.activeSession());
  const activePage = usePageStore((s) => s.activePage);
  const recents = usePageStore((s) => s.recents);
  const fetchPages = usePageStore((s) => s.fetchPages);
  const openPage = usePageStore((s) => s.openPage);
  const addPage = usePageStore((s) => s.addPage);
  const pagesForWs = usePageStore((s) => s.pagesForWorkspace);

  const isSidebarOpen = useUIStore((s) => s.isSidebarOpen);

  const [showInviteCTA, setShowInviteCTA] = useState(true);

  const jwt = session?.accessToken ?? "";

  const privateWorkspaces = useMemo(
    () => session?.privateWorkspaces ?? [],
    [session?.privateWorkspaces],
  );
  const sharedWorkspaces = useMemo(
    () => session?.sharedWorkspaces ?? [],
    [session?.sharedWorkspaces],
  );

  // Fetch pages whenever the active user's workspaces change
  useEffect(() => {
    const allWs = [...privateWorkspaces, ...sharedWorkspaces];
    for (const ws of allWs) {
      if (jwt) fetchPages(ws._id, jwt);
    }
  }, [privateWorkspaces, sharedWorkspaces, jwt, fetchPages]);

  function handleAddToWorkspace(wsId: string) {
    addPage(wsId, "Untitled", jwt).then((page) => {
      if (page)
        openPage({
          id: page._id,
          workspaceId: wsId,
          kind: "page",
          title: page.title,
        });
    });
  }

  return (
    <aside
      className={[
        styles.sidebar,
        !isSidebarOpen ? styles.sidebarClosed : "",
      ].join(" ")}
    >
      <WorkspaceSwitcher />

      <SidebarTopNav
        isHomeActive={activePage === null}
        onOpenHome={onOpenHome}
      />

      <div
        className="h-px w-full shrink-0 -mt-px z-[99]"
        style={{
          boxShadow: "transparent 0px 0px 0px",
          transition: "box-shadow 300ms",
        }}
      />

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
        onOpenTrash={onOpenTrash}
        showInviteCTA={showInviteCTA}
        onDismissInvite={() => setShowInviteCTA(false)}
      />
    </aside>
  );
};
