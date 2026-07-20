/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageHeader.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { LayoutDashboard, MessageSquare } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { AssetRenderer } from "@univers42/ui-collection";

import { usePageStore } from "@/store/usePageStore";
import { IconImage, getCollectionEmojiValue } from "@/shared/lib/markengine/uiCollectionAssets";
import { useRealtimeMessagesStore, type RealtimeMessage } from "@/services/realtime-messages";
import {
  CoverAssetPicker,
  PageConnections,
  PageCover,
  PageIcon,
  PagePropertiesPanel,
  PageTitle,
  type ActivePage,
} from "@/entities/page";
import { classicHeaderTemplate } from "@/entities/page/model/headerTemplate";
import { usePageHeaderActions } from "./usePageHeaderActions";
import { usePageProperties } from "./usePageProperties";
import { patchActivePageMetadata } from "./notionPageMeta";
import { PageComments } from "./PageComments";
import { TemplateHeader } from "./TemplateHeader";
import { TemplateEditBanner } from "./TemplateEditBanner";
import { useResolvedHeaderTemplate } from "../model/useResolvedHeaderTemplate";

const EMPTY_MESSAGES: RealtimeMessage[] = [];

// Lazy: the header customizer (designer UI + store) loads only when opened.
const HeaderDesigner = React.lazy(() =>
  import("@/features/template-designer/ui/HeaderDesigner").then((module) => ({
    default: module.HeaderDesigner,
  })),
);

interface Props {
  pageId: string;
  activePage: ActivePage | null;
  locked: boolean;
  commentsOpen: boolean;
  onToggleComments: () => void;
  onCloseComments: () => void;
}

/** Cover + icon + toolbar + title + properties + connections (the page head, above the body). */
export const PageHeader: React.FC<Props> = ({ pageId, activePage, locked, commentsOpen, onToggleComments, onCloseComments }) => {
  const updatePageTitle = usePageStore((s) => s.updatePageTitle);
  // Narrow subscription: the page object gets a new identity on every content
  // commit (typing), but the head reads only metadata — all reference-stable
  // across commits, which spread the page and replace `content` alone — plus
  // the first block's layout flags. The full object is selected separately
  // below, only while a consumer that binds arbitrary fields is mounted.
  const head = usePageStore(
    useShallow((s) => {
      const p = s.pageById(pageId);
      const first = p?.content?.[0];
      const hasHeaderBand = first?.type === "layout" && first?.layoutRole === "header";
      return {
        pageExists: !!p,
        title: p?.title,
        icon: p?.icon,
        cover: p?.cover,
        coverPosition: p?.coverPosition,
        workspaceId: p?.workspaceId,
        databaseId: p?.databaseId ?? null,
        isTemplate: !!p?.isTemplate,
        properties: p?.properties,
        // Full-page canvas pages own their whole layout → hide the header button there.
        hasHeaderCanvasLayout: p?.content?.length === 1 &&
          first?.type === "layout" &&
          first?.layoutMode === "full_page",
        hasHeaderBand,
        headerBandEditing: hasHeaderBand && first?.layoutConfig?.preview === false,
      };
    }),
  );
  const actions = usePageHeaderActions(pageId, locked);
  // Destructured: `coverPickerOpen` is plain state and `coverPickerRef` is
  // only PASSED as a JSX ref — reading them through the hook's bag makes the
  // react-hooks/refs analyzer treat both as render-time ref reads.
  const { coverPickerOpen, coverPickerRef } = actions;
  const properties = usePageProperties(pageId, locked);
  const headerTemplate = useResolvedHeaderTemplate(head.pageExists ? pageId : null, head.databaseId);
  const commentCount = useRealtimeMessagesStore((s) => (s.messagesByThread[`page:${pageId}:comments`] ?? EMPTY_MESSAGES).length);
  const [customizerOpen, setCustomizerOpen] = React.useState(false);
  const openCustomizer = React.useCallback(() => setCustomizerOpen(true), []);

  // TemplateHeader slots and the HeaderDesigner sample bind arbitrary page
  // fields, so they need the full object — subscribe to it only while one of
  // them is mounted; the common classic-header case stays on the narrow tuple.
  const needsFullPage = !!headerTemplate || customizerOpen;
  const page = usePageStore((s) => (needsFullPage ? s.pageById(pageId) : undefined));

  const title = head.title ?? activePage?.title ?? "";
  const icon = head.icon ?? activePage?.icon;
  const cover = head.cover ?? activePage?.cover;
  const hasCover = !!cover;
  // Header BAND state drives the button label: none → add, preview → edit, editing → done.
  const customizeLabel = head.headerBandEditing ? "Done editing header" : "Customize header";
  const hasIcon = !!icon;

  function changeTitle(newTitle: string) {
    if (locked) return;
    updatePageTitle(pageId, newTitle);
    patchActivePageMetadata(pageId, { title: newTitle });
  }

  const templateBanner = head.isTemplate ? <TemplateEditBanner pageId={pageId} /> : null;

  // The customizer edits a scoped HeaderTemplate — data, not page content: the
  // draft starts from the resolved template (or the classic-header starter) and
  // saves to this page, its database, or globally. Shared by both branches.
  const customizer = customizerOpen && page ? (
    <React.Suspense fallback={null}>
      <HeaderDesigner
        open
        onClose={() => setCustomizerOpen(false)}
        scopes={[
          { key: `page:${pageId}`, label: "This page" },
          ...(page.databaseId ? [{ key: page.databaseId, label: "This database" }] : []),
          { key: "global", label: "All pages" },
        ]}
        template={headerTemplate ?? classicHeaderTemplate()}
        sample={page}
        bindKeys={["title", "icon", "cover", ...(page.properties ?? []).map((p) => p.key)]}
      />
    </React.Suspense>
  ) : null;

  if (headerTemplate && page) {
    return (
      <>
        {templateBanner}
        {hasCover && (
          <PageCover
            cover={cover}
            position={page.coverPosition ?? activePage?.coverPosition}
            onChangeCover={actions.changeCover}
            onChangeCoverPosition={actions.changeCoverPosition}
            onRemoveCover={actions.removeCover}
            onCustomizeHeader={openCustomizer}
            disabled={locked}
          />
        )}
        <div className={`osionos-page-header ${hasCover ? "osionos-page-header--with-cover" : "osionos-page-header--no-cover"}`}>
          <PageComments pageId={pageId} open={commentsOpen} onClose={onCloseComments} />
          <TemplateHeader template={headerTemplate} page={page} />
          {page.workspaceId ? <PageConnections pageId={pageId} workspaceId={page.workspaceId} /> : null}
        </div>
        {customizer}
      </>
    );
  }

  return (
    <>
      {templateBanner}
      {hasCover && (
        <PageCover
          cover={cover}
          position={head.coverPosition ?? activePage?.coverPosition}
          onChangeCover={actions.changeCover}
          onChangeCoverPosition={actions.changeCoverPosition}
          onRemoveCover={actions.removeCover}
          onCustomizeHeader={head.hasHeaderCanvasLayout || head.hasHeaderBand ? undefined : openCustomizer}
          disabled={locked}
        />
      )}

      <div className={`osionos-page-header ${hasCover ? "osionos-page-header--with-cover" : "osionos-page-header--no-cover"}`}>
        {hasIcon && (
          <PageIcon icon={icon} onChangeIcon={actions.changeIcon} onRemoveIcon={actions.removeIcon} disabled={locked} />
        )}

        <div className="osionos-page-toolbar">
          {!hasIcon && !locked && (
            <button type="button" className="osionos-page-toolbar-btn" onClick={actions.addIcon}>
              <AssetRenderer value={getCollectionEmojiValue("sparkles")} size={14} />
              Add icon
            </button>
          )}
          {!hasCover && !locked && (
            <button type="button" className="osionos-page-toolbar-btn" onClick={actions.toggleCoverPicker}>
              <IconImage />
              Add cover
            </button>
          )}
          {!locked && !head.hasHeaderCanvasLayout && (
            <button type="button" className="osionos-page-toolbar-btn" onClick={head.hasHeaderBand ? actions.customizeHeader : openCustomizer}>
              <LayoutDashboard size={14} />
              {customizeLabel}
            </button>
          )}
          <button type="button" className="osionos-page-toolbar-btn" onClick={onToggleComments}>
            <MessageSquare size={14} />
            Add comment{commentCount ? ` (${commentCount})` : ""}
          </button>
        </div>

        {!hasCover && coverPickerOpen ? (
          <div ref={coverPickerRef} className="absolute z-[var(--osio-z-popover)] mt-1">
            <CoverAssetPicker onSelect={actions.selectCover} />
          </div>
        ) : null}

        <PageComments pageId={pageId} open={commentsOpen} onClose={onCloseComments} />

        <PageTitle title={title} onChangeTitle={changeTitle} readOnly={locked} />
        <PagePropertiesPanel
          pageId={pageId}
          workspaceId={head.workspaceId ?? ""}
          properties={head.properties ?? []}
          editable={!locked}
          onChangeValue={properties.onChangeValue}
          onAddProperty={properties.onAddProperty}
          onRemoveProperty={properties.onRemoveProperty}
        />
        {head.workspaceId ? <PageConnections pageId={pageId} workspaceId={head.workspaceId} /> : null}
      </div>
      {customizer}
    </>
  );
};
