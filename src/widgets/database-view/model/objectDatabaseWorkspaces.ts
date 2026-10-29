/* ************************************************************************** */
/*                                                                            */
/*   objectDatabaseWorkspaces.ts                                              */
/*                                                                            */
/*   Which workspace a server object database belongs to. C138 is per         */
/*   workspace, so a background push must carry the DATABASE's workspace,     */
/*   never whichever workspace happens to be active.                          */
/*                                                                            */
/* ************************************************************************** */

const workspaceByDatabase = new Map<string, string>();

/** Record the workspace a database was hydrated into, created in, or opened in. */
export function rememberDatabaseWorkspace(dbKey: string, workspaceId?: string | null): void {
  if (!dbKey || !workspaceId) return;
  workspaceByDatabase.set(dbKey, workspaceId);
}

/** The database's own workspace, or undefined when it was never seen. */
export function databaseWorkspace(dbKey: string): string | undefined {
  return workspaceByDatabase.get(dbKey);
}

/** Tests and an account switch start clean. */
export function resetObjectDatabaseWorkspaces(): void {
  workspaceByDatabase.clear();
}
