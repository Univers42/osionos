/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageStoreFacade.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { API_BASE, getActivePageJwt } from "@/shared/api/client";
import { usePageStore } from "@/store/usePageStore";
import type { PageEntry } from "@/entities/page";
import type { PageFacade, PageFacadeEntry } from "../vfs/pageProvider";
import { codeBlockOf, createCodeFileBlock } from "./codeFile";
import { languageForFileName } from "./ideLanguages";
import { sanitizeSegment } from "./idePaths";

const sizeOf = (text: string): number => new TextEncoder().encode(text).length;

function toEntry(page: PageEntry): PageFacadeEntry {
  const block = codeBlockOf(page);
  return {
    id: page._id,
    title: page.title || "untitled",
    parentId: page.parentPageId ?? null,
    kind: page.surface === "folder" ? "dir" : "file",
    sizeBytes: typeof block?.content === "string" ? sizeOf(block.content) : null,
    mtimeMs: page.updatedAt ? new Date(page.updatedAt).getTime() : 0,
  };
}

/** The REAL PageFacade over usePageStore — the one adapter that couples the
 *  osionos:// provider to the app store. Everything rides the ordinary page
 *  actions (outbox/ledger/ACL for free); jwt resolves per call like every
 *  other IDE surface. */
export function pageStoreFacade(workspaceId: string): PageFacade {
  const jwt = (): string => getActivePageJwt() ?? "";
  const store = () => usePageStore.getState();

  return {
    list() {
      return (store().pages[workspaceId] ?? [])
        .filter((page) => !page.archivedAt && (page.surface === "code" || page.surface === "folder"))
        .map(toEntry);
    },
    async readContent(id) {
      const loaded = codeBlockOf(store().pageById(id));
      if (typeof loaded?.content === "string") return loaded.content;
      if (API_BASE && jwt()) await store().fetchPageContent(id, jwt());
      return codeBlockOf(store().pageById(id))?.content ?? "";
    },
    async create(input) {
      const page = await store().addPage(workspaceId, input.title, jwt(), input.parentId ?? undefined, input.kind === "dir"
        ? { surface: "folder" }
        : { surface: "code", content: [createCodeFileBlock(input.title, input.content ?? "")] });
      if (!page) throw new Error("page create failed");
      return toEntry(page);
    },
    async writeContent(id, content) {
      const block = codeBlockOf(store().pageById(id));
      if (block) store().updateBlock(id, block.id, { content });
    },
    async rename(id, title) {
      store().updatePageTitle(id, title);
      const page = store().pageById(id);
      const block = codeBlockOf(page);
      if (page?.surface === "code" && block) {
        store().updateBlock(id, block.id, { fileName: title, language: languageForFileName(title).id });
      }
    },
    async move(id, parentId) {
      store().movePage(id, parentId, workspaceId);
    },
    async archive(id) {
      store().archivePage(id, workspaceId, jwt());
    },
    toSegment: sanitizeSegment,
  };
}
