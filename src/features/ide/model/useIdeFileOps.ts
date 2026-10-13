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
import { pagePathOf } from "./pagePathOf";
import { mirrorSandboxDelete, mirrorSandboxRename } from "./sandboxMirrorOps";
import { useWorkspaceImportExport } from "./useWorkspaceImportExport";

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
    const fromRel = pagePathOf(pageId);
    store.updatePageTitle(pageId, newName);
    const page = store.pageById(pageId);
    const block = codeBlockOf(page);
    if (page?.surface === "code" && block) {
      // A new extension re-infers the language + updates the stored file name.
      store.updateBlock(pageId, block.id, { fileName: newName, language: languageForFileName(newName).id });
    }
    // The sandbox file follows the page — no stale twin left on disk.
    const toRel = pagePathOf(pageId);
    void mirrorSandboxRename(workspaceId, fromRel, toRel);
  }, [workspaceId]);

  const remove = useCallback(
    (pageId: string) => {
      const rel = pagePathOf(pageId);
      const result = usePageStore.getState().archivePage(pageId, workspaceId, jwt);
      void mirrorSandboxDelete(workspaceId, rel);
      return result;
    },
    [workspaceId, jwt],
  );

  const move = useCallback(
    (pageId: string, targetParentId: string | null) => {
      const fromRel = pagePathOf(pageId);
      const result = usePageStore.getState().movePage(pageId, targetParentId, workspaceId);
      const toRel = pagePathOf(pageId);
      void mirrorSandboxRename(workspaceId, fromRel, toRel);
      return result;
    },
    [workspaceId],
  );

  const { importFolder, exportProject } = useWorkspaceImportExport();

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
