/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useWorkspaceFileOps.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect, useMemo, useState } from "react";

import { getWorkspaceMounts, subscribeWorkspaceMounts, workspaceUri } from "../vfs/workspaceMounts";
import { useWorkspaceImportExport } from "./useWorkspaceImportExport";
import { createWorkspaceFileOpsWith, type WorkspaceFileOps } from "./workspaceFileOps";
import type { MountTable } from "../vfs/types";

export type { WorkspaceFileOps };

/** The core bound to the real `workspace://` URI scheme. The core itself lives in
 *  workspaceFileOps.ts so node tests can load it without the page-store graph. */
export function createWorkspaceFileOps(mounts: MountTable, workspaceId: string): WorkspaceFileOps {
  return createWorkspaceFileOpsWith(mounts, workspaceId, workspaceUri);
}

/** Binds the core to the active workspace. `importFolder` / `exportProject` stay on the
 *  page store: `importFolder`'s optional parent is a page id, not a relative path. */
export function useWorkspaceFileOps() {
  const { workspaceId, importFolder, exportProject } = useWorkspaceImportExport();
  const [rebound, setRebound] = useState<{ workspaceId: string; mounts: MountTable } | null>(null);

  useEffect(
    () => subscribeWorkspaceMounts(workspaceId, () => setRebound({ workspaceId, mounts: getWorkspaceMounts(workspaceId) })),
    [workspaceId],
  );

  // A rebind (sandbox online <-> degraded) swaps the mount table, so the core is rebuilt.
  const ops = useMemo(
    () => createWorkspaceFileOps(
      rebound?.workspaceId === workspaceId ? rebound.mounts : getWorkspaceMounts(workspaceId),
      workspaceId,
    ),
    [workspaceId, rebound],
  );

  return { workspaceId, ops, importFolder, exportProject };
}
