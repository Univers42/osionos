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
import { fileToPage, isPageFileName } from "./pageFileCodec";
import { assignSiblingNames, kindOfPage, titleFromFileName, type SiblingName } from "./pagePaths";
import { CODE_DIR_SUFFIX, META_SUFFIX, ownerOf } from "./pageFileFacadeTables";
import { FOLDER_META_NAME } from "./types";
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

/** The page with its body, fetched once when the store has not hydrated it. `guard` runs BEFORE
 *  the fetch, so a refused operation never triggers a load. O(1) on a hydrated page.
 *  Ponytail: a read answers an EMPTY body for a page whose body never arrived (the server page
 *  document may carry no `content`), so "no blocks" and "blocks not loaded yet" read alike: the
 *  wrong direction is a false empty, never a lost block. */
export async function loadedPage(ctx: OpContext, id: string, guard?: (page: PageEntry) => void): Promise<PageEntry> {
  const page = pageOf(ctx, id);
  guard?.(page);
  if (page.content !== undefined) return page;
  await ctx.deps.loadContent(page._id);
  return ctx.pageById(page._id) ?? page;
}

/** A read may show an empty body; a WRITE to one would drop blocks that are merely UNLOADED. O(1). */
function assertBodyLoaded(page: PageEntry): void {
  if (page.content === undefined) throw fsError("Io", undefined, `the body of ${page.title} never loaded`);
}

/** Acting on a folder's `#meta` id would rename/move/trash the WHOLE folder. */
function assertNotMeta(id: string, operation: string): void {
  if (id.endsWith(META_SUFFIX)) throw fsError("Unsupported", undefined, `a folder's meta file has no independent ${operation}`);
}

/** `_folder.omd` is reserved in EVERY directory (assignSiblingNames seeds `claimed` with it), so a
 *  page by that name is only reachable under the ` (2)` the index gives it. The test is on the
 *  SANITIZED name, never on `claimedIn`: it holds where no claimed table exists at all. O(len). */
function assertNotFolderMeta(deps: PageFileStore, name: string): void {
  if (deps.toSegment(name).toLowerCase() === FOLDER_META_NAME.toLowerCase()) {
    throw fsError("Unsupported", undefined, "a folder's meta file is created with its folder");
  }
}

function addPageFor(deps: PageFileStore, input: CreateInput, parentId: string | null): Promise<PageEntry | null> {
  if (input.kind === "dir") return deps.addPage({ title: input.title, parentId, surface: "folder" });
  if (isPageFileName(input.title)) return deps.addPage({ title: titleFromFileName(input.title), parentId, surface: "page", content: fileToPage(input.content ?? "").content });
  return deps.addPage({ title: input.title, parentId, surface: "code", content: [createCodeFileBlock(input.title, input.content ?? "")] });
}

/** The two names the page index (assignSiblingNames) reserves for the new page: its own and its child dir. */
function reservedNames(input: CreateInput, wanted: string): string[] {
  const own = wanted.toLowerCase();
  if (input.kind === "dir") return [own];
  return [own, isPageFileName(input.title) ? titleFromFileName(own) : `${own}${CODE_DIR_SUFFIX}`];
}

/** Did adding `created` change anyone's collision-free names? Compares the index's own rule
 *  (assignSiblingNames) with and without the new page over its readable live siblings: it catches
 *  the new page taking a ` (2)` AND displacing an earlier creator whose id sorts later. `created`
 *  is EXCLUDED from its own siblings, so a rename/move candidate reports nothing when nothing
 *  collides — a case-only rename included. O(n + s log s): n pages filtered, s siblings sorted. */
function displacesSiblings(ctx: OpContext, created: PageEntry, parentId: string | null): boolean {
  const others = ctx.deps.pages().filter((p) => p._id !== created._id && (p.parentPageId ?? null) === parentId && ctx.pageById(p._id) !== undefined);
  const without = assignSiblingNames(others);
  const withNew = assignSiblingNames([...others, created]);
  const same = (a?: SiblingName, b?: SiblingName): boolean => a?.own.toLowerCase() === b?.own.toLowerCase() && a?.childDir.toLowerCase() === b?.childDir.toLowerCase();
  return !same(withNew.get(created._id), assignSiblingNames([created]).get(created._id)) || others.some((p) => !same(withNew.get(p._id), without.get(p._id)));
}

/** Would the target's siblings gain or lose a name? `candidate` is the page as it WILL BE (its new
 *  title, its new parent), so the index is asked about the tree the operation produces. O(n + s log s). */
function assertNoSiblingCollision(ctx: OpContext, candidate: PageEntry, parentId: string | null): void {
  if (displacesSiblings(ctx, candidate, parentId)) {
    throw fsError("AlreadyExists", undefined, `${candidate.title} already exists here (names compare case-insensitively)`);
  }
}

/** A `#dir` parent (`Roadmap/`, a code page's `.d/`) IS its owning page: passed raw it
 *  would orphan the new page server-side. A clash on EITHER reserved name refuses BEFORE
 *  addPage; sanitized names are compared, so a title that only changes under sanitizing
 *  is not a clash. Creates of one name in flight all pass that check, so after addPage
 *  the new page is archived and refused if it displaced or was displaced by a sibling.
 *  Ponytail: that post-addPage check is best effort, and each way it can be wrong is one user's
 *  action wide — (a) for one PATCH round trip the displacement is visible to the index and to
 *  watchers, so a save by path in that window can land on the page about to be archived;
 *  (b) archivePage swallows a PATCH failure, so the duplicate stays live on the server and comes
 *  back on the next hydrate; (c) a create from another tab or client is never seen here;
 *  (d) if archivePage rejects, ITS error surfaces instead of AlreadyExists and the page stays. */
export async function createPage(ctx: OpContext, input: CreateInput): Promise<PageFacadeEntry> {
  assertNotFolderMeta(ctx.deps, input.title);
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
  assertBodyLoaded(page);
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
  assertNotFolderMeta(ctx.deps, name);
  const page = pageOf(ctx, id);
  assertCanEdit(ctx, page);
  const isCodeDir = id !== page._id && kindOfPage(page) === "code";
  if (isCodeDir && !name.endsWith(CODE_DIR_SUFFIX)) throw fsError("Unsupported", undefined, `a code page's directory name must end in ${CODE_DIR_SUFFIX}`);
  const file = isCodeDir ? name.slice(0, -CODE_DIR_SUFFIX.length) : name;
  const title = isPageFileName(file) ? titleFromFileName(file) : file;
  assertNoSiblingCollision(ctx, { ...page, title }, page.parentPageId ?? null);
  ctx.deps.updatePageTitle(page._id, title);
  const block = codeBlockOf(page);
  if (page.surface === "code" && block) ctx.deps.updateBlock(page._id, block.id, { fileName: file, language: languageForFileName(file).id });
}

/** `mv Roadmap.omd Roadmap/` would make a cycle: a Loop. The walk up from the target makes it a
 *  cycle exactly when the moved page is on that chain; the store's own isValidMove costs O(n·k).
 *  O(depth + n + s log s): the ancestor walk, then the once-per-action collision check.
 *  Ponytail: the walk uses the readable slice, so an UNREADABLE ancestor ends it early and a cycle
 *  through one is missed HERE — the store's `isValidMove` then refuses SILENTLY (`console.error` and
 *  a plain return, src/store/pageStore.actions.ts:654-659), `mv` reports success and nothing moves. */
export async function movePage(ctx: OpContext, id: string, parentId: string | null): Promise<void> {
  assertNotMeta(id, "move");
  const page = pageOf(ctx, id);
  assertCanEdit(ctx, page);
  const target = parentId === null ? null : ownerOf(parentId);
  const seen = new Set<string>();
  for (let at = target; at !== null && !seen.has(at); at = ctx.pageById(at)?.parentPageId ?? null) {
    if (at === page._id) throw fsError("Loop", undefined, "a page cannot be moved inside its own subtree");
    seen.add(at);
  }
  assertNoSiblingCollision(ctx, { ...page, parentPageId: target }, target);
  ctx.deps.movePage(page._id, target);
}

/** `rm src/_folder.omd` must not trash src/. Returns the store's promise so `rm` waits for
 *  the archive and surfaces its rejection. */
export async function archivePage(ctx: OpContext, id: string): Promise<void> {
  assertNotMeta(id, "archive");
  const page = pageOf(ctx, id);
  assertCanEdit(ctx, page);
  return ctx.deps.archivePage(page._id);
}
