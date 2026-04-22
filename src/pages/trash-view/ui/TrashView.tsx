/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TrashView.tsx                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/22 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/22 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState, useMemo } from "react";
import { Trash2, Redo2, Trash, AlertTriangle } from "lucide-react";
import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import { canReadPage, getCurrentPageAccessContext } from "@/shared/lib/auth/pageAccess";

import "./trashView.css";

/**
 * Trash view component that displays all archived pages for the current user.
 * Allows restoring or permanently deleting pages.
 */
export const TrashView: React.FC = () => {
  const [preferredWorkspaceId, setPreferredWorkspaceId] = useState<
    string | undefined
  >(undefined);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Get store and user data
  const pages = usePageStore((s) => s.pages);
  const restorePage = usePageStore((s) => s.restorePage);
  const permanentlyDeletePage = usePageStore((s) => s.permanentlyDeletePage);
  const jwt = useUserStore((s) => s.activeJwt());
  const session = useUserStore((s) => s.activeSession());
  const context = getCurrentPageAccessContext();

  const isAuthenticated = !!session && !!context;
  const userWorkspaces = useMemo(
    () => (session ? [...session.privateWorkspaces, ...session.sharedWorkspaces] : []),
    [session],
  );

  const selectedWorkspaceId = useMemo(() => {
    if (userWorkspaces.length === 0) return undefined;
    if (
      preferredWorkspaceId &&
      userWorkspaces.some((workspace) => workspace._id === preferredWorkspaceId)
    ) {
      return preferredWorkspaceId;
    }
    return userWorkspaces[0]._id;
  }, [preferredWorkspaceId, userWorkspaces]);

  // Compute trash pages from reactive state so restore/delete updates instantly.
  const trashPages = useMemo(() => {
    if (!selectedWorkspaceId) return [];

    return (pages[selectedWorkspaceId] ?? [])
      .filter((page) => {
        if (!context) return false;
        return !!page.archivedAt && page.ownerId === context.userId && canReadPage(page, context);
      })
      .sort(
        (a, b) =>
          new Date(b.archivedAt ?? 0).getTime() -
          new Date(a.archivedAt ?? 0).getTime(),
      );
  }, [pages, selectedWorkspaceId, context]);

  if (!isAuthenticated) {
    return (
      <div className="trash-view-container">
        <div className="trash-view-empty">
          <p className="text-[var(--color-ink-faint)]">Not authenticated</p>
        </div>
      </div>
    );
  }

  const handleRestore = async (pageId: string) => {
    if (!selectedWorkspaceId || !jwt) return;
    try {
      await restorePage(pageId, selectedWorkspaceId, jwt);
    } catch (err) {
      console.error("[TrashView] Failed to restore page", err);
    }
  };

  const handlePermanentlyDelete = async (pageId: string) => {
    if (!selectedWorkspaceId || !jwt) return;
    try {
      await permanentlyDeletePage(pageId, selectedWorkspaceId, jwt);
      setConfirmDeleteId(null);
    } catch (err) {
      console.error("[TrashView] Failed to permanently delete page", err);
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    });
  };

  return (
    <div className="trash-view-container">
      <div className="trash-view-header">
        <div className="flex items-center gap-3 mb-6">
          <Trash2 size={24} className="text-[var(--color-ink)]" />
          <h1 className="text-2xl font-semibold text-[var(--color-ink)]">
            Trash
          </h1>
        </div>
        <p className="text-sm text-[var(--color-ink-faint)]">
          Pages you delete are moved here. They&apos;ll be permanently deleted after
          30 days.
        </p>
      </div>

      {userWorkspaces.length > 1 && (
        <div className="trash-view-workspace-selector mb-6">
          <label className="text-xs font-medium text-[var(--color-ink-faint)] block mb-2">
            Workspace
          </label>
          <select
            value={selectedWorkspaceId || ""}
            onChange={(e) => setPreferredWorkspaceId(e.target.value === "" ? undefined : e.target.value)}
            className="w-full px-3 py-2 text-sm rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)] hover:border-[var(--color-border-hover)] focus:outline-none focus:border-[var(--color-accent)]"
          >
            <option value="">Select a workspace</option>
            {userWorkspaces.map((ws) => (
              <option key={ws._id} value={ws._id}>
                {ws.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="trash-view-content">
        {trashPages.length === 0 ? (
          <div className="trash-view-empty">
            <Trash2 size={48} className="text-[var(--color-ink-faint)] mb-3" />
            <p className="text-[var(--color-ink-faint)] text-center">
              No pages in trash
            </p>
          </div>
        ) : (
          <div className="trash-view-list">
            {trashPages.map((page) => (
              <div
                key={page._id}
                className="trash-page-item"
              >
                <div className="trash-page-info">
                  <div className="flex items-center gap-2 mb-1">
                    {page.icon && (
                      <span className="text-lg flex-shrink-0">{page.icon}</span>
                    )}
                    <h3 className="text-sm font-medium text-[var(--color-ink)] truncate">
                      {page.title}
                    </h3>
                  </div>
                  <p className="text-xs text-[var(--color-ink-faint)]">
                    Moved to trash {formatDate(page.archivedAt)}
                  </p>
                </div>

                <div className="trash-page-actions">
                  <button
                    type="button"
                    className="trash-btn-restore"
                    onClick={() => handleRestore(page._id)}
                    title="Restore page"
                  >
                    <Redo2 size={14} />
                    <span>Restore</span>
                  </button>

                  {confirmDeleteId === page._id ? (
                    <>
                      <button
                        type="button"
                        className="trash-btn-confirm-delete"
                        onClick={() => handlePermanentlyDelete(page._id)}
                      >
                        <Trash size={14} />
                        <span>Confirm Delete</span>
                      </button>
                      <button
                        type="button"
                        className="trash-btn-cancel"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="trash-btn-delete"
                      onClick={() => setConfirmDeleteId(page._id)}
                      title="Permanently delete page"
                    >
                      <Trash size={14} />
                      <span>Delete</span>
                    </button>
                  )}
                </div>

                {confirmDeleteId === page._id && (
                  <div className="trash-page-warning">
                    <AlertTriangle size={14} className="flex-shrink-0" />
                    <span className="text-xs">
                      This will permanently delete this page. This cannot be
                      undone.
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
