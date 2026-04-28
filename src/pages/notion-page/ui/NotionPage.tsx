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
import {
  initRealtimeMessagesBridge,
  type RealtimeMessage,
  useRealtimeMessagesStore,
} from "@/services/realtime-messages";
import {
  IconImage,
  getCollectionEmojiValue,
  randomUiCollectionCover,
  randomUiCollectionEmoji,
} from "@/shared/lib/markengine/uiCollectionAssets";

import {
  PageCover,
  PageHeaderBar,
  PageIcon,
  PageTitle,
} from "@/entities/page";
import { PageBody } from "./PageBody";

import "./notionPage.css";

interface OsionosPageProps {
  pageId: string;
}

const EMPTY_MESSAGES: RealtimeMessage[] = [];

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
  const page = usePageStore((s) => s.pageById(pageId));
  const activePage = usePageStore((s) => s.activePage);
  const openPage = usePageStore((s) => s.openPage);
  const updatePageTitle = usePageStore((s) => s.updatePageTitle);
  const activeUserId = useUserStore((s) => s.activeUserId);
  const persona = useUserStore((s) => s.activePersona());
  const safeUserId = activeUserId || "anonymous";
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
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

  return (
    <div
      className={[
        "osionos-page",
        `osionos-page--font-${pageConfig.font}`,
        pageConfig.smallText ? "osionos-page--small-text" : "",
        pageConfig.fullWidth ? "osionos-page--full-width" : "",
        pageConfig.locked ? "osionos-page--locked" : "",
        pageConfig.presentationMode ? "osionos-page--present" : "",
      ].filter(Boolean).join(" ")}
      style={{
        "--page-font-family": pageConfig.cssTokens.fontFamily,
        "--page-font-size-scale": pageConfig.cssTokens.fontSizeScale,
        "--page-content-max-width": pageConfig.cssTokens.contentMaxWidth,
        "--page-content-padding-inline": pageConfig.cssTokens.contentPaddingInline,
      } as React.CSSProperties}
    >
      <PageHeaderBar
        key={pageId}
        pageId={pageId}
        workspaceId={activePage?.workspaceId ?? ""}
      />

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
          />
        )}

        {/* Toolbar: Add icon / cover / comment (shown on hover) */}
        <div className="osionos-page-toolbar">
          {!hasIcon && (
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
          {!hasCover && (
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

        {commentsOpen ? (
          <section className="mb-4 max-w-xl rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-secondary)] p-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-[var(--color-ink)]">Page comments</p>
              <button
                type="button"
                className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                onClick={() => setCommentsOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="mb-3 max-h-44 space-y-2 overflow-y-auto">
              {comments.length === 0 ? (
                <p className="text-xs text-[var(--color-ink-muted)]">No comments yet.</p>
              ) : (
                comments.map((comment) => (
                  <article key={comment.id} className="rounded-lg bg-[var(--color-surface-primary)] px-3 py-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-[var(--color-ink)]">{comment.authorName}</span>
                      <span className="text-[var(--color-ink-faint)]">
                        {new Date(comment.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--color-ink)]">{comment.body}</p>
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
                className="min-h-10 flex-1 resize-none rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
              />
              <button
                type="submit"
                disabled={!commentDraft.trim()}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-accent)] text-white disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send comment"
              >
                <Send size={16} />
              </button>
            </form>
          </section>
        ) : null}

        {/* Title */}
        <PageTitle title={title} onChangeTitle={handleChangeTitle} />
      </div>

      {/* Body: block editor powered by markengine */}
      <PageBody pageId={pageId} />
    </div>
  );
};
