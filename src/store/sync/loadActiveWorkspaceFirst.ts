/**
 * Loads the active workspace alone, then every other one in parallel. Measured on production
 * 2026-11-03 (17 workspaces, prismatica#55): fired together, they queued on the bridge, and the
 * active one — the only list the sidebar shows — landed after eight others, 6.3 s after sign-in;
 * small lists waited 1.2-1.45 s on the server for 2-16 KB. allSettled: one workspace's failure
 * never aborts the others; the outbox and the next hydrate reconcile it.
 */
export async function loadActiveWorkspaceFirst<T>(
  workspaceIds: readonly string[],
  activeWorkspaceId: string | null,
  load: (workspaceId: string) => Promise<T>,
): Promise<PromiseSettledResult<T>[]> {
  const first = workspaceIds.filter((id) => id === activeWorkspaceId);
  const rest = workspaceIds.filter((id) => id !== activeWorkspaceId);
  const loaded = await Promise.allSettled(first.map(load));
  return [...loaded, ...(await Promise.allSettled(rest.map(load)))];
}
