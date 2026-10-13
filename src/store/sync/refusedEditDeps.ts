/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   refusedEditDeps.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The real side of the refused-edit recovery: the bridge calls and the store writes
 * ./refusedEditRecovery.ts decides on, built from the page store, the bridge client
 * and the toast store. Kept apart from the decision so the canvas runner (which
 * cannot load import.meta.env or a JSON module) can test the recovery without them.
 */

import { api, ApiError, getActivePageJwt } from "@/shared/api/client";
import { usePageStore } from "@/store/usePageStore";
import { useToastStore } from "@/shared/ui";
import { derivePageState, savePagesCache } from "@/store/pageStore.helpers";
import { evictPageFromState } from "@/store/evictLocalPage";
import type { PageEntry } from "@/entities/page";
import type { RecoveryDeps } from "./refusedEditRecovery";

/** The server's copy of a page, or the reason it cannot be read. O(1) + the GET. */
async function fetchServerPage(id: string): Promise<PageEntry | "unreadable" | "failed"> {
  try {
    const page = await api.get<PageEntry>(
      `/api/pages/${encodeURIComponent(id)}`,
      getActivePageJwt() ?? undefined,
    );
    // A 200 with no page is a bridge that lost the row: not unreadable (it may
    // simply not be in the response yet), so retry next cycle instead.
    return page ?? "failed";
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      return "unreadable";
    }
    return "failed";
  }
}

/** Put the server's copy of `entry` where the local one sits. O(w + p). */
function replacePageEntry(
  pages: Record<string, PageEntry[]>,
  entry: PageEntry,
  localWorkspaceId: string | undefined,
): Record<string, PageEntry[]> {
  // A server-side move: the local copy sits in another bucket, and leaving it there
  // would list the page twice (once per workspace) under one id.
  const moved = localWorkspaceId !== undefined && localWorkspaceId !== entry.workspaceId;
  const base = moved
    ? { ...pages, [localWorkspaceId]: (pages[localWorkspaceId] ?? []).filter((page) => page._id !== entry._id) }
    : pages;
  const bucket = base[entry.workspaceId] ?? [];
  const replaced = bucket.map((page) => (page._id === entry._id ? entry : page));
  if (replaced.some((page) => page === entry)) {
    return { ...base, [entry.workspaceId]: replaced };
  }
  return { ...base, [entry.workspaceId]: [entry, ...bucket] };
}

/** Swap the local copy for the server's, in the store and in the cache. O(w + p). */
function replaceLocalPage(entry: PageEntry): void {
  const localWorkspaceId = usePageStore.getState().pagesIndex[entry._id]?.workspaceId;
  usePageStore.setState((state) => ({
    ...derivePageState(replacePageEntry(state.pages, entry, localWorkspaceId), state.pageIdsByWorkspace),
  }));
  const pages = usePageStore.getState().pages;
  savePagesCache(pages, entry.workspaceId);
  if (localWorkspaceId !== undefined && localWorkspaceId !== entry.workspaceId) {
    savePagesCache(pages, localWorkspaceId);
  }
}

/** Drop a page the viewer can no longer read, wherever it lives. O(1) + the rewrite. */
function evictLocalPage(id: string): void {
  const workspaceId = usePageStore.getState().pagesIndex[id]?.workspaceId;
  if (workspaceId === undefined) return; // already gone locally, nothing to drop
  usePageStore.setState((state) => evictPageFromState(state, workspaceId, id));
  savePagesCache(usePageStore.getState().pages, workspaceId);
}

/** Build the recovery's dependencies from the real stores and the bridge client. */
export function refusedEditDeps(): RecoveryDeps {
  return {
    fetchServerPage,
    createCopy: async (input) => {
      // Ponytail: the copy drops page properties — AddPageOptions has no field for them; content, title and icon survive.
      return await usePageStore.getState().addPage(
        input.workspaceId,
        input.title,
        getActivePageJwt() ?? "",
        undefined,
        { content: input.content, icon: input.icon, visibility: "private" },
      );
    },
    replaceLocalPage,
    evictLocalPage,
    notify: (toast) => {
      // Sticky (durationMs null): a refused edit is a loss the reader must act on,
      // never one that times out of sight before they have read where the work went.
      useToastStore.getState().push({ ...toast, durationMs: null });
    },
  };
}
