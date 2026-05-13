/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   Sidebar.tsx                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/12 23:14:08 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useUserStore, WorkspaceSwitcher } from "@/features/auth";
import { usePageStore } from "@/store/usePageStore";
import { useUIStore } from "@/shared/config/uiStore";
import { isPerfEnabled, recordRender } from "@/shared/lib/perf/measure";
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
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  recordRender("Sidebar");

  useEffect(() => () => {
    if (isPerfEnabled()) {
      console.info(`[perf] Sidebar renders before unmount: ${renderCountRef.current}`);
    }
  }, []);

  const activeUserId = useUserStore((s) => s.activeUserId);
  const jwt = useUserStore((s) => s.activePageJwt() ?? "");
  const activeWorkspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");
  const activeWorkspaceOwnerId = useUserStore((s) => s.activeWorkspace()?.ownerId ?? "");
  const activePageId = usePageStore((s) => s.activePage?.id ?? null);
  const activePageKind = usePageStore((s) => s.activePage?.kind ?? null);
  const recents = usePageStore((s) => s.recents);
  const fetchPages = usePageStore((s) => s.fetchPages);
  const openPage = usePageStore((s) => s.openPage);
  const addPage = usePageStore((s) => s.addPage);

  const isSidebarOpen = useUIStore((s) => s.isSidebarOpen);
  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth);

  const [showInviteCTA, setShowInviteCTA] = useState(true);

  const privateWorkspaces = useMemo(
    () => activeWorkspaceId && activeWorkspaceOwnerId === activeUserId ? [{ _id: activeWorkspaceId }] : [],
    [activeUserId, activeWorkspaceId, activeWorkspaceOwnerId],
  );
  const sharedWorkspaces = useMemo(
    () => activeWorkspaceId && activeWorkspaceOwnerId !== activeUserId ? [{ _id: activeWorkspaceId }] : [],
    [activeUserId, activeWorkspaceId, activeWorkspaceOwnerId],
  );

  // Fetch pages whenever the active user's workspaces change
  useEffect(() => {
    if (activeWorkspaceId && jwt) fetchPages(activeWorkspaceId, jwt);
  }, [activeWorkspaceId, jwt, fetchPages]);

  const handleAddToWorkspace = useCallback((wsId: string) => {
    addPage(wsId, "Untitled", jwt).then((page) => {
      if (page)
        openPage({
          id: page._id,
          workspaceId: wsId,
          kind: "page",
          title: page.title,
        });
    });
  }, [addPage, jwt, openPage]);

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

  const sidebarStyle: React.CSSProperties & { "--sidebar-width": string } = {
    "--sidebar-width": `${sidebarWidth}px`,
  };

  return (
    <aside
      className={[
        styles.sidebar,
        isSidebarOpen ? "" : styles.sidebarClosed,
      ].join(" ")}
      style={sidebarStyle}
    >
      <WorkspaceSwitcher />

      <SidebarTopNav
        isHomeActive={activePageId === null}
        onOpenHome={onOpenHome}
      />

      <div
        className="h-px w-full shrink-0 -mt-px z-[var(--osio-z-raised)]"
        style={{
          boxShadow: "transparent 0px 0px 0px",
          transition: "box-shadow 300ms",
        }}
      />

      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 pt-1.5 pb-5">
        <SidebarPageTree
          recents={recents}
          activePageId={activePageId}
          activePageKind={activePageKind}
          activeWorkspaceId={activeWorkspaceId}
          openPage={openPage}
          privateWorkspaces={privateWorkspaces}
          sharedWorkspaces={sharedWorkspaces}
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
