/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageFileAddPage.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { createCodeFileBlock } from "@/features/ide/model/codeFile";
import { fileToPage, isPageFileName } from "./pageFileCodec";
import { titleFromFileName } from "./pagePaths";
import { pinFilePatch } from "./pinFilePatch";
import type { PageEntry } from "@/entities/page";
import type { PageFileStore } from "./pageFileFacade";

/** One facade create: a folder (`dir`), or a file whose name picks block page vs code page. */
export type CreateInput = { title: string; parentId: string | null; kind: "file" | "dir"; content?: string };

/** The store call for one create. O(len(content)) for a page file's parse. */
export function addPageFor(deps: PageFileStore, input: CreateInput, parentId: string | null): Promise<PageEntry | null> {
  if (input.kind === "dir") return deps.addPage({ title: input.title, parentId, surface: "folder" });
  if (isPageFileName(input.title)) return addPageFile(deps, input, parentId);
  return deps.addPage({ title: input.title, parentId, surface: "code", content: [createCodeFileBlock(input.title, input.content ?? "")] });
}

/**
 * A page file keeps its hand-written front matter (icon, cover, properties…): the
 * store's addPage takes only the body, so the rest follows as one patch through the
 * same pin rule every file write uses — the NAME owns the title, the app the surface,
 * the owner who sees it. O(len(content)).
 */
async function addPageFile(deps: PageFileStore, input: CreateInput, parentId: string | null): Promise<PageEntry | null> {
  const parsed = fileToPage(input.content ?? "");
  const created = await deps.addPage({ title: titleFromFileName(input.title), parentId, surface: "page", content: parsed.content });
  if (created === null) return null;
  const patch = pinFilePatch(parsed.patch, deps.canChangeSharing(created));
  if (Object.keys(patch).length > 0) deps.patchPage(created._id, patch);
  return created;
}
