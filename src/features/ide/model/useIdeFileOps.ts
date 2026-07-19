/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useIdeFileOps.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback } from "react";

import type { PageEntry } from "@/entities/page";
import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import { codeBlockOf, createCodeFileBlock } from "./codeFile";
import { languageForFileName } from "./ideLanguages";
import { readImportFiles } from "./importFolder";
import { buildImportPlan } from "./idePaths";
import { exportIdeProjectZip } from "./exportZip";

/**
 * File operations for the IDE explorer, bound to the active workspace + session
 * JWT. Every mutation flows through the ordinary page-store actions (addPage /
 * updatePageTitle / archivePage / movePage), so it rides the existing outbox /
 * ledger sync and ACL with no new persistence path — a code file is a page.
 */
export function useIdeFileOps() {
  const workspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");
  const jwt = useUserStore((s) => s.activePageJwt() ?? "");

  const newFile = useCallback(
    async (name: string, parentId?: string): Promise<PageEntry | null> => {
      const store = usePageStore.getState();
      const page = await store.addPage(workspaceId, name, jwt, parentId, {
        surface: "code",
        content: [createCodeFileBlock(name)],
      });
      if (page) store.openPage({ id: page._id, workspaceId, kind: "page", title: page.title });
      return page;
    },
    [workspaceId, jwt],
  );

  const newFolder = useCallback(
    (name: string, parentId?: string) =>
      usePageStore.getState().addPage(workspaceId, name, jwt, parentId, { surface: "folder" }),
    [workspaceId, jwt],
  );

  const rename = useCallback((pageId: string, newName: string): void => {
    const store = usePageStore.getState();
    store.updatePageTitle(pageId, newName);
    const page = store.pageById(pageId);
    const block = codeBlockOf(page);
    if (page?.surface === "code" && block) {
      // A new extension re-infers the language + updates the stored file name.
      store.updateBlock(pageId, block.id, { fileName: newName, language: languageForFileName(newName).id });
    }
  }, []);

  const remove = useCallback(
    (pageId: string) => usePageStore.getState().archivePage(pageId, workspaceId, jwt),
    [workspaceId, jwt],
  );

  const move = useCallback(
    (pageId: string, targetParentId: string | null) =>
      usePageStore.getState().movePage(pageId, targetParentId, workspaceId),
    [workspaceId],
  );

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

  return { workspaceId, newFile, newFolder, rename, remove, move, importFolder, exportProject };
}

/** The bound file-operations surface passed down to the explorer tree. */
export type IdeFileOps = ReturnType<typeof useIdeFileOps>;

/** A pending inline create — a new code file or folder under `parentId`
 *  (`null` = workspace root). */
export interface IdeCreateRequest {
  parentId: string | null;
  kind: "code" | "folder";
}
