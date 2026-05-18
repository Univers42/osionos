/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   NotionPage.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   osionosPage.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 20:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 17:22:32 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { AssetRenderer } from "@univers42/ui-collection";

import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import { pageConfigKey, resolvePageConfig, usePageConfigStore } from "@/shared/config/pageConfigStore";
import { isPerfEnabled } from "@/shared/lib/perf/measure";
import {
  initRealtimeMessagesBridge,
  type RealtimeMessage,
  useRealtimeMessagesStore,
} from "@/services/realtime-messages";
import {
  IconImage,
  getCollectionEmojiValue,
  randomUiCollectionEmoji,
} from "@/shared/lib/markengine/uiCollectionAssets";

import {
  CoverAssetPicker,
  PageCover,
  PageHeaderBar,
  PageIcon,
  PageProperties,
  PageTitle,
  type ActivePage,
  type PagePropertyEntry,
} from "@/entities/page";
import { PageBody } from "./PageBody";

import "./notionPage.css";

interface OsionosPageProps {
  pageId: string;
}

const EMPTY_MESSAGES: RealtimeMessage[] = [];

type ActivePageMetadataPatch = Partial<Pick<ActivePage, "cover" | "icon" | "title">>;

function patchActivePageMetadata(pageId: string, patch: ActivePageMetadataPatch) {
  usePageStore.setState((state) => {
    if (state.activePage?.id !== pageId) return {};
    const activePage = { ...state.activePage, ...patch };
    return {
      activePage,
      navigationPath: state.navigationPath.map((entry) => (entry.id === pageId ? { ...entry, ...patch } : entry)),
      recents: state.recents.map((entry) => (entry.id === pageId ? { ...entry, ...patch } : entry)),
    };
  });
}

/**
 * Full osionos-style page layout.
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
export const OsionosPage: React.FC<OsionosPageProps> = ({ pageId }) => {
  const renderCountRef = React.useRef(0);
  renderCountRef.current += 1;

  useEffect(() => () => {
    if (isPerfEnabled()) {
      console.info(`[perf] OsionosPage renders before unmount: ${renderCountRef.current}`);
    }
  }, []);

  const page = usePageStore((s) => s.pageById(pageId));
  const activePage = usePageStore((s) => s.activePage);
  const updatePageTitle = usePageStore((s) => s.updatePageTitle);
  const patchPage = usePageStore((s) => s.patchPage);
  const activeUserId = useUserStore((s) => s.activeUserId);
  const persona = useUserStore((s) => s.activePersona());
  const safeUserId = activeUserId || "anonymous";
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const coverPickerRef = React.useRef<HTMLDivElement | null>(null);
  const comments = useRealtimeMessagesStore(
    (s) => s.messagesByThread[`page:${pageId}:comments`] ?? EMPTY_MESSAGES,
  );
  const sendMessage = useRealtimeMessagesStore((s) => s.sendMessage);
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

  useEffect(() => {
    if (!coverPickerOpen) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (coverPickerRef.current?.contains(event.target as Node)) return;
      setCoverPickerOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCoverPickerOpen(false);
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [coverPickerOpen]);

  /* ── Page metadata from store ──────────────────────────────────── */
  const title = page?.title ?? activePage?.title ?? "";
  const icon = page?.icon ?? activePage?.icon;
  const cover = page?.cover ?? activePage?.cover;

  /* ── Handlers ──────────────────────────────────────────────────── */

  const handleChangeTitle = useCallback(
    (newTitle: string) => {
      if (pageConfig.locked) return;
      updatePageTitle(pageId, newTitle);
      patchActivePageMetadata(pageId, { title: newTitle });
    },
    [pageConfig.locked, pageId, updatePageTitle],
  );

  const handleChangeIcon = useCallback(
    (newIcon: string) => {
      if (pageConfig.locked) return;
      /* Persist icon on the page entry — we store it in the store's PageEntry */
      patchPage(pageId, { icon: newIcon });
      patchActivePageMetadata(pageId, { icon: newIcon });
    },
    [pageConfig.locked, pageId, patchPage],
  );

  const handleRemoveIcon = useCallback(() => {
    if (pageConfig.locked) return;
    patchPage(pageId, { icon: undefined });
    patchActivePageMetadata(pageId, { icon: undefined });
  }, [pageConfig.locked, pageId, patchPage]);

  const handleAddIcon = useCallback(() => {
    const emoji = randomUiCollectionEmoji();
    handleChangeIcon(emoji);
  }, [handleChangeIcon]);

  const handleChangeCover = useCallback(
    (newCover: string) => {
      if (pageConfig.locked) return;
      patchPage(pageId, { cover: newCover });
      patchActivePageMetadata(pageId, { cover: newCover });
    },
    [pageConfig.locked, pageId, patchPage],
  );

  const handleRemoveCover = useCallback(() => {
    if (pageConfig.locked) return;
    patchPage(pageId, { cover: undefined });
    patchActivePageMetadata(pageId, { cover: undefined });
  }, [pageConfig.locked, pageId, patchPage]);

  const handleAddCover = useCallback(() => {
    if (pageConfig.locked) return;
    setCoverPickerOpen((open) => !open);
  }, [pageConfig.locked]);

  const handleSelectCoverFromToolbar = useCallback(
    (nextCover: string) => {
      handleChangeCover(nextCover);
      setCoverPickerOpen(false);
    },
    [handleChangeCover],
  );

  const handleChangePageProperty = useCallback(
    (propertyKey: string, value: PagePropertyEntry["value"]) => {
      if (pageConfig.locked) return;
      patchPage(pageId, (currentPage) => ({
        updatedAt: new Date().toISOString(),
        properties: (currentPage.properties ?? []).map((property) => (
          property.key === propertyKey ? { ...property, value } : property
        )),
      }));
    },
    [pageConfig.locked, pageId, patchPage],
  );

  const handleSubmitComment = useCallback(
    (event: { preventDefault: () => void }) => {
      event.preventDefault();
      const sent = sendMessage(
        `page:${pageId}:comments`,
        safeUserId,
        persona?.name ?? safeUserId,
        commentDraft,
      );
      if (sent) setCommentDraft("");
    },
    [commentDraft, pageId, persona?.name, safeUserId, sendMessage],
  );

  /* ── Render ────────────────────────────────────────────────────── */

  const hasCover = !!cover;
  const hasIcon = !!icon;
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

      {/* Cover */}
      {hasCover && (
        <PageCover
          cover={cover}
          onChangeCover={handleChangeCover}
          onRemoveCover={handleRemoveCover}
          disabled={pageConfig.locked}
        />
      )}

      {/* Header: icon + toolbar + title */}
      <div
        className={`osionos-page-header ${
          hasCover
            ? "osionos-page-header--with-cover"
            : "osionos-page-header--no-cover"
        }`}
      >
        {/* Page icon */}
        {hasIcon && (
          <PageIcon
            icon={icon}
            onChangeIcon={handleChangeIcon}
            onRemoveIcon={handleRemoveIcon}
            disabled={pageConfig.locked}
          />
        )}

        {/* Toolbar: Add icon / cover / comment (shown on hover) */}
        <div className="osionos-page-toolbar">
          {!hasIcon && !pageConfig.locked && (
            <button
              type="button"
              className="osionos-page-toolbar-btn"
              onClick={handleAddIcon}
            >
              <AssetRenderer
                value={getCollectionEmojiValue("sparkles")}
                size={14}
              />
              Add icon
            </button>
          )}
          {!hasCover && !pageConfig.locked && (
            <button
              type="button"
              className="osionos-page-toolbar-btn"
              onClick={handleAddCover}
            >
              <IconImage />
              Add cover
            </button>
          )}
          <button
            type="button"
            className="osionos-page-toolbar-btn"
            onClick={() => setCommentsOpen((value) => !value)}
          >
            <MessageSquare size={14} />
            Add comment{comments.length ? ` (${comments.length})` : ""}
          </button>
        </div>

        {!hasCover && coverPickerOpen ? (
          <div ref={coverPickerRef} className="absolute z-[var(--osio-z-popover)] mt-1">
            <CoverAssetPicker onSelect={handleSelectCoverFromToolbar} />
          </div>
        ) : null}

        {commentsOpen ? (
          <section className="mb-4 max-w-xl rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-[var(--osio-fg-default)]">Page comments</p>
              <button
                type="button"
                className="text-xs text-[var(--osio-fg-muted)] hover:text-[var(--osio-fg-default)]"
                onClick={() => setCommentsOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="mb-3 max-h-44 space-y-2 overflow-y-auto">
              {comments.length === 0 ? (
                <p className="text-xs text-[var(--osio-fg-muted)]">No comments yet.</p>
              ) : (
                comments.map((comment) => (
                  <article key={comment.id} className="rounded-lg bg-[var(--osio-bg-surface)] px-3 py-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-[var(--osio-fg-default)]">{comment.authorName}</span>
                      <span className="text-[var(--osio-fg-subtle)]">
                        {new Date(comment.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--osio-fg-default)]">{comment.body}</p>
                  </article>
                ))
              )}
            </div>
            <form className="flex items-end gap-2" onSubmit={handleSubmitComment}>
              <textarea
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                rows={2}
                placeholder="Write a comment…"
                className="min-h-10 flex-1 resize-none rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--osio-accent)]"
              />
              <button
                type="submit"
                disabled={!commentDraft.trim()}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--osio-accent)] text-[var(--osio-accent-fg)] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send comment"
              >
                <Send size={16} />
              </button>
            </form>
          </section>
        ) : null}

        {/* Title */}
        <PageTitle title={title} onChangeTitle={handleChangeTitle} readOnly={pageConfig.locked} />
        <PageProperties
          properties={page?.properties ?? []}
          onChangeProperty={pageConfig.locked ? undefined : handleChangePageProperty}
        />
      </div>

      {/* Body: block editor powered by markengine */}
      <PageBody pageId={pageId} locked={pageConfig.locked} />
    </div>
  );
};
