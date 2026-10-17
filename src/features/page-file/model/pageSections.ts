/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageSections.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";

// Pure: no store import. The Private / Shared split of the old sidebar
// (widgets/sidebar pageTreeItem.helpers.selectRootPageIds, deleted in 8c738806), lifted so the
// explorer shows the same grouping. Display layer only: the real paths pageIndex/pagePaths
// produce for sync, the outbound writer and the hash ledger never carry a section.
//
// Notion semantics, which differ from the old helper on purpose: every member has a Private
// section in EVERY workspace, joined ones included. Private = a root I own that is not
// "shared" (a published "public" page of mine stays Private, as in the old helper). Shared =
// every other readable root: visibility "shared", or owned by someone else (a teammate's page
// I can read as a collaborator). The old helper made every root Shared whenever the user had
// any joined workspace and never looked at ownership.
// Caveat: a root with no owner (offline seed, legacy page) counts as mine, because with no
// owner there is nobody else it could belong to; in a joined workspace that can misfile a
// teammate's legacy page under Private.

export type PageSection = "private" | "shared";

export interface SectionContext {
  /** The signed-in user; null offline, where every ownerless page is theirs. */
  readonly userId: string | null;
}

export const SECTION_NAME: Readonly<Record<PageSection, string>> = { private: "Private", shared: "Shared" };

/** Shown in an expanded, empty section. */
export const SECTION_EMPTY_HINT: Readonly<Record<PageSection, string>> = {
  private: "No private pages",
  shared: "Nothing shared yet",
};

type Classifiable = Pick<PageEntry, "parentPageId" | "visibility" | "archivedAt" | "ownerId">;

/** Bound on the walk to a root: a parent cycle ends here instead of looping. */
const MAX_DEPTH = 256;

/**
 * The section a page is listed under, or null when archived (itself or its root). A child
 * follows its root and never its own visibility. An orphan (parent unknown) counts as a root.
 * O(depth), at most MAX_DEPTH hops; a parent cycle settles on the page where it was cut.
 */
export function sectionOf(
  page: Classifiable,
  ctx: SectionContext,
  pageById: (id: string) => Classifiable | undefined,
): PageSection | null {
  let root = page;
  for (let hops = 0; hops < MAX_DEPTH && root.parentPageId; hops += 1) {
    if (root.archivedAt) return null;
    const parent = pageById(root.parentPageId);
    if (!parent) break;
    root = parent;
  }
  if (root.archivedAt) return null;
  return isMine(root, ctx) && root.visibility !== "shared" ? "private" : "shared";
}

function isMine(root: Classifiable, ctx: SectionContext): boolean {
  if (root.ownerId == null) return true;
  return ctx.userId !== null && root.ownerId.toLowerCase() === ctx.userId.toLowerCase();
}

/** Live root pages grouped by section, input order kept. O(n). */
export function groupRootsBySection<P extends Classifiable>(
  pages: readonly P[],
  ctx: SectionContext,
): Record<PageSection, P[]> {
  const groups: Record<PageSection, P[]> = { private: [], shared: [] };
  for (const page of pages) {
    if (page.parentPageId) continue;
    const section = sectionOf(page, ctx, () => undefined);
    if (section) groups[section].push(page);
  }
  return groups;
}

/** "private" / "SHARED" -> the section; anything else null. Case-insensitive because the page
 *  provider declares insensitive-preserving names. O(1). */
export function sectionNamed(name: string): PageSection | null {
  const lower = name.toLowerCase();
  if (lower === "private") return "private";
  if (lower === "shared") return "shared";
  return null;
}

function segmentsOf(rel: string): string[] {
  return rel.split("/").filter(Boolean);
}

/** The section a display path sits in; null for "" and for a path that is not under a section
 *  (a raw sandbox path). O(first segment). */
export function sectionOfRel(virtualRel: string): PageSection | null {
  const [first] = segmentsOf(virtualRel);
  return first === undefined ? null : sectionNamed(first);
}

/**
 * Display path -> the real page-file path: drops the leading section segment. Every display
 * path starts with a section (the virtual root holds nothing else), so a page called "Private"
 * at a real root is "Private/Private.omd" here and "Private.omd" really: no collision. A path
 * under no section passes through unchanged (call this only for page-backed paths).
 * Caveat: given a REAL path whose first segment happens to be "Private" or "Shared" it strips
 * it, so feed it display paths only. O(path).
 */
export function realRelOf(virtualRel: string): string {
  const segments = segmentsOf(virtualRel);
  if (segments.length === 0 || sectionNamed(segments[0]) === null) return segments.join("/");
  return segments.slice(1).join("/");
}

/** Real page-file path -> display path under `section`. O(path). */
export function virtualRelOf(section: PageSection, realRel: string): string {
  return [SECTION_NAME[section], ...segmentsOf(realRel)].join("/");
}
