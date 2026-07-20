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

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import type { ActivePage } from "@/entities/page";
import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import { pageConfigKey, resolvePageConfig, usePageConfigStore } from "@/shared/config/pageConfigStore";
import { isPerfEnabled } from "@/shared/lib/perf/measure";
import { initRealtimeMessagesBridge } from "@/services/realtime-messages";
import { PageHeaderBar } from "@/entities/page";
import { PageBody } from "./PageBody";
import { PageHeader } from "./PageHeader";
import { PageOutlineRail } from "@/widgets/page-toc/PageOutlineRail";
import { anyJsDebugToolEnabled, usePageDebugStore } from "@/shared/debug/pageDebugStore";

import "./notionPage.css";
import "@/app/styles/debug-tools.css";

// Debug HUD (overflow scan / hover ruler / caret readout) — own chunk, mounted
// only while a JS debug tool is toggled on in ··· → Tools.
const LazyPageDebugOverlay = React.lazy(() => import("@/shared/debug/PageDebugOverlay"));

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
  // Count COMMITTED renders in a dep-less effect: writing a ref during
  // render is illegal under react-hooks/refs (and invisible to React).
  React.useEffect(() => { renderCountRef.current += 1; });

  useEffect(() => () => {
    if (isPerfEnabled()) {
      console.info(`[perf] OsionosPage renders before unmount: ${renderCountRef.current}`);
    }
  }, []);

  // Narrow shell tuple: the page object gets a new identity on every content
  // commit (typing), but this shell only branches on the workspace id, the
  // cover, and the first block's layout flags — subscribe to exactly those so
  // a commit inside PageBody doesn't re-render the header stack per pane.
  const shell = usePageStore(
    useShallow((s) => {
      const page = s.pageById(pageId);
      const first = page?.content?.[0];
      return {
        workspaceId: page?.workspaceId,
        cover: page?.cover,
        soleBlock: page?.content?.length === 1,
        firstType: first?.type,
        firstLayoutMode: first?.layoutMode,
        firstLayoutRole: first?.layoutRole,
      };
    }),
  );
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

  // ··· → Tools debug toggles; each becomes a data attribute the debug-tools
  // stylesheet keys on (zero cost while off).
  const debugTools = usePageDebugStore((s) => s.enabled);

  useEffect(() => {
    const handleAddPageComment = (event: Event) => {
      const detail = (event as CustomEvent<{ pageId?: string }>).detail;
      if (detail?.pageId && detail.pageId !== pageId) return;
      setCommentsOpen(true);
    };
    globalThis.addEventListener("osionos:add-page-comment", handleAddPageComment);
    return () => globalThis.removeEventListener("osionos:add-page-comment", handleAddPageComment);
  }, [pageId]);

  const hasFullPageLayout = shell.soleBlock &&
    shell.firstType === "layout" &&
    shell.firstLayoutMode === "full_page";
  // Header canvas: cover + full-page layout = the cover becomes a full-bleed
  // backdrop behind the top of the canvas (glass cells float over it). The
  // toggle IS the cover — remove it to get a plain canvas again.
  const hasHeaderCanvas = hasFullPageLayout && !!(shell.cover ?? activePage?.cover);
  // Header BAND: a layoutRole="header" canvas as the first block — the cover
  // backdrops only that band; the rest of the page flows normally below it.
  const hasHeaderBand = shell.firstType === "layout" &&
    shell.firstLayoutRole === "header" &&
    !!(shell.cover ?? activePage?.cover);

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
        hasHeaderCanvas ? "osionos-page--header-canvas" : "",
        hasHeaderBand ? "osionos-page--header-band" : "",
        pageConfig.locked ? "osionos-page--locked" : "",
        pageConfig.presentationMode ? "osionos-page--present" : "",
      ].filter(Boolean).join(" ")}
      style={pageStyle}
      data-debug-outlines={debugTools.outlines ? "" : undefined}
      data-debug-surfaces={debugTools.surfaces ? "" : undefined}
      data-debug-grid={debugTools.grid ? "" : undefined}
      data-debug-blockinfo={debugTools.blockInfo ? "" : undefined}
      data-debug-overflow={debugTools.overflow ? "" : undefined}
    >
      {!hasFullPageLayout && <PageOutlineRail pageId={pageId} />}

      <PageHeaderBar
        key={pageId}
        pageId={pageId}
        workspaceId={shell.workspaceId ?? activePage?.workspaceId ?? ""}
      />

      <PageHeader
        pageId={pageId}
        activePage={activePage}
        locked={pageConfig.locked}
        commentsOpen={commentsOpen}
        onToggleComments={() => setCommentsOpen((value) => !value)}
        onCloseComments={() => setCommentsOpen(false)}
      />

      <PageBody pageId={pageId} locked={pageConfig.locked} />

      {anyJsDebugToolEnabled(debugTools) && (
        <Suspense fallback={null}>
          <LazyPageDebugOverlay />
        </Suspense>
      )}
    </div>
  );
};
