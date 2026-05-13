/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageAccess.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:24:46 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/13 13:52:58 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type {
  PageCollaborator,
  PageCollaboratorRole,
  PageEntry,
  PageVisibility,
} from "@/entities/page";
import type { UserSession } from "@/entities/user";
import { useSyncExternalStore } from "react";

export interface PageAccessContext {
  userId: string;
  workspaceIds: string[];
  privateWorkspaceIds: string[];
  sharedWorkspaceIds: string[];
}

interface PlaygroundUserStoreLike {
  getState: () => {
    activeSession: () => UserSession | null;
  };
  subscribe: (listener: () => void) => () => void;
}

const USER_STORE_KEY = "__playgroundUserStore";
let lastAccessSession: UserSession | null | undefined;
let lastAccessContext: PageAccessContext | null = null;

function getUserStore(): PlaygroundUserStoreLike | undefined {
  return (globalThis as Record<string, unknown>)[USER_STORE_KEY] as
    | PlaygroundUserStoreLike
    | undefined;
}

function createMemoizedPageAccessContext(
  session: UserSession | null | undefined,
): PageAccessContext | null {
  if (session === lastAccessSession) return lastAccessContext;
  lastAccessSession = session;
  lastAccessContext = createPageAccessContext(session);
  return lastAccessContext;
}

function subscribeToUserStore(listener: () => void): () => void {
  return getUserStore()?.subscribe(listener) ?? (() => undefined);
}

function getPageAccessSnapshot(): PageAccessContext | null {
  const store = getUserStore();
  if (!store) return null;

  try {
    return createMemoizedPageAccessContext(store.getState().activeSession());
  } catch {
    return null;
  }
}

export function createPageAccessContext(
  session: UserSession | null | undefined,
): PageAccessContext | null {
  if (!session) return null;

  const privateWorkspaceIds = session.privateWorkspaces.map(
    (workspace) => workspace._id,
  );
  const sharedWorkspaceIds = session.sharedWorkspaces.map(
    (workspace) => workspace._id,
  );
  const workspaceIds = [...privateWorkspaceIds, ...sharedWorkspaceIds];

  return {
    userId: session.userId,
    workspaceIds,
    privateWorkspaceIds,
    sharedWorkspaceIds,
  };
}

export function getCurrentPageAccessContext(): PageAccessContext | null {
  return getPageAccessSnapshot();
}

export function usePageAccessContext(): PageAccessContext | null {
  return useSyncExternalStore(
    subscribeToUserStore,
    getPageAccessSnapshot,
    getPageAccessSnapshot,
  );
}

export function normalizePageVisibility(value: unknown): PageVisibility {
  if (value === "shared" || value === "public") return value;
  return "private";
}

function getCollaboratorRole(
  page: PageEntry,
  userId: string,
): PageCollaboratorRole | null {
  const collaborators = page.collaborators ?? [];
  return (
    collaborators.find((collaborator) => collaborator.userId === userId)
      ?.role ?? null
  );
}

function hasWorkspaceAccess(
  page: PageEntry,
  context: PageAccessContext,
): boolean {
  return context.workspaceIds.includes(page.workspaceId);
}

function isLegacyPage(page: PageEntry): boolean {
  return (
    page.ownerId == null &&
    page.visibility == null &&
    (page.collaborators?.length ?? 0) === 0
  );
}

export function canReadPage(
  page: PageEntry,
  context: PageAccessContext | null,
): boolean {
  if (!context || !hasWorkspaceAccess(page, context)) return false;

  const visibility = normalizePageVisibility(page.visibility);
  if (visibility === "public") return true;
  if (visibility === "shared") return true;

  if (page.ownerId && page.ownerId === context.userId) return true;

  if (isLegacyPage(page)) return true;

  return getCollaboratorRole(page, context.userId) !== null;
}

export function canEditPage(
  page: PageEntry,
  context: PageAccessContext | null,
): boolean {
  if (!context || !hasWorkspaceAccess(page, context)) return false;

  if (context.sharedWorkspaceIds.includes(page.workspaceId)) return true;

  if (page.ownerId && page.ownerId === context.userId) return true;

  if (isLegacyPage(page)) return true;

  const collaboratorRole = getCollaboratorRole(page, context.userId);
  return collaboratorRole === "editor" || collaboratorRole === "owner";
}

export function canDeletePage(
  page: PageEntry,
  context: PageAccessContext | null,
): boolean {
  return canEditPage(page, context);
}

export function canDuplicatePage(
  page: PageEntry,
  context: PageAccessContext | null,
): boolean {
  return canReadPage(page, context);
}

export function canMovePage(
  page: PageEntry,
  targetWorkspaceId: string,
  context: PageAccessContext | null,
): boolean {
  if (!context || !hasWorkspaceAccess(page, context)) return false;
  if (!context.workspaceIds.includes(targetWorkspaceId)) return false;
  if (!canEditPage(page, context)) return false;

  // Only the page owner can move a page to a private workspace.
  // Non-owners can duplicate instead to get their own copy.
  const isTargetPrivate = context.privateWorkspaceIds.includes(targetWorkspaceId);
  if (isTargetPrivate && page.ownerId && page.ownerId !== context.userId) {
    return false;
  }

  return true;
}

export function getTargetWorkspaceMoveVisibility(
  targetWorkspaceId: string,
  context: PageAccessContext | null,
  fallback: PageVisibility | null | undefined,
): PageVisibility {
  if (!context) return normalizePageVisibility(fallback);
  if (context.sharedWorkspaceIds.includes(targetWorkspaceId)) return "shared";
  if (context.privateWorkspaceIds.includes(targetWorkspaceId)) return "private";
  return normalizePageVisibility(fallback);
}

export function getPageCollaboratorList(
  collaborators: PageCollaborator[] | undefined,
): PageCollaborator[] {
  return collaborators
    ? collaborators.map((collaborator) => ({ ...collaborator }))
    : [];
}
