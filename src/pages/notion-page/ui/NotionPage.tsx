/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   NotionPage.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 20:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/08 19:47:31 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback } from "react";
import { MessageSquare } from "lucide-react";
import { AssetRenderer } from "@univers42/ui-collection";

import { usePageStore } from "@/store/usePageStore";
import {
  IconImage,
  getCollectionEmojiValue,
  randomUiCollectionCover,
  randomUiCollectionEmoji,
} from "@/shared/lib/markengine/uiCollectionAssets";

import {
  PageBreadcrumbs,
  PageCover,
  PageIcon,
  PageTitle,
} from "@/entities/page";
import { PageBody } from "./PageBody";

import "./notionPage.css";

interface NotionPageProps {
  pageId: string;
}

/**
 * Full Notion-style page layout.
 *
 * Structure:
 *  ┌──────────────────────────────────────┐
 *  │  Cover image / gradient (optional)    │
 *  ├──────────────────────────────────────┤
 *  │  [Icon 🚀]                            │
 *  │  [Add icon] [Add cover] [Add comment] │ ← toolbar (hover)
 *  │  Page Title (editable H1)             │
 *  ├──────────────────────────────────────┤
 *  │  Properties (optional)                │
 *  ├──────────────────────────────────────┤
 *  │  Block editor (markengine-powered)    │
 *  │  ...                                  │
 *  └──────────────────────────────────────┘
 */
export const NotionPage: React.FC<NotionPageProps> = ({ pageId }) => {
  const page = usePageStore((s) => s.pageById(pageId));
  const activePage = usePageStore((s) => s.activePage);
  const openPage = usePageStore((s) => s.openPage);
  const updatePageTitle = usePageStore((s) => s.updatePageTitle);

  /* ── Page metadata from store ──────────────────────────────────── */
  const title = page?.title ?? activePage?.title ?? "";
  const icon = page?.icon ?? activePage?.icon;
  const cover = page?.cover;

  /* ── Handlers ──────────────────────────────────────────────────── */

  const handleChangeTitle = useCallback(
    (newTitle: string) => {
      updatePageTitle(pageId, newTitle);
      if (activePage?.id === pageId) {
        openPage({ ...activePage, title: newTitle });
      }
    },
    [pageId, activePage, openPage, updatePageTitle],
  );

  const handleChangeIcon = useCallback(
    (newIcon: string) => {
      /* Persist icon on the page entry — we store it in the store's PageEntry */
      usePageStore.setState((s) => {
        const newPages = { ...s.pages };
        for (const wsId of Object.keys(newPages)) {
          newPages[wsId] = newPages[wsId].map((p) =>
            p._id === pageId ? { ...p, icon: newIcon } : p,
          );
        }
        return { pages: newPages };
      });
      if (activePage?.id === pageId) {
        openPage({ ...activePage, icon: newIcon });
      }
    },
    [pageId, activePage, openPage],
  );

  const handleRemoveIcon = useCallback(() => {
    usePageStore.setState((s) => {
      const newPages = { ...s.pages };
      for (const wsId of Object.keys(newPages)) {
        newPages[wsId] = newPages[wsId].map((p) =>
          p._id === pageId ? { ...p, icon: undefined } : p,
        );
      }
      return { pages: newPages };
    });
    if (activePage?.id === pageId) {
      openPage({ ...activePage, icon: undefined });
    }
  }, [pageId, activePage, openPage]);

  const handleAddIcon = useCallback(() => {
    const emoji = randomUiCollectionEmoji();
    handleChangeIcon(emoji);
  }, [handleChangeIcon]);

  const handleChangeCover = useCallback(
    (newCover: string) => {
      usePageStore.setState((s) => {
        const newPages = { ...s.pages };
        for (const wsId of Object.keys(newPages)) {
          newPages[wsId] = newPages[wsId].map((p) =>
            p._id === pageId ? { ...p, cover: newCover } : p,
          );
        }
        return { pages: newPages };
      });
    },
    [pageId],
  );

  const handleRemoveCover = useCallback(() => {
    usePageStore.setState((s) => {
      const newPages = { ...s.pages };
      for (const wsId of Object.keys(newPages)) {
        newPages[wsId] = newPages[wsId].map((p) =>
          p._id === pageId ? { ...p, cover: undefined } : p,
        );
      }
      return { pages: newPages };
    });
  }, [pageId]);

  const handleAddCover = useCallback(() => {
    const nextCover = randomUiCollectionCover();
    if (nextCover) {
      handleChangeCover(nextCover);
    }
  }, [handleChangeCover]);

  const handleOpenHome = useCallback(() => {
    usePageStore.setState({
      activePage: null,
      showTrash: false,
      navigationPath: [],
    });
  }, []);

  /* ── Render ────────────────────────────────────────────────────── */

  const hasCover = !!cover;
  const hasIcon = !!icon;

  return (
    <div className="notion-page">
      {/* Cover */}
      {hasCover && (
        <PageCover
          cover={cover}
          onChangeCover={handleChangeCover}
          onRemoveCover={handleRemoveCover}
        />
      )}

      {/* Header: icon + toolbar + title */}
      <div
        className={`notion-page-header ${
          hasCover
            ? "notion-page-header--with-cover"
            : "notion-page-header--no-cover"
        }`}
      >
        <PageBreadcrumbs pageId={pageId} onOpenHome={handleOpenHome} />

        {/* Page icon */}
        {hasIcon && (
          <PageIcon
            icon={icon}
            onChangeIcon={handleChangeIcon}
            onRemoveIcon={handleRemoveIcon}
          />
        )}

        {/* Toolbar: Add icon / cover / comment (shown on hover) */}
        <div className="notion-page-toolbar">
          {!hasIcon && (
            <button
              type="button"
              className="notion-page-toolbar-btn"
              onClick={handleAddIcon}
            >
              <AssetRenderer
                value={getCollectionEmojiValue("sparkles")}
                size={14}
              />
              Add icon
            </button>
          )}
          {!hasCover && (
            <button
              type="button"
              className="notion-page-toolbar-btn"
              onClick={handleAddCover}
            >
              <IconImage />
              Add cover
            </button>
          )}
          <button
            type="button"
            className="notion-page-toolbar-btn"
            onClick={() => {
              /* Future: add comment */
            }}
          >
            <MessageSquare size={14} />
            Add comment
          </button>
        </div>

        {/* Title */}
        <PageTitle title={title} onChangeTitle={handleChangeTitle} />
      </div>

      {/* Body: block editor powered by markengine */}
      <PageBody pageId={pageId} />
    </div>
  );
};
