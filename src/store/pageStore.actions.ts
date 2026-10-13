/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageStore.actions.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/12 23:14:08 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { api, ApiError, getActivePageJwt } from "@/shared/api/client";
import { notifyCreateFailure } from "./pageCreateFeedback";
import { pageApiJwtFromSessionToken } from "@/features/auth/model/userStore.helpers";
import { useToastStore } from "@osionos/ui/primitives/useToastStore";
import { planDuplicate } from "./duplicatePlan";
import { evictPageFromState } from "./evictLocalPage";
import {
  canDeletePage,
  canDuplicatePage,
  canEditPage,
  canMovePage,
  canReadPage,
  getTargetWorkspaceMoveVisibility,
  getCurrentPageAccessContext,
} from "@/shared/lib/auth/pageAccess";
import { SEED_PAGES } from "../data/seedPages";
import {
  seedToEntry,
  localId,
  updatePageInState,
  isPersistedPageId,
  saveRecents,
  addRecent,
  getAllDescendantIds,
  savePagesCache,
  derivePageState,
  mergeWorkspacePages,
  isValidMove,
  nextDuplicateTitle,
  instantiateTemplateContent,
} from "./pageStore.helpers";
import {
  cascadeIdsFrom,
  applyArchived,
  applyDeleted,
} from "./pageCascadeResult";
import type { AddPageOptions, PageEntry, PageStore, ActivePage, PageRecurrence } from "@/entities/page";

type SetFn = (
  partial: Partial<PageStore> | ((s: PageStore) => Partial<PageStore>),
) => void;
type GetFn = () => PageStore;

export function createSeedOfflinePages(set: SetFn, get: GetFn) {
  return () => {
    if (get().seeded) return;
    const existingPages = get().pages;
    if (Object.keys(existingPages).length > 0) {
      const mergedPages = mergeMissingSeedPages(existingPages);
      set((s) => ({ ...derivePageState(mergedPages, s.pageIdsByWorkspace), seeded: true }));
      savePagesCache(mergedPages);
      return;
    }
    const grouped: Record<string, PageEntry[]> = {};
    for (const sp of SEED_PAGES) {
      if (!grouped[sp.workspaceId]) grouped[sp.workspaceId] = [];
      grouped[sp.workspaceId].push(seedToEntry(sp));
    }
    set((s) => ({ ...derivePageState(grouped, s.pageIdsByWorkspace), seeded: true }));
    savePagesCache(grouped);
  };
}

function mergeMissingSeedPages(existingPages: Record<string, PageEntry[]>): Record<string, PageEntry[]> {
  const pages = { ...existingPages };
  for (const seedPage of SEED_PAGES) {
    const workspacePages = pages[seedPage.workspaceId] ?? [];
    if (workspacePages.some((page) => page._id === seedPage._id)) continue;
    pages[seedPage.workspaceId] = [...workspacePages, seedToEntry(seedPage)];
  }
  return pages;
}

export function createSeedOnlinePages(set: SetFn, get: GetFn) {
  return async (workspaceMap: Record<string, string>, jwt: string) => {
    if (get().seeded) return;
    const pageJwt = pageApiJwtFromSessionToken(jwt);
    if (!pageJwt) return;
    set({ seeded: true });
    const verifiedWorkspaces = new Set<string>();
    for (const sp of SEED_PAGES) {
      const realWsId = workspaceMap[sp.workspaceId];
      if (!realWsId) continue;
      // Idempotency: confirm emptiness against the SERVER, not just the client cache
      // (which can be momentarily empty during init — that race spawned the duplicate
      // "Getting Started" seeds). Fetch once per workspace, then re-check.
      if (!verifiedWorkspaces.has(realWsId)) {
        await get().fetchPages(realWsId, jwt);
        verifiedWorkspaces.add(realWsId);
      }
      if ((get().pages[realWsId] ?? []).length > 0) continue;
      try {
        const page = await api.post<PageEntry>(
          "/api/pages",
          {
            workspaceId: realWsId,
            title: sp.title,
            icon: sp.icon,
            databaseId: sp.databaseId ?? undefined,
            content: sp.content,
            ownerId: sp.ownerId ?? undefined,
            visibility: sp.visibility,
            collaborators: sp.collaborators,
            isTemplate: sp.isTemplate,
            isDefaultTemplate: sp.isDefaultTemplate,
            templateSurface: sp.templateSurface,
            surface: sp.surface,
          },
          pageJwt,
        );
        set((s) => ({
          ...derivePageState({
            ...s.pages,
            [realWsId]: [...(s.pages[realWsId] ?? []), page],
          }, s.pageIdsByWorkspace),
        }));
        savePagesCache(get().pages, realWsId);
      } catch (err) {
        console.warn("[pageStore] Failed to seed page:", sp.title, err);
      }
    }
  };
}

/** Client-side freshness window for `/api/pages/all`. A sidebar/panel remount within this
 *  window resolves against the already-fetched store copy instead of re-pulling the whole
 *  workspace list; an explicit user refresh can pass `force` to bypass it. Complements (does
 *  not replace) the in-flight guard below and the api client's shared-GET collapse. */
const FETCH_PAGES_TTL_MS = 30_000;
const lastFetchedAt = new Map<string, number>();

export function createFetchPages(set: SetFn, get: GetFn) {
  // `force` (default false) is an extra optional arg — assignable to the 2-param PageStore
  // type, so existing callers are unchanged; an explicit-refresh call site can pass true.
  return async (workspaceId: string, jwt: string, force = false) => {
    const pageJwt = pageApiJwtFromSessionToken(jwt);
    if (!pageJwt) return;
    const context = getCurrentPageAccessContext();
    if (context && !context.workspaceIds.includes(workspaceId)) return;
    if (get().loadingIds.has(workspaceId)) return;
    // Freshness TTL: a workspace pulled within the window is treated as current, so an
    // incidental remount resolves without a network round-trip. force always re-pulls.
    if (!force) {
      const fetchedAt = lastFetchedAt.get(workspaceId);
      if (fetchedAt !== undefined && Date.now() - fetchedAt < FETCH_PAGES_TTL_MS) return;
    }
    set((s) => ({ loadingIds: new Set([...s.loadingIds, workspaceId]) }));
    try {
      const data = await api.get<PageEntry[]>(
        `/api/pages/all?workspaceId=${workspaceId}`,
        pageJwt,
      );
      lastFetchedAt.set(workspaceId, Date.now()); // stamp only after a confirmed pull
      set((s) => ({
        ...derivePageState({
          ...s.pages,
          [workspaceId]: mergeWorkspacePages(s.pages[workspaceId], data),
        }, s.pageIdsByWorkspace),
        loadingIds: new Set(
          [...s.loadingIds].filter((id) => id !== workspaceId),
        ),
      }));
      savePagesCache(get().pages, workspaceId);
    } catch {
      set((s) => ({
        loadingIds: new Set(
          [...s.loadingIds].filter((id) => id !== workspaceId),
        ),
      }));
    }
  };
}

export function createFetchPageContent(set: SetFn, get: GetFn) {
  return async (pageId: string, jwt: string) => {
    const pageJwt = pageApiJwtFromSessionToken(jwt);
    if (!pageJwt || !isPersistedPageId(pageId)) return;
    const page = get().pageById(pageId);
    const context = getCurrentPageAccessContext();
    if (!page || !canReadPage(page, context)) return;
    try {
      const fullPage = await api.get<PageEntry>(`/api/pages/${pageId}`, pageJwt);
      if (!fullPage) return;
      set((s) => ({
        ...derivePageState(updatePageInState(s.pages, pageId, (p) => {
          // Last-write-wins (same rule as hydratePages.mergePage): a background
          // fetch (search index, export prefetch, lazy mount) must never apply a
          // STALE server copy over newer local edits — e.g. a rename still inside
          // the outbox debounce window. ISO strings compare lexicographically.
          const serverNewer = (fullPage.updatedAt ?? "") > (p.updatedAt ?? "");
          return {
            ...p,
            // Filling missing content is this fetch's whole purpose — always take it.
            content: p.content === undefined || serverNewer ? (fullPage.content ?? p.content) : p.content,
            title: serverNewer ? (fullPage.title ?? p.title) : p.title,
            icon: serverNewer ? (fullPage.icon ?? p.icon) : p.icon,
            cover: serverNewer ? (fullPage.cover ?? p.cover) : p.cover,
            updatedAt: serverNewer ? (fullPage.updatedAt ?? p.updatedAt) : p.updatedAt,
          };
        }), s.pageIdsByWorkspace),
      }));
      savePagesCache(get().pages, page.workspaceId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // The page is gone server-side — a stale localStorage ghost the additive
        // hydrate (hydratePages.mergeWorkspace) never prunes. Evict it from the
        // store + cache so it stops being re-fetched in a loop and drops out of
        // the sidebar/tree instead of flooding the console with 404s. The rule
        // itself lives in ./evictLocalPage (shared with the refused-edit
        // recovery): actions cannot import the store, usePageStore imports them.
        set((s) => evictPageFromState(s, page.workspaceId, pageId));
        savePagesCache(get().pages, page.workspaceId);
        return;
      }
      console.warn("[pageStore] fetchPageContent failed:", pageId, err);
    }
  };
}

export function createAddPage(set: SetFn, get: GetFn) {
  return async (
    workspaceId: string,
    title: string,
    jwt: string,
    parentPageId?: string,
    options: AddPageOptions = {},
  ): Promise<PageEntry | null> => {
    const context = getCurrentPageAccessContext();
    if (!context?.workspaceIds.includes(workspaceId)) {
      return notifyCreateFailure("You don't have access to this workspace.");
    }
    const targetVisibility = options.visibility ?? getTargetWorkspaceMoveVisibility(
      workspaceId,
      context,
      "private",
    );
    const apiJwt = pageApiJwtFromSessionToken(jwt);

    if (apiJwt) {
      try {
        const page = await api.post<PageEntry>(
          "/api/pages",
          {
            workspaceId,
            title,
            parentPageId,
            content: options.content ?? [],
            icon: options.icon,
            ownerId: context.userId,
            visibility: targetVisibility,
            collaborators: [],
            surface: options.surface,
            isTemplate: options.isTemplate,
            isDefaultTemplate: options.isDefaultTemplate,
            templateSurface: options.templateSurface,
            recurrence: options.recurrence,
          },
          apiJwt,
        );
        const pageWithTimestamp: PageEntry = {
          ...page,
          surface: page.surface ?? options.surface,
          isTemplate: page.isTemplate ?? options.isTemplate ?? false,
          isDefaultTemplate: page.isDefaultTemplate ?? options.isDefaultTemplate ?? false,
          templateSurface: page.templateSurface ?? options.templateSurface,
          recurrence: page.recurrence ?? options.recurrence ?? null,
          updatedAt: page.updatedAt ?? new Date().toISOString(),
        };
        set((s) => ({
          ...derivePageState({
            ...s.pages,
            [workspaceId]: [...(s.pages[workspaceId] ?? []), pageWithTimestamp],
          }, s.pageIdsByWorkspace),
        }));
        savePagesCache(get().pages, workspaceId);
        return pageWithTimestamp;
      } catch (err) {
        return notifyCreateFailure(
          err instanceof ApiError
            ? err.message
            : "The server rejected the request. Check your connection and try again.",
          err,
        );
      }
    }
    const newPage: PageEntry = {
      _id: localId(),
      title,
      icon: options.icon,
      updatedAt: new Date().toISOString(),
      workspaceId,
      ownerId: context.userId,
      visibility: targetVisibility,
      collaborators: [],
      parentPageId: parentPageId ?? null,
      databaseId: null,
      archivedAt: null,
      content: options.content ?? [],
      surface: options.surface,
      isTemplate: options.isTemplate ?? false,
      isDefaultTemplate: options.isDefaultTemplate ?? false,
      templateSurface: options.templateSurface,
      recurrence: options.recurrence ?? null,
    };
    set((s) => ({
      ...derivePageState({
        ...s.pages,
        [workspaceId]: [...(s.pages[workspaceId] ?? []), newPage],
      }, s.pageIdsByWorkspace),
    }));
    savePagesCache(get().pages, workspaceId);
    return newPage;
  };
}

export function createAddDatabasePage(set: SetFn, get: GetFn) {
  return async (
    workspaceId: string,
    title: string,
    jwt: string,
    databaseId: string,
    parentPageId?: string,
  ): Promise<PageEntry | null> => {
    const context = getCurrentPageAccessContext();
    if (!context?.workspaceIds.includes(workspaceId)) {
      return null;
    }
    const targetVisibility = getTargetWorkspaceMoveVisibility(
      workspaceId,
      context,
      "private",
    );

    const apiJwt = pageApiJwtFromSessionToken(jwt);

    if (apiJwt) {
      try {
        const page = await api.post<PageEntry>(
          "/api/pages",
          {
            workspaceId,
            title,
            parentPageId,
            databaseId,
            content: [],
            icon: "icon:table",
            ownerId: context.userId,
            visibility: targetVisibility,
            collaborators: [],
          },
          apiJwt,
        );
        const pageWithTimestamp: PageEntry = {
          ...page,
          databaseId: page.databaseId ?? databaseId,
          updatedAt: page.updatedAt ?? new Date().toISOString(),
        };
        set((s) => ({
          ...derivePageState({
            ...s.pages,
            [workspaceId]: [...(s.pages[workspaceId] ?? []), pageWithTimestamp],
          }, s.pageIdsByWorkspace),
        }));
        savePagesCache(get().pages, workspaceId);
        return pageWithTimestamp;
      } catch {
        return null;
      }
    }

    const newPage: PageEntry = {
      _id: localId(),
      title,
      icon: "icon:table",
      updatedAt: new Date().toISOString(),
      workspaceId,
      ownerId: context.userId,
      visibility: targetVisibility,
      collaborators: [],
      parentPageId: parentPageId ?? null,
      databaseId,
      archivedAt: null,
      content: [],
    };
    set((s) => ({
      ...derivePageState({
        ...s.pages,
        [workspaceId]: [...(s.pages[workspaceId] ?? []), newPage],
      }, s.pageIdsByWorkspace),
    }));
    savePagesCache(get().pages, workspaceId);
    return newPage;
  };
}

export function createArchivePage(set: SetFn, get: GetFn) {
  return async (pageId: string, workspaceId: string, jwt: string) => {
    const page = get().pageById(pageId);
    const context = getCurrentPageAccessContext();
    // Archiving is a PATCH of archived_at, so it asks 'update' (bridge-api.mjs:3005),
    // not 'delete': an editor who may write but not delete still trashes a page.
    if (!page || !canEditPage(page, context)) return;

    const archivedAt = new Date().toISOString();
    const pageJwt = pageApiJwtFromSessionToken(jwt);

    if (pageJwt && isPersistedPageId(pageId)) {
      await applyCascadeOperation({
        set,
        get,
        pageId,
        workspaceId,
        apiCall: () => api.patch(`/api/pages/${pageId}`, { archivedAt }, pageJwt),
        field: "cascadedIds",
        archivedAt,
        toastTitle: `Couldn't move “${page.title || "Untitled"}” to Trash`,
      });
      return;
    }

    // No JWT or local-only page: keep today's local-only behaviour (all local descendants change)
    const wsPages = get().pages[workspaceId] ?? [];
    const descendantIds = getAllDescendantIds(wsPages, pageId);
    const archivedIds = new Set([pageId, ...descendantIds]);

    set((s) => {
      const currentWsPages = s.pages[workspaceId] ?? [];
      const nextPages = applyArchived(currentWsPages, archivedIds, archivedAt);

      const newRecents = s.recents.filter((r) => !archivedIds.has(r.id));
      if (newRecents.length !== s.recents.length) {
        saveRecents(newRecents);
      }

      const pages = { ...s.pages, [workspaceId]: nextPages };

      return {
        ...derivePageState(pages, s.pageIdsByWorkspace),
        recents: newRecents,
      };
    });
    savePagesCache(get().pages, workspaceId);
  };
}

/**
 * Applies a cascade operation (archive, restore, or delete) using server-returned IDs.
 * On API failure, pushes an error toast and makes NO local changes.
 * O(n) where n is the number of pages in the workspace.
 */
async function applyCascadeOperation(options: {
  set: SetFn;
  get: GetFn;
  pageId: string;
  workspaceId: string;
  apiCall: () => Promise<unknown>;
  field: "cascadedIds" | "deletedIds";
  archivedAt: string | null;
  toastTitle: string;
}): Promise<void> {
  const { set, get, pageId, workspaceId, apiCall, field, archivedAt, toastTitle } = options;

  let body: unknown;
  try {
    body = await apiCall();
  } catch {
    useToastStore.getState().push({
      kind: "error",
      title: toastTitle,
      description: "The server did not complete the request. Try again.",
    });
    return;
  }

  const wsPages = get().pages[workspaceId] ?? [];
  const localDescendantIds = getAllDescendantIds(wsPages, pageId);
  const ids = cascadeIdsFrom(body, pageId, localDescendantIds, field);
  const idSet = new Set(ids);

  set((s) => {
    const currentWsPages = s.pages[workspaceId] ?? [];

    let nextPages: PageEntry[];
    if (field === "cascadedIds") {
      nextPages = applyArchived(currentWsPages, idSet, archivedAt);
    } else {
      nextPages = applyDeleted(currentWsPages, idSet);
    }

    // A restore (archivedAt null) brings pages back; only trash and delete leave Recents.
    const leavesRecents = field === "deletedIds" || archivedAt !== null;
    const newRecents = leavesRecents ? s.recents.filter((r) => !idSet.has(r.id)) : s.recents;
    if (newRecents.length !== s.recents.length) {
      saveRecents(newRecents);
    }

    const pages = { ...s.pages, [workspaceId]: nextPages };
    const nextState: Partial<PageStore> = {
      ...derivePageState(pages, s.pageIdsByWorkspace),
      recents: newRecents,
    };

    if (field === "deletedIds" && s.activePage && idSet.has(s.activePage.id)) {
      nextState.activePage = null;
    }

    return nextState;
  });

  savePagesCache(get().pages, workspaceId);
}

/**
 * Build the recents entry for a duplicated root so both copy paths
 * land on the same selection instead of diverging over time.
 * O(1) time and space.
 */
function duplicateActivePage(workspaceId: string, page: PageEntry): ActivePage {
  return {
    id: page._id,
    workspaceId,
    kind: "page",
    title: page.title,
    icon: page.icon,
  };
}

/**
 * Make a server-created root active; addPage already stored the pages
 * so only the selection and recents need updating here.
 * O(1) over the capped recents list.
 */
function activateDuplicateRoot(set: SetFn, workspaceId: string, root: PageEntry): void {
  const active = duplicateActivePage(workspaceId, root);
  set((s) => {
    const recents = addRecent(s.recents, active);
    saveRecents(recents);
    return { activePage: active, recents };
  });
}

/**
 * Resolve the bridge parent for one planned step. The root keeps its
 * original parent so the copy lands beside the source; a child uses
 * the already-created server id so the hierarchy survives the copy.
 * O(1) time.
 */
function resolveDuplicateParent(
  parentSourceId: string | null,
  source: PageEntry,
  serverIds: Map<string, string>,
): string | undefined {
  if (parentSourceId === null) {
    return source.parentPageId ?? undefined;
  }
  return serverIds.get(parentSourceId);
}

/**
 * Clone the subtree with fresh local ids for sessions without a bridge.
 * Local ids never reach the server, which is why signed-in copies must
 * take the server path instead.
 * O(n) time and space over wsPages.
 */
function buildLocalClones(options: {
  wsPages: PageEntry[];
  pageId: string;
  workspaceId: string;
}): { clonedPages: PageEntry[]; newRootId: string; newRootPage: PageEntry | undefined } {
  const context = getCurrentPageAccessContext();
  const descendantIds = getAllDescendantIds(options.wsPages, options.pageId);
  const allIdsToClone = [options.pageId, ...descendantIds];
  const pagesToClone = options.wsPages.filter((p) => allIdsToClone.includes(p._id));
  const idMap: Record<string, string> = {};
  allIdsToClone.forEach((id) => {
    idMap[id] = localId();
  });
  const clonedPages: PageEntry[] = pagesToClone.map((p) => {
    const newId = idMap[p._id];
    const isRoot = p._id === options.pageId;
    return {
      ...p,
      _id: newId,
      title: isRoot ? nextDuplicateTitle(p.title) : p.title,
      ownerId: context?.userId ?? p.ownerId ?? null,
      visibility: getTargetWorkspaceMoveVisibility(options.workspaceId, context, p.visibility),
      collaborators: [],
      parentPageId: p.parentPageId ? (idMap[p.parentPageId] ?? p.parentPageId) : p.parentPageId,
    };
  });
  const newRootId = idMap[options.pageId];
  const newRootPage = clonedPages.find((p) => p._id === newRootId);
  return { clonedPages, newRootId, newRootPage };
}

/**
 * Insert local clones beside the source and activate the copy.
 * This keeps signed-out sessions working without any bridge call.
 * O(n) for the clone build plus O(n) for the insert.
 */
function duplicateLocally(options: {
  set: SetFn;
  get: GetFn;
  pageId: string;
  workspaceId: string;
}): string | null {
  const wsPages = options.get().pages[options.workspaceId] ?? [];
  const built = buildLocalClones({ wsPages, pageId: options.pageId, workspaceId: options.workspaceId });
  const { pageId, workspaceId } = options;
  const { clonedPages, newRootId, newRootPage } = built;
  options.set((s) => {
    const currentWsPages = s.pages[workspaceId] ?? [];
    const rootIdx = currentWsPages.findIndex((p) => p._id === pageId);
    const nextPages = [...currentWsPages];
    // Keep the copy beside the source so the tree order matches expectation.
    nextPages.splice(rootIdx + 1, 0, ...clonedPages);
    const nextAllPages = { ...s.pages, [workspaceId]: nextPages };
    savePagesCache(nextAllPages, workspaceId);
    if (newRootPage) {
      const newActivePage = duplicateActivePage(workspaceId, newRootPage);
      const recents = addRecent(s.recents, newActivePage);
      saveRecents(recents);
      return { ...derivePageState(nextAllPages, s.pageIdsByWorkspace), activePage: newActivePage, recents };
    }
    return derivePageState(nextAllPages, s.pageIdsByWorkspace);
  });
  return newRootId;
}

/**
 * Tell the user a server copy stopped partway; pages already made stay.
 * O(1) time.
 */
function notifyDuplicateFailure(rootTitle: string): void {
  useToastStore.getState().push({
    kind: "error",
    title: `Couldn't duplicate “${rootTitle}”`,
    description: "Some pages may have been copied. Try again.",
  });
}

interface DuplicateServerOptions {
  get: GetFn;
  set: SetFn;
  pageId: string;
  workspaceId: string;
  sessionJwt: string;
}

/**
 * Replay the duplicate plan through the bridge, parent before child.
 * Server-minted ids survive the next hydrate, unlike local ids.
 * O(n) over the subtree plus one bridge call per copied page.
 */
async function duplicateViaServer(options: DuplicateServerOptions): Promise<string | null> {
  const wsPages = options.get().pages[options.workspaceId] ?? [];
  const byId = new Map<string, PageEntry>(wsPages.map((page): [string, PageEntry] => [page._id, page]));
  const root = byId.get(options.pageId);
  const rootTitle = root ? root.title : "";
  const plan = planDuplicate(wsPages, options.pageId);
  const serverIds = new Map<string, string>();
  let rootServerId: string | null = null;
  let createdRoot: PageEntry | null = null;
  for (const step of plan) {
    const source = byId.get(step.sourceId);
    if (source === undefined) continue;
    const parentSourceId = step.parentSourceId;
    const title = parentSourceId === null ? nextDuplicateTitle(source.title) : source.title;
    const parentPageId = resolveDuplicateParent(parentSourceId, source, serverIds);
    if (parentSourceId !== null && parentPageId === undefined) continue;
    const created = await options.get().addPage(options.workspaceId, title, options.sessionJwt, parentPageId, {
      content: source.content,
      icon: source.icon,
      surface: source.surface,
      // Same visibility rule as the local copy, so a shared page's copy stays shared.
      visibility: getTargetWorkspaceMoveVisibility(options.workspaceId, getCurrentPageAccessContext(), source.visibility),
    });
    if (created === null) {
      notifyDuplicateFailure(rootTitle);
      return rootServerId;
    }
    serverIds.set(step.sourceId, created._id);
    if (parentSourceId === null) {
      rootServerId = created._id;
      createdRoot = created;
    }
  }
  if (createdRoot !== null) activateDuplicateRoot(options.set, options.workspaceId, createdRoot);
  return rootServerId;
}

export function createDuplicatePage(set: SetFn, get: GetFn) {
  return async (pageId: string, workspaceId: string): Promise<string | null> => {
    const context = getCurrentPageAccessContext();
    const wsPages = get().pages[workspaceId] ?? [];
    const rootPage = wsPages.find((p) => p._id === pageId);
    if (!rootPage || !canDuplicatePage(rootPage, context)) return null;
    // Local ids vanish on the next hydrate when signed in, so a persisted
    // root must be replayed through the bridge parent-before-child.
    const sessionJwt = getActivePageJwt();
    const apiJwt = pageApiJwtFromSessionToken(sessionJwt);
    if (apiJwt !== "" && sessionJwt && !pageId.startsWith("local-page-")) {
      return duplicateViaServer({ get, set, pageId, workspaceId, sessionJwt });
    }
    return duplicateLocally({ set, get, pageId, workspaceId });
  };
}

export function createAddTemplate(_set: SetFn, get: GetFn) {
  return async (
    workspaceId: string,
    jwt: string,
    options: { title?: string; icon?: string } = {},
  ): Promise<PageEntry | null> => {
    const page = await get().addPage(
      workspaceId,
      options.title ?? "Untitled template",
      jwt,
      undefined,
      { icon: options.icon, isTemplate: true },
    );
    if (page) {
      get().openPage({ id: page._id, workspaceId, kind: "page", title: page.title, icon: page.icon });
    }
    return page;
  };
}

export function createSetDefaultTemplate(_set: SetFn, get: GetFn) {
  return (templateId: string, workspaceId: string) => {
    for (const template of get().templatePages(workspaceId)) {
      const shouldBeDefault = template._id === templateId;
      if ((template.isDefaultTemplate ?? false) !== shouldBeDefault) {
        get().patchPage(template._id, { isDefaultTemplate: shouldBeDefault });
      }
    }
  };
}

export function createCreatePageFromTemplate(_set: SetFn, get: GetFn) {
  return async (
    templateId: string,
    workspaceId: string,
    jwt: string,
    parentPageId?: string,
    options?: { open?: boolean },
  ): Promise<PageEntry | null> => {
    // Template content is lazy-loaded; hydrate it before cloning (no-op offline).
    await get().fetchPageContent(templateId, jwt);
    const template = get().pageById(templateId);
    if (!template?.isTemplate) return null;
    const content = instantiateTemplateContent(template.content);
    const page = await get().addPage(
      workspaceId,
      template.title || "Untitled",
      jwt,
      parentPageId,
      { icon: template.icon, content },
    );
    if (page && options?.open !== false) {
      get().openPage({ id: page._id, workspaceId, kind: "page", title: page.title, icon: page.icon });
    }
    return page;
  };
}

export function createPatchTemplateRecurrence(_set: SetFn, get: GetFn) {
  return (templateId: string, recurrence: PageRecurrence) => {
    get().patchPage(templateId, { recurrence });
  };
}

export function createReorderSibling(set: SetFn) {
  return (
    pageId: string,
    targetSiblingId: string,
    placeBefore: boolean,
    workspaceId: string,
  ) => {
    if (pageId === targetSiblingId) return;
    const orderOf = (p: PageEntry) =>
      typeof p.sortOrder === "number" ? p.sortOrder : Number.MAX_SAFE_INTEGER;
    set((s) => {
      const list = s.pages[workspaceId];
      if (!list) return s;
      const moving = list.find((p) => p._id === pageId);
      const target = list.find((p) => p._id === targetSiblingId);
      if (!moving || !target) return s;
      const newParent = target.parentPageId ?? null;
      // Same-parent siblings (minus the moved page), in current order, to find
      // the neighbour we land between and pick a fractional sort_order.
      const siblings = list
        .filter((p) => (p.parentPageId ?? null) === newParent && p._id !== pageId)
        .sort((a, b) => orderOf(a) - orderOf(b));
      const ti = siblings.findIndex((p) => p._id === targetSiblingId);
      const tOrder = orderOf(target);
      let order: number;
      if (placeBefore) {
        const prev = siblings[ti - 1];
        order = prev ? (orderOf(prev) + tOrder) / 2 : tOrder - 1;
      } else {
        const next = siblings[ti + 1];
        order = next ? (tOrder + orderOf(next)) / 2 : tOrder + 1;
      }
      // Bump updatedAt so the offline outbox syncs the new order to the BaaS.
      const moved = {
        ...moving,
        parentPageId: newParent,
        sortOrder: order,
        updatedAt: new Date().toISOString(),
      };
      const nextList = list.map((p) => (p._id === pageId ? moved : p));
      const nextPages = { ...s.pages, [workspaceId]: nextList };
      savePagesCache(nextPages, workspaceId);
      return derivePageState(nextPages, s.pageIdsByWorkspace);
    });
  };
}

export function createMovePage(set: SetFn, get: GetFn) {
  return (
    pageId: string,
    targetParentId: string | null,
    targetWorkspaceId: string,
  ) => {
    const state = get();
    const allPagesRecord = state.pages;
    const context = getCurrentPageAccessContext();

    // 1. Validate move
    if (!isValidMove(allPagesRecord, pageId, targetParentId)) {
      console.error("[pageStore] Invalid move operation", {
        pageId,
        targetParentId,
      });
      return;
    }

    // 2. Find the page and its source workspace
    let sourceWorkspaceId: string | null = null;
    let targetPage: PageEntry | null = null;

    for (const wsId of Object.keys(allPagesRecord)) {
      const page = allPagesRecord[wsId].find((p) => p._id === pageId);
      if (page) {
        sourceWorkspaceId = wsId;
        targetPage = page;
        break;
      }
    }

    if (!sourceWorkspaceId || !targetPage) {
      console.error("[pageStore] Page not found for move", { pageId });
      return;
    }

    if (!canMovePage(targetPage, targetWorkspaceId, context)) {
      console.error("[pageStore] Unauthorized move operation", {
        pageId,
        targetWorkspaceId,
      });
      return;
    }

    // 3. Perform atomic update
    set((s) => {
      const nextPages = { ...s.pages };

      if (sourceWorkspaceId === targetWorkspaceId) {
        // Simple re-parenting within same workspace
        nextPages[sourceWorkspaceId] = nextPages[sourceWorkspaceId].map((p) =>
          p._id === pageId ? { ...p, parentPageId: targetParentId ?? null } : p,
        );

        savePagesCache(nextPages, sourceWorkspaceId);
        return derivePageState(nextPages, s.pageIdsByWorkspace);
      } else {
        // Cross-workspace move
        const sourceList = nextPages[sourceWorkspaceId] ?? [];
        const descendantIds = getAllDescendantIds(sourceList, pageId);
        const allIdsToMove = new Set([pageId, ...descendantIds]);

        const pagesToMove = sourceList
          .filter((p) => allIdsToMove.has(p._id))
          .map((p) => ({
            ...p,
            workspaceId: targetWorkspaceId,
            visibility: getTargetWorkspaceMoveVisibility(
              targetWorkspaceId,
              context,
              p.visibility,
            ),
            parentPageId:
              p._id === pageId
                ? (targetParentId ?? null)
                : (p.parentPageId ?? null),
          }));

        // Remove from source
        nextPages[sourceWorkspaceId] = sourceList.filter(
          (p) => !allIdsToMove.has(p._id),
        );

        // Add to target
        nextPages[targetWorkspaceId] = [
          ...(nextPages[targetWorkspaceId] ?? []),
          ...pagesToMove,
        ];

        // Update recents and activePage if they are affected by workspace change
        const updatedRecents = s.recents.map((r) =>
          allIdsToMove.has(r.id) ? { ...r, workspaceId: targetWorkspaceId } : r,
        );

        let updatedActivePage = s.activePage;
        if (s.activePage && allIdsToMove.has(s.activePage.id)) {
          updatedActivePage = {
            ...s.activePage,
            workspaceId: targetWorkspaceId,
          };
        }

        saveRecents(updatedRecents);
        savePagesCache(nextPages, [sourceWorkspaceId, targetWorkspaceId]);

        return {
          ...derivePageState(nextPages, s.pageIdsByWorkspace),
          recents: updatedRecents,
          activePage: updatedActivePage,
        };
      }
    });
  };
}

export function createRestorePage(set: SetFn, get: GetFn) {
  return async (pageId: string, workspaceId: string, jwt: string) => {
    const page = get().pageById(pageId);
    const context = getCurrentPageAccessContext();
    // Restoring clears archived_at with the same PATCH as archiving — 'update'.
    if (!page || !canEditPage(page, context)) return;

    const pageJwt = pageApiJwtFromSessionToken(jwt);

    if (pageJwt && isPersistedPageId(pageId)) {
      await applyCascadeOperation({
        set,
        get,
        pageId,
        workspaceId,
        apiCall: () => api.patch(`/api/pages/${pageId}`, { archivedAt: null }, pageJwt),
        field: "cascadedIds",
        archivedAt: null,
        toastTitle: `Couldn't restore “${page.title || "Untitled"}”`,
      });
      return;
    }

    // No JWT or local-only page: keep today's local-only behaviour (all local descendants change)
    const wsPages = get().pages[workspaceId] ?? [];
    const descendantIds = getAllDescendantIds(wsPages, pageId);
    const restoredIds = new Set([pageId, ...descendantIds]);

    set((s) => {
      const currentWsPages = s.pages[workspaceId] ?? [];
      const nextPages = applyArchived(currentWsPages, restoredIds, null);

      return derivePageState({ ...s.pages, [workspaceId]: nextPages }, s.pageIdsByWorkspace);
    });
    savePagesCache(get().pages, workspaceId);
  };
}

export function createPermanentlyDeletePage(set: SetFn, get: GetFn) {
  return createDeletePage(set, get);
}

export function createDeletePage(set: SetFn, get: GetFn) {
  return async (pageId: string, workspaceId: string, jwt: string) => {
    const page = get().pageById(pageId);
    const context = getCurrentPageAccessContext();
    if (!page || !canDeletePage(page, context)) return;

    const pageJwt = pageApiJwtFromSessionToken(jwt);

    if (pageJwt && isPersistedPageId(pageId)) {
      await applyCascadeOperation({
        set,
        get,
        pageId,
        workspaceId,
        apiCall: () => api.delete(`/api/pages/${pageId}`, pageJwt),
        field: "deletedIds",
        archivedAt: null,
        toastTitle: `Couldn't delete “${page.title || "Untitled"}”`,
      });
      return;
    }

    // No JWT or local-only page: keep today's local-only behaviour (all local descendants change)
    const wsPages = get().pages[workspaceId] ?? [];
    const descendantIds = getAllDescendantIds(wsPages, pageId);
    const deletedIds = new Set([pageId, ...descendantIds]);

    set((s) => {
      const currentWsPages = s.pages[workspaceId] ?? [];
      const nextPages = applyDeleted(currentWsPages, deletedIds);

      const newRecents = s.recents.filter((r) => !deletedIds.has(r.id));
      if (newRecents.length !== s.recents.length) {
        saveRecents(newRecents);
      }

      const pages = { ...s.pages, [workspaceId]: nextPages };

      return {
        ...derivePageState(pages, s.pageIdsByWorkspace),
        activePage:
          s.activePage && deletedIds.has(s.activePage.id) ? null : s.activePage,
        recents: newRecents,
      };
    });
    savePagesCache(get().pages, workspaceId);
  };
}
