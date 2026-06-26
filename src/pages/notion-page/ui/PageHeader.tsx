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
import { MessageSquare } from "lucide-react";
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
  type PageEntry,
} from "@/entities/page";
import { usePageHeaderActions } from "./usePageHeaderActions";
import { usePageProperties } from "./usePageProperties";
import { patchActivePageMetadata } from "./notionPageMeta";
import { PageComments } from "./PageComments";
import { TemplateHeader } from "./TemplateHeader";
import { TemplateEditBanner } from "./TemplateEditBanner";
import { useResolvedHeaderTemplate } from "../model/useResolvedHeaderTemplate";

const EMPTY_MESSAGES: RealtimeMessage[] = [];

interface Props {
  pageId: string;
  page: PageEntry | undefined;
  activePage: ActivePage | null;
  locked: boolean;
  commentsOpen: boolean;
  onToggleComments: () => void;
  onCloseComments: () => void;
}

/** Cover + icon + toolbar + title + properties + connections (the page head, above the body). */
export const PageHeader: React.FC<Props> = ({ pageId, page, activePage, locked, commentsOpen, onToggleComments, onCloseComments }) => {
  const updatePageTitle = usePageStore((s) => s.updatePageTitle);
  const actions = usePageHeaderActions(pageId, locked);
  // Destructured: `coverPickerOpen` is plain state and `coverPickerRef` is
  // only PASSED as a JSX ref — reading them through the hook's bag makes the
  // react-hooks/refs analyzer treat both as render-time ref reads.
  const { coverPickerOpen, coverPickerRef } = actions;
  const properties = usePageProperties(pageId, locked);
  const headerTemplate = useResolvedHeaderTemplate(page);
  const commentCount = useRealtimeMessagesStore((s) => (s.messagesByThread[`page:${pageId}:comments`] ?? EMPTY_MESSAGES).length);

  const title = page?.title ?? activePage?.title ?? "";
  const icon = page?.icon ?? activePage?.icon;
  const cover = page?.cover ?? activePage?.cover;
  const hasCover = !!cover;
  const hasIcon = !!icon;

  function changeTitle(newTitle: string) {
    if (locked) return;
    updatePageTitle(pageId, newTitle);
    patchActivePageMetadata(pageId, { title: newTitle });
  }

  const templateBanner = page?.isTemplate ? <TemplateEditBanner page={page} /> : null;

  if (headerTemplate && page) {
    return (
      <>
        {templateBanner}
        <div className={`osionos-page-header ${hasCover ? "osionos-page-header--with-cover" : "osionos-page-header--no-cover"}`}>
          <PageComments pageId={pageId} open={commentsOpen} onClose={onCloseComments} />
          <TemplateHeader template={headerTemplate} page={page} />
          {page.workspaceId ? <PageConnections pageId={pageId} workspaceId={page.workspaceId} /> : null}
        </div>
      </>
    );
  }

  return (
    <>
      {templateBanner}
      {hasCover && (
        <PageCover cover={cover} onChangeCover={actions.changeCover} onRemoveCover={actions.removeCover} disabled={locked} />
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
          workspaceId={page?.workspaceId ?? ""}
          properties={page?.properties ?? []}
          editable={!locked}
          onChangeValue={properties.onChangeValue}
          onAddProperty={properties.onAddProperty}
          onRemoveProperty={properties.onRemoveProperty}
        />
        {page?.workspaceId ? <PageConnections pageId={pageId} workspaceId={page.workspaceId} /> : null}
      </div>
    </>
  );
};
