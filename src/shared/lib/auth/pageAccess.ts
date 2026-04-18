import type { PageCollaborator, PageCollaboratorRole, PageEntry, PageVisibility } from '@/entities/page';
import type { UserSession } from '@/entities/user';

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
}

const USER_STORE_KEY = '__playgroundUserStore';

export function createPageAccessContext(session: UserSession | null | undefined): PageAccessContext | null {
  if (!session) return null;

  const privateWorkspaceIds = session.privateWorkspaces.map((workspace) => workspace._id);
  const sharedWorkspaceIds = session.sharedWorkspaces.map((workspace) => workspace._id);
  const workspaceIds = [...privateWorkspaceIds, ...sharedWorkspaceIds];

  return {
    userId: session.userId,
    workspaceIds,
    privateWorkspaceIds,
    sharedWorkspaceIds,
  };
}

export function getCurrentPageAccessContext(): PageAccessContext | null {
  const store = (globalThis as Record<string, unknown>)[USER_STORE_KEY] as PlaygroundUserStoreLike | undefined;
  if (!store) return null;

  try {
    return createPageAccessContext(store.getState().activeSession());
  } catch {
    return null;
  }
}

export function normalizePageVisibility(value: unknown): PageVisibility {
  if (value === 'shared' || value === 'public') return value;
  return 'private';
}

function getCollaboratorRole(page: PageEntry, userId: string): PageCollaboratorRole | null {
  const collaborators = page.collaborators ?? [];
  return collaborators.find((collaborator) => collaborator.userId === userId)?.role ?? null;
}

function hasWorkspaceAccess(page: PageEntry, context: PageAccessContext): boolean {
  return context.workspaceIds.includes(page.workspaceId);
}

function isLegacyPage(page: PageEntry): boolean {
  return page.ownerId == null && page.visibility == null && (page.collaborators?.length ?? 0) === 0;
}

export function canReadPage(page: PageEntry, context: PageAccessContext | null): boolean {
  if (!context || !hasWorkspaceAccess(page, context)) return false;

  const visibility = normalizePageVisibility(page.visibility);
  if (visibility === 'public') return true;
  if (visibility === 'shared') return true;

  if (page.ownerId && page.ownerId === context.userId) return true;

  if (isLegacyPage(page)) return true;

  return getCollaboratorRole(page, context.userId) !== null;
}

export function canEditPage(page: PageEntry, context: PageAccessContext | null): boolean {
  if (!context || !hasWorkspaceAccess(page, context)) return false;

  if (page.ownerId && page.ownerId === context.userId) return true;

  if (isLegacyPage(page)) return true;

  const collaboratorRole = getCollaboratorRole(page, context.userId);
  return collaboratorRole === 'editor' || collaboratorRole === 'owner';
}

export function canDeletePage(page: PageEntry, context: PageAccessContext | null): boolean {
  return canEditPage(page, context);
}

export function canDuplicatePage(page: PageEntry, context: PageAccessContext | null): boolean {
  return canReadPage(page, context);
}

export function canMovePage(page: PageEntry, targetWorkspaceId: string, context: PageAccessContext | null): boolean {
  if (!context || !hasWorkspaceAccess(page, context)) return false;
  return context.workspaceIds.includes(targetWorkspaceId) && canEditPage(page, context);
}

export function getTargetWorkspaceMoveVisibility(
  targetWorkspaceId: string,
  context: PageAccessContext | null,
  fallback: PageVisibility | null | undefined,
): PageVisibility {
  if (!context) return normalizePageVisibility(fallback);
  if (context.sharedWorkspaceIds.includes(targetWorkspaceId)) return 'shared';
  if (context.privateWorkspaceIds.includes(targetWorkspaceId)) return 'private';
  return normalizePageVisibility(fallback);
}

export function getPageCollaboratorList(collaborators: PageCollaborator[] | undefined): PageCollaborator[] {
  return collaborators ? collaborators.map((collaborator) => ({ ...collaborator })) : [];
}