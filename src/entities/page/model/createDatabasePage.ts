import { useUserStore } from '@/features/auth';
import { useDatabaseStore } from '@/store/useDatabaseStore';
import { usePageStore } from '@/store/usePageStore';
import { rememberDatabaseWorkspace } from '@/widgets/database-view/model/objectDatabaseWorkspaces';
import { captureOpenOrigin, openCreatedPage } from '@/widgets/workspace-grid/model/createdPageOpen';

/**
 * The one path that creates a full-page database: the "Database - Full page"
 * slash command and the sidebar compose menu both land here, so a database
 * always gets its store entry, its workspace binding and its open tab.
 */
export async function createDatabasePageInPrivateWorkspace(title = 'Untitled database'): Promise<{ id: string } | null> {
  const session = useUserStore.getState().activeSession();
  const privateWorkspaceId = session?.privateWorkspaces[0]?._id;
  if (!privateWorkspaceId) return null;

  const jwt = session?.accessToken ?? '';
  const databaseReference = useDatabaseStore.getState().createInlineDatabase(title);
  rememberDatabaseWorkspace(databaseReference.databaseId, privateWorkspaceId);
  const origin = captureOpenOrigin();
  const page = await usePageStore
    .getState()
    .addDatabasePage(privateWorkspaceId, title, jwt, databaseReference.databaseId);

  if (!page) return null;

  openCreatedPage({
    id: page._id,
    workspaceId: privateWorkspaceId,
    kind: 'database',
    title: page.title,
    icon: page.icon,
    databaseId: page.databaseId ?? databaseReference.databaseId,
  }, origin);

  return { id: page._id };
}
