/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   NotionPage.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useState } from "react";

import type { ActivePage } from "@/entities/page";
import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import { pageConfigKey, resolvePageConfig, usePageConfigStore } from "@/shared/config/pageConfigStore";
import { isPerfEnabled } from "@/shared/lib/perf/measure";
import { initRealtimeMessagesBridge } from "@/services/realtime-messages";
import { PageHeaderBar } from "@/entities/page";
import { PageBody } from "./PageBody";
import { PageHeader } from "./PageHeader";

import "./notionPage.css";

interface OsionosPageProps {
  pageId: string;
  /** Per-pane active-page ref for the header; falls back to the global one. */
  activePageRef?: ActivePage | null;
}

/**
 * Full osionos-style page: a header bar + the page head (cover, icon, toolbar, title,
 * properties, connections — see PageHeader) + the block editor body (PageBody). The header
 * actions, comments, and property handlers live in their own files to keep this a thin shell.
 */
export const OsionosPage: React.FC<OsionosPageProps> = ({ pageId, activePageRef }) => {
  const renderCountRef = React.useRef(0);
  renderCountRef.current += 1;

  useEffect(() => () => {
    if (isPerfEnabled()) {
      console.info(`[perf] OsionosPage renders before unmount: ${renderCountRef.current}`);
    }
  }, []);

  const page = usePageStore((s) => s.pageById(pageId));
  // Panes pass their own activePageRef, so they must NOT subscribe to the global
  // activePage — otherwise focusing any one pane re-renders ALL open panes' editors
  // (the pane-level React.memo can't stop a store subscription inside it). Only the
  // single-view case (no ref) subscribes.
  const globalActivePage = usePageStore((s) => (activePageRef ? null : s.activePage));
  const activePage = activePageRef ?? globalActivePage;
  const activeUserId = useUserStore((s) => s.activeUserId);
  const safeUserId = activeUserId || "anonymous";
  const [commentsOpen, setCommentsOpen] = useState(false);
  const storedPageConfig = usePageConfigStore((s) => s.configs[pageConfigKey(safeUserId, pageId)]);
  const pageConfig = useMemo(() => resolvePageConfig(storedPageConfig), [storedPageConfig]);

  useEffect(() => {
    initRealtimeMessagesBridge();
  }, []);

  useEffect(() => {
    const handleAddPageComment = (event: Event) => {
      const detail = (event as CustomEvent<{ pageId?: string }>).detail;
      if (detail?.pageId && detail.pageId !== pageId) return;
      setCommentsOpen(true);
    };
    globalThis.addEventListener("osionos:add-page-comment", handleAddPageComment);
    return () => globalThis.removeEventListener("osionos:add-page-comment", handleAddPageComment);
  }, [pageId]);

  const hasFullPageLayout = page?.content?.length === 1 &&
    page.content[0]?.type === "layout" &&
    page.content[0]?.layoutMode === "full_page";

  const pageStyle: React.CSSProperties & {
    "--page-font-family": string;
    "--page-font-size-scale": string | number;
    "--page-content-max-width": string;
    "--page-content-padding-inline": string;
  } = {
    "--page-font-family": pageConfig.cssTokens.fontFamily,
    "--page-font-size-scale": pageConfig.cssTokens.fontSizeScale,
    "--page-content-max-width": pageConfig.cssTokens.contentMaxWidth,
    "--page-content-padding-inline": pageConfig.cssTokens.contentPaddingInline,
  };

  return (
    <div
      className={[
        "osionos-page",
        `osionos-page--font-${pageConfig.font}`,
        pageConfig.smallText ? "osionos-page--small-text" : "",
        pageConfig.fullWidth ? "osionos-page--full-width" : "",
        hasFullPageLayout ? "osionos-page--layout-canvas" : "",
        pageConfig.locked ? "osionos-page--locked" : "",
        pageConfig.presentationMode ? "osionos-page--present" : "",
      ].filter(Boolean).join(" ")}
      style={pageStyle}
    >
      <PageHeaderBar
        key={pageId}
        pageId={pageId}
        workspaceId={page?.workspaceId ?? activePage?.workspaceId ?? ""}
      />

      <PageHeader
        pageId={pageId}
        page={page}
        activePage={activePage}
        locked={pageConfig.locked}
        commentsOpen={commentsOpen}
        onToggleComments={() => setCommentsOpen((value) => !value)}
        onCloseComments={() => setCommentsOpen(false)}
      />

      <PageBody pageId={pageId} locked={pageConfig.locked} />
    </div>
  );
};
