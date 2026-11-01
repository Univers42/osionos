// A root's file operations, for the tree. The same core the cloud workspace uses, over the disk.
import { createDiskProvider, DISK_SCHEME, type DiskProvider } from "../features/ide/vfs/diskProvider";
import type { MountTable } from "../features/ide/vfs/types";
import type { NodeFsClient } from "../features/ide/vfs/nodeFsClient";
import { parseVPath } from "../features/ide/vfs/vpath";
import { createWorkspaceFileOpsWith, type WorkspaceFileOps } from "../features/ide/model/workspaceFileOps";

const uriOf = (rootId: string, rel: string): string =>
  `${DISK_SCHEME}://${rootId}/${rel.split("/").filter(Boolean).map(encodeURIComponent).join("/")}`;

export function createDiskOps(client: NodeFsClient, rootId: string): { ops: WorkspaceFileOps; provider: DiskProvider } {
  const provider = createDiskProvider(client, rootId);
  const mounts: MountTable = {
    resolve: (uri) => ({ provider, path: parseVPath(uri) }),
    mounts: () => [{ scheme: DISK_SCHEME, authority: rootId, provider }],
  };
  return { ops: createWorkspaceFileOpsWith(mounts, rootId, uriOf), provider };
}
