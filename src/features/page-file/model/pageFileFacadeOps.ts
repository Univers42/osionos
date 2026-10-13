/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageFileFacadeOps.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { fsError } from "@/features/ide/vfs/errors";
import type { PageFacadeEntry } from "@/features/ide/vfs/pageProvider";
import { codeBlockOf, createCodeFileBlock } from "@/features/ide/model/codeFile";
import { languageForFileName } from "@/features/ide/model/ideLanguages";
import { fileToPage, isFolderMetaName, isPageFileName } from "./pageFileCodec";
import { assignSiblingNames, kindOfPage, titleFromFileName, type SiblingName } from "./pagePaths";
import { CODE_DIR_SUFFIX, META_SUFFIX, ownerOf } from "./pageFileFacadeTables";
import type { PageEntry } from "@/entities/page";
import type { PageFileStore } from "./pageFileFacade";

/** The mutating file operations of the page-file facade, run against the facade's closures. */
type CreateInput = { title: string; parentId: string | null; kind: "file" | "dir"; content?: string };

export interface OpContext {
  readonly deps: PageFileStore;
  pageById(id: string): PageEntry | undefined;
  entryFor(created: PageEntry | null): Promise<PageFacadeEntry>;
  /** Lower-cased names the siblings of `parentId` reserve (see PageDir.claimed). */
  claimedIn(parentId: string | null): ReadonlySet<string> | undefined;
}

function pageOf(ctx: OpContext, id: string): PageEntry {
  const page = ctx.pageById(ownerOf(id));
  if (!page) throw fsError("NotFound", undefined, `no readable page for ${id}`);
  return page;
}

function assertCanEdit(ctx: OpContext, page: PageEntry): void {
  if (!ctx.deps.canEdit(page)) throw fsError("PermissionDenied", undefined, "this page is read-only for you");
}

/** The page with its body present. `guard` runs BEFORE the fetch so a refused write never
 *  triggers a load; a body that still has not arrived is Io, never an empty read or a blind overwrite. */
export async function loadedPage(ctx: OpContext, id: string, guard?: (page: PageEntry) => void): Promise<PageEntry> {
  let page = pageOf(ctx, id);
  guard?.(page);
  if (page.content === undefined) {
    await ctx.deps.loadContent(page._id);
    page = ctx.pageById(page._id) ?? page;
    if (page.content === undefined) throw fsError("Io", undefined, `the body of ${page.title} never loaded`);
  }
  return page;
}

/** Acting on a folder's `#meta` id would rename/move/trash the WHOLE folder. */
function assertNotMeta(id: string, operation: string): void {
  if (id.endsWith(META_SUFFIX)) throw fsError("Unsupported", undefined, `a folder's meta file has no independent ${operation}`);
}

function addPageFor(deps: PageFileStore, input: CreateInput, parentId: string | null): Promise<PageEntry | null> {
  if (input.kind === "dir") return deps.addPage({ title: input.title, parentId, surface: "folder" });
  if (isPageFileName(input.title)) {
    return deps.addPage({ title: titleFromFileName(input.title), parentId, surface: "page", content: fileToPage(input.content ?? "").content });
  }
  return deps.addPage({ title: input.title, parentId, surface: "code", content: [createCodeFileBlock(input.title, input.content ?? "")] });
}

/** The two names the page index (assignSiblingNames) reserves for the new page: its own and its child dir. */
function reservedNames(input: CreateInput, wanted: string): string[] {
  const own = wanted.toLowerCase();
  if (input.kind === "dir") return [own];
  return [own, isPageFileName(input.title) ? titleFromFileName(own) : `${own}${CODE_DIR_SUFFIX}`];
}

/** Did adding `created` change anyone's collision-free names? Compares the index's own
 *  rule (assignSiblingNames) with and without the new page over its readable live
 *  siblings, so it catches the new page taking a ` (2)` AND it displacing an earlier
 *  creator whose id sorts later. O(s log s) over the s siblings, once per create. */
function displacesSiblings(ctx: OpContext, created: PageEntry, parentId: string | null): boolean {
  const others = ctx.deps.pages().filter((p) => p._id !== created._id && (p.parentPageId ?? null) === parentId && ctx.pageById(p._id) !== undefined);
  const without = assignSiblingNames(others);
  const withNew = assignSiblingNames([...others, created]);
  const same = (a?: SiblingName, b?: SiblingName): boolean => a?.own.toLowerCase() === b?.own.toLowerCase() && a?.childDir.toLowerCase() === b?.childDir.toLowerCase();
  return !same(withNew.get(created._id), assignSiblingNames([created]).get(created._id)) || others.some((p) => !same(withNew.get(p._id), without.get(p._id)));
}

/** A `#dir` parent (`Roadmap/`, a code page's `.d/`) IS its owning page: passed raw it
 *  would orphan the new page server-side. A clash on EITHER reserved name refuses BEFORE
 *  addPage; sanitized names are compared, so a title that only changes under sanitizing
 *  is not a clash. Creates of one name in flight all pass that check, so after addPage
 *  the new page is archived and refused if it displaced or was displaced by a sibling. */
export async function createPage(ctx: OpContext, input: CreateInput): Promise<PageFacadeEntry> {
  if (input.kind === "file" && isFolderMetaName(input.title)) throw fsError("Unsupported", undefined, "a folder's meta file is created with its folder");
  const parentId = input.parentId === null ? null : ownerOf(input.parentId);
  const wanted = ctx.deps.toSegment(input.title);
  const claimed = ctx.claimedIn(parentId);
  if (reservedNames(input, wanted).some((name) => claimed?.has(name))) {
    throw fsError("AlreadyExists", undefined, `${wanted} already exists here (names compare case-insensitively)`);
  }
  const created = await addPageFor(ctx.deps, input, parentId);
  if (created && displacesSiblings(ctx, created, parentId)) {
    await ctx.deps.archivePage(created._id);
    throw fsError("AlreadyExists", undefined, `${wanted} was created concurrently by another writer`);
  }
  return ctx.entryFor(created);
}

/** A refused write never fetches; an archived page is ReadOnly; a code page without its block throws instead of succeeding as a no-op. */
export async function writePage(ctx: OpContext, id: string, text: string): Promise<void> {
  const page = await loadedPage(ctx, id, (candidate) => {
    if (candidate.archivedAt) throw fsError("ReadOnly", undefined, "not a live writable page");
    assertCanEdit(ctx, candidate);
  });
  if (kindOfPage(page) === "code") {
    const block = codeBlockOf(page);
    if (!block) throw fsError("Io", undefined, `${page.title} is a code page with no code block`);
    return ctx.deps.updateBlock(page._id, block.id, { content: text });
  }
  const parsed = fileToPage(text, page);
  ctx.deps.patchPage(page._id, parsed.patch);
  ctx.deps.updatePageContent(page._id, parsed.content);
}

/** A code page's DIR (`main.ts.d`) renames WITH the page, so its `.d` suffix is
 *  stripped before the title is set; any other name would corrupt the title. */
export async function renamePage(ctx: OpContext, id: string, name: string): Promise<void> {
  assertNotMeta(id, "rename");
  const page = pageOf(ctx, id);
  assertCanEdit(ctx, page);
  const isCodeDir = id !== page._id && kindOfPage(page) === "code";
  if (isCodeDir && !name.endsWith(CODE_DIR_SUFFIX)) throw fsError("Unsupported", undefined, `a code page's directory name must end in ${CODE_DIR_SUFFIX}`);
  const file = isCodeDir ? name.slice(0, -CODE_DIR_SUFFIX.length) : name;
  ctx.deps.updatePageTitle(page._id, isPageFileName(file) ? titleFromFileName(file) : file);
  const block = codeBlockOf(page);
  if (page.surface === "code" && block) ctx.deps.updateBlock(page._id, block.id, { fileName: file, language: languageForFileName(file).id });
}

/** `mv Roadmap.omd Roadmap/` would make a cycle: a Loop. O(depth): walk up from the
 *  target; the move is a cycle exactly when the moved page is on that chain (the
 *  store's isValidMove costs O(n·k)). Ponytail: the walk uses the readable slice, so
 *  an UNREADABLE ancestor ends it early and a cycle through one is not seen here. */
export async function movePage(ctx: OpContext, id: string, parentId: string | null): Promise<void> {
  assertNotMeta(id, "move");
  const page = pageOf(ctx, id);
  assertCanEdit(ctx, page);
  const seen = new Set<string>();
  for (let at: string | null = parentId === null ? null : ownerOf(parentId); at !== null && !seen.has(at); at = ctx.pageById(at)?.parentPageId ?? null) {
    if (at === page._id) throw fsError("Loop", undefined, "a page cannot be moved inside its own subtree");
    seen.add(at);
  }
  ctx.deps.movePage(page._id, parentId === null ? null : ownerOf(parentId));
}

/** `rm src/_folder.omd` must not trash src/. Returns the store's promise so `rm` waits for
 *  the archive and surfaces its rejection. */
export async function archivePage(ctx: OpContext, id: string): Promise<void> {
  assertNotMeta(id, "archive");
  const page = pageOf(ctx, id);
  assertCanEdit(ctx, page);
  return ctx.deps.archivePage(page._id);
}
