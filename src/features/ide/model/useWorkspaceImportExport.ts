/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useWorkspaceImportExport.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback } from "react";

import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import { createCodeFileBlock } from "./codeFile";
import { readImportFiles } from "./importFolder";
import { buildImportPlan } from "./idePaths";
import { exportIdeProjectZip } from "./exportZip";

/**
 * Folder import and zip export for the active workspace. Both go through the page store
 * (addPage / the workspace's pages), so an import rides the ordinary outbox and ACL, and
 * an export is whatever the store holds. `importFolder`'s optional parent is a page id.
 * O(n) in the imported entries / the workspace's pages.
 */
export function useWorkspaceImportExport() {
  const workspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");
  const jwt = useUserStore((s) => s.activePageJwt() ?? "");

  const importFolder = useCallback(
    async (files: File[], parentId?: string): Promise<number> => {
      const plan = buildImportPlan(
        (await readImportFiles(files)).map((file) => ({ relPath: file.relPath, content: file.content })),
      );
      const store = usePageStore.getState();
      const folderIdByPath = new Map<string, string>();
      let created = 0;
      for (const entry of plan) {
        const name = entry.segments[entry.segments.length - 1];
        const parentPath = entry.segments.slice(0, -1).join("/");
        const parent = parentPath ? folderIdByPath.get(parentPath) : parentId;
        if (entry.kind === "folder") {
          const page = await store.addPage(workspaceId, name, jwt, parent, { surface: "folder" });
          if (page) { folderIdByPath.set(entry.segments.join("/"), page._id); created += 1; }
        } else {
          const page = await store.addPage(workspaceId, name, jwt, parent, {
            surface: "code",
            content: [createCodeFileBlock(name, entry.content ?? "")],
          });
          if (page) created += 1;
        }
      }
      return created;
    },
    [workspaceId, jwt],
  );

  const exportProject = useCallback(
    (projectName: string) => exportIdeProjectZip(usePageStore.getState().pages[workspaceId] ?? [], projectName),
    [workspaceId],
  );

  return { workspaceId, importFolder, exportProject };
}
