/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   Sidebar.tsx                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/05 15:08:41 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useState } from "react";

import { useUserStore, WorkspaceSwitcher } from "@/features/auth";
import { usePageStore } from "@/store/usePageStore";
import { useUIStore } from "@/shared/config/uiStore";
import { SidebarTopNav } from "./SidebarTopNav";
import { SidebarPageTree } from "./SidebarPageTree";
import { SidebarFooter } from "./SidebarFooter";

import styles from "./Sidebar.module.scss";

interface Props {
  onOpenHome?: () => void;
  onOpenSettings?: () => void;
  onOpenTrash?: () => void;
}

/** Renders the osionos-style sidebar with navigation, page tree, and user switching. */
export const Sidebar: React.FC<Props> = ({
  onOpenHome,
  onOpenSettings,
  onOpenTrash,
}) => {
  const session = useUserStore((s) => s.activeSession());
  const activeWorkspace = useUserStore((s) => s.activeWorkspace());
  const activePage = usePageStore((s) => s.activePage);
  const recents = usePageStore((s) => s.recents);
  const fetchPages = usePageStore((s) => s.fetchPages);
  const openPage = usePageStore((s) => s.openPage);
  const addPage = usePageStore((s) => s.addPage);
  const pagesByWorkspace = usePageStore((s) => s.pages);

  const isSidebarOpen = useUIStore((s) => s.isSidebarOpen);
  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth);

  const [showInviteCTA, setShowInviteCTA] = useState(true);

  const jwt = session?.accessToken ?? "";

  const privateWorkspaces = useMemo(
    () => activeWorkspace && activeWorkspace.ownerId === session?.userId ? [activeWorkspace] : [],
    [activeWorkspace, session?.userId],
  );
  const sharedWorkspaces = useMemo(
    () => activeWorkspace && activeWorkspace.ownerId !== session?.userId ? [activeWorkspace] : [],
    [activeWorkspace, session?.userId],
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

  function handleResizePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setSidebarWidth(startWidth + moveEvent.clientX - startX);
    };

    const handlePointerUp = () => {
      globalThis.removeEventListener("pointermove", handlePointerMove);
      globalThis.removeEventListener("pointerup", handlePointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    globalThis.addEventListener("pointermove", handlePointerMove);
    globalThis.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  return (
    <aside
      className={[
        styles.sidebar,
        isSidebarOpen ? "" : styles.sidebarClosed,
      ].join(" ")}
      style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
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
          pagesByWorkspace={pagesByWorkspace}
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
      {isSidebarOpen ? (
        <hr
          className={styles.resizeHandle}
          data-sidebar-resize-handle
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onPointerDown={handleResizePointerDown}
        />
      ) : null}
    </aside>
  );
};
