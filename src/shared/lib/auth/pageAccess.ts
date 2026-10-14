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
import type { UserSession, Workspace } from "@/entities/user";
import { useSyncExternalStore } from "react";

/** The caller's own workspace membership — the osionos_workspace_members row. */
export interface PageMemberAccess {
  role: string;
  permissions: string[];
}

export interface PageAccessContext {
  userId: string;
  workspaceIds: string[];
  privateWorkspaceIds: string[];
  sharedWorkspaceIds: string[];
  /** The caller's membership per workspace, keyed by LOWER-CASE id; absent offline. */
  memberAccess?: Record<string, PageMemberAccess>;
  /**
   * Pages whose write the bridge refused this session. OPTIONAL so a context built by
   * hand in an existing test (without the field) still type-checks — the gates use
   * `?.` and treat an absent set as "nothing refused yet".
   */
  refusedPageIds?: Set<string>;
}

/** The permission a page write needs, as the bridge's PATCH/DELETE routes ask for it. */
type PageWritePermission = "create" | "update" | "delete";

const OWNER_PERMISSIONS = ["create", "read", "update", "delete", "admin"];
const SHARED_PERMISSIONS = ["create", "read", "update", "delete"];

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
  const stores = globalThis as Record<string, unknown>;
  return stores[USER_STORE_KEY] as PlaygroundUserStoreLike | undefined;
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

/** The caller's session as the read/write gates see it. O(w) over its workspaces. */
export function createPageAccessContext(session: UserSession | null | undefined): PageAccessContext | null {
  if (!session) return null;
  const privateWorkspaces = session.privateWorkspaces.map((workspace) => workspace._id);
  const sharedWorkspaces = session.sharedWorkspaces.map((workspace) => workspace._id);
  return {
    userId: session.userId,
    workspaceIds: [...privateWorkspaces, ...sharedWorkspaces],
    privateWorkspaceIds: privateWorkspaces,
    sharedWorkspaceIds: sharedWorkspaces,
    memberAccess: memberAccessOf(session),
    refusedPageIds: new Set<string>(),
  };
}

/**
 * The caller's membership per workspace, from the top-level `role` / `permissions` the
 * bridge stamps onto a session workspace. NEVER settings.role / settings.permissions: a
 * bridge-created workspace stores the CREATOR's owner settings there (groot
 * models/osionos-bridge-migration.sql:392-404), which would make every member an owner.
 * O(w) over the session's workspaces.
 */
function memberAccessOf(session: UserSession): Record<string, PageMemberAccess> {
  const memberAccess: Record<string, PageMemberAccess> = {};
  const groups: Array<[Workspace[], string, string[]]> = [
    [session.privateWorkspaces, "owner", OWNER_PERMISSIONS],
    [session.sharedWorkspaces, "editor", SHARED_PERMISSIONS],
  ];
  for (const [workspaces, fallbackRole, fallbackPermissions] of groups) {
    for (const workspace of workspaces) {
      const key = workspace._id.toLowerCase();
      // Untrusted ids become plain-object keys: "__proto__" / "constructor" would reach
      // Object.prototype instead of storing anything.
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      memberAccess[key] = {
        role: typeof workspace.role === "string" && workspace.role !== "" ? workspace.role : fallbackRole,
        permissions: Array.isArray(workspace.permissions)
          ? workspace.permissions.filter((item) => typeof item === "string")
          : fallbackPermissions,
      };
    }
  }
  return memberAccess;
}

/** O(1) on a context carrying memberAccess, O(w) over the lists without it. */
function memberFor(context: PageAccessContext, workspaceId: string): PageMemberAccess | null {
  const key = workspaceId.toLowerCase();
  const { memberAccess, privateWorkspaceIds, sharedWorkspaceIds } = context;
  if (memberAccess) return Object.hasOwn(memberAccess, key) ? memberAccess[key] : null;
  if (privateWorkspaceIds.includes(workspaceId)) return { role: "owner", permissions: OWNER_PERMISSIONS };
  if (sharedWorkspaceIds.includes(workspaceId)) return { role: "editor", permissions: SHARED_PERMISSIONS };
  return null;
}

/**
 * The bridge's safeText(value, 16) (scripts/bridge-api.mjs). O(n) in the role length.
 * Ponytail: truncates a role at 16 characters, so a longer role is compared as its own
 * 16-char prefix and never matches "owner" / "admin". Control characters go by code
 * point: the matching regex class trips eslint's no-control-regex.
 */
function normalizeRole(value: unknown): string {
  const text = String(value ?? "").normalize("NFKC");
  const printable = [...text]
    .filter((char) => (char.codePointAt(0) ?? 0) > 0x1f && char !== "\u007f").join("");
  return printable.trim().slice(0, 16);
}

/** The bridge's memberHasPermission (scripts/bridge-api.mjs), line for line: an owner/admin
 *  role passes everything, else the membership lists 'admin' or the exact permission.
 *  O(p) over the permission list. */
function memberHasPermission(
  member: PageMemberAccess | null, permission: PageWritePermission
): boolean {
  if (!member) return false;
  const role = normalizeRole(member.role);
  if (role === "owner" || role === "admin") return true;
  const permissions = Array.isArray(member.permissions)
    ? member.permissions.filter((item) => typeof item === "string") : [];
  return permissions.includes("admin") || permissions.includes(permission);
}

/**
 * The bridge's mayModifyPage (scripts/bridge-api.mjs), line for line: an unpublished
 * ownerless page is writable by whoever cleared the gates above; past that the page
 * owner, an owner/admin membership, an 'update' permission or an editor/owner
 * collaborator grants it. O(p + c) over properties + collaborators.
 */
function mayModifyPage(page: PageEntry, member: PageMemberAccess | null, userId: string): boolean {
  const published = (Array.isArray(page.properties) ? page.properties : []).some(
    (property) => property?.key === "published" && (property.value === true || property.value === "true"),
  );
  if (!published && page.ownerId == null) return true;
  if (sameUserId(page.ownerId, userId)) return true;
  // The RAW role, not normalizeRole: the bridge reads access.role untrimmed here, so a
  // padded role memberHasPermission accepted mayModifyPage still refuses.
  if (member?.role === "owner" || member?.role === "admin") return true;
  // Array.isArray as in the bridge: permissions that never arrived as a list grant nothing.
  if (member && Array.isArray(member.permissions) && member.permissions.includes("update")) return true;
  // The bridge's own find, NOT getCollaboratorRole: it takes the FIRST entry filed for the
  // user whatever its role, so a null-role entry shadowing an 'editor' one still refuses.
  const collaborators = Array.isArray(page.collaborators) ? page.collaborators : [];
  const role = collaborators.find((entry) => entry != null && sameUserId(entry.userId, userId))?.role;
  return role === "editor" || role === "owner";
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

/**
 * The one owner/collaborator id match, the bridge's sameId (bridge-page-read.mjs):
 * UUIDs are case-insensitive because Postgres stores them lower-case while a session
 * token may carry upper-case. O(l) in the id length.
 */
function sameUserId(left: unknown, right: unknown): boolean {
  if (typeof left !== "string" || typeof right !== "string" || !left || !right) return false;
  return left.toLowerCase() === right.toLowerCase();
}

/**
 * The caller's role as a page collaborator, or null. Mirrors the bridge's
 * isPageCollaborator (bridge-page-read.mjs:43): an entry that is not an object, or whose
 * role is null/undefined, grants nothing. O(c) over collaborators.
 */
function getCollaboratorRole(page: PageEntry, userId: string): PageCollaboratorRole | null {
  const collaborators = Array.isArray(page.collaborators) ? page.collaborators : [];
  const entry = collaborators.find(
    (collaborator) => collaborator != null && typeof collaborator === "object"
      && collaborator.role != null && sameUserId(collaborator.userId, userId),
  );
  return entry?.role ?? null;
}

/** O(w) over the caller's workspace ids. */
function hasWorkspaceAccess(page: PageEntry, context: PageAccessContext): boolean {
  return context.workspaceIds.includes(page.workspaceId);
}

function isLegacyPage(page: PageEntry): boolean {
  return page.ownerId == null && page.visibility == null && (page.collaborators?.length ?? 0) === 0;
}

/** O(c) over collaborators. */
export function canReadPage(page: PageEntry, context: PageAccessContext | null): boolean {
  if (!context || !hasWorkspaceAccess(page, context)) return false;
  const visibility = normalizePageVisibility(page.visibility);
  if (visibility === "public") return true;
  if (visibility === "shared") return true;
  if (sameUserId(page.ownerId, context.userId)) return true;
  if (isLegacyPage(page)) return true;
  return getCollaboratorRole(page, context.userId) !== null;
}

/**
 * Record a bridge refusal on the current context so this session's write gates stop
 * offering edits the server has already turned down (and the outbox stops re-sending
 * them). No-op when there is no context — offline, there is nothing to refuse.
 * O(1).
 */
// Ponytail: a mark lasts until the session object changes; a role restored mid-session stays read-only until then.
export function markPageWriteRefused(pageId: string): void {
  const context = getCurrentPageAccessContext();
  if (!context) return;
  context.refusedPageIds ??= new Set<string>();
  context.refusedPageIds.add(pageId);
}

/** The bridge's canWritePageRow (scripts/bridge-api.mjs) as one predicate. O(w + p + c). */
export function canWritePage(
  page: PageEntry, context: PageAccessContext | null, permission: "update" | "delete"
): boolean {
  if (!context) return false;
  // The server's own verdict, ahead of every local rule: a page this session was
  // refused on stays read-only even though the membership still grants the write.
  if (context.refusedPageIds?.has(page._id)) return false;
  if (sameUserId(page.ownerId, context.userId)) return true;
  if (!canReadPage(page, context)) return false;
  const member = memberFor(context, page.workspaceId);
  if (!memberHasPermission(member, permission)) return false;
  return mayModifyPage(page, member, context.userId);
}

export function canEditPage(page: PageEntry, context: PageAccessContext | null): boolean {
  return canWritePage(page, context, "update");
}

export function canDeletePage(page: PageEntry, context: PageAccessContext | null): boolean {
  return canWritePage(page, context, "delete");
}

export function canDuplicatePage(page: PageEntry, context: PageAccessContext | null): boolean {
  return canReadPage(page, context);
}

/** Whether the caller may move `page` into `targetWorkspaceId`. Only the owner changes a
 *  page's workspace — the bridge drops workspaceId from a non-owner's PATCH
 *  (bridge-page-read.mjs:99-109) — so another workspace needs the target's 'create'. O(w + p + c). */
export function canMovePage(
  page: PageEntry, targetWorkspaceId: string, context: PageAccessContext | null
): boolean {
  if (!context) return false;
  if (!context.workspaceIds.includes(targetWorkspaceId)) return false;
  if (!canEditPage(page, context)) return false;
  if (page.workspaceId === targetWorkspaceId) return true;
  if (!sameUserId(page.ownerId, context.userId)) return false;
  return memberHasPermission(memberFor(context, targetWorkspaceId), "create");
}

export function getTargetWorkspaceMoveVisibility(
  targetWorkspaceId: string, context: PageAccessContext | null, fallback: PageVisibility | null | undefined,
): PageVisibility {
  if (!context) return normalizePageVisibility(fallback);
  if (context.sharedWorkspaceIds.includes(targetWorkspaceId)) return "shared";
  if (context.privateWorkspaceIds.includes(targetWorkspaceId)) return "private";
  return normalizePageVisibility(fallback);
}

export function getPageCollaboratorList(
  collaborators: PageCollaborator[] | undefined,
): PageCollaborator[] {
  return (collaborators ?? []).map((collaborator) => ({ ...collaborator }));
}

/** Returns true when the current user may change this page's visibility.
 *  Editing a page and deciding who sees it are different rights; the server
 *  always accepts the owner. O(1). */
export function canChangePageVisibility(
  page: PageEntry,
  context: PageAccessContext | null,
): boolean {
  return page.ownerId != null && context !== null && page.ownerId === context.userId;
}
