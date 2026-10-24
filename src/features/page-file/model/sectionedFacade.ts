/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sectionedFacade.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { fsError } from "@/features/ide/vfs/errors";
import type { PageFacade, PageFacadeEntry } from "@/features/ide/vfs/pageProvider";

import { SECTION_NAME, sectionNamed, type PageSection } from "./pageSections";
import type { SectionDeps } from "./sectionDeps";
import { ownerOf } from "./pageFileFacadeTables";

// Display layer only: two virtual folders, Private and Shared, above the page-file tree. The
// wrapped facade (and so pageIndex, the writer, inbound sync and the hash ledger) keeps its
// real paths; this decorator only re-parents ROOT entries under the section they belong to.
// A move onto a section folder is a visibility change (the existing patchPage path).
// Caveat: a nested page dragged to a section is refused for non-owners even when its own
// visibility already matches, because the check runs before the page is promoted.

const SECTION_PREFIX = "section:";
const SECTIONS: readonly PageSection[] = ["private", "shared"];

const sectionId = (section: PageSection): string => `${SECTION_PREFIX}${section}`;
const isSectionId = (id: string | null): id is string => id?.startsWith(SECTION_PREFIX) === true;
const sectionOfId = (id: string): PageSection => (id === sectionId("shared") ? "shared" : "private");

function sectionEntry(section: PageSection): PageFacadeEntry {
  return { id: sectionId(section), title: SECTION_NAME[section], name: SECTION_NAME[section], parentId: null, kind: "dir", sizeBytes: 0, mtimeMs: 0 };
}

const UNSUPPORTED_ON_SECTION = "Private and Shared are fixed folders";

export function createSectionedFacade(inner: PageFacade, deps: SectionDeps): PageFacade {
  const placed = (entry: PageFacadeEntry): PageFacadeEntry => {
    if (entry.parentId !== null) return entry;
    const section = deps.sectionOfPage(ownerOf(entry.id));
    return section ? { ...entry, parentId: sectionId(section) } : entry;
  };
  const innerRoots = (): readonly PageFacadeEntry[] => inner.children?.(null) ?? inner.list().filter((e) => e.parentId === null);
  const rootsOf = (section: PageSection): PageFacadeEntry[] =>
    innerRoots().filter((e) => deps.sectionOfPage(ownerOf(e.id)) === section).map(placed);
  const refuseSection = (id: string): void => {
    if (isSectionId(id)) throw fsError("Unsupported", undefined, UNSUPPORTED_ON_SECTION);
  };

  async function create(input: Parameters<PageFacade["create"]>[0]): Promise<PageFacadeEntry> {
    if (input.parentId !== null && !isSectionId(input.parentId)) return inner.create(input);
    const target = input.parentId === null ? "private" : sectionOfId(input.parentId);
    return placed(await inner.create({ ...input, parentId: null, visibility: target }));
  }

  async function move(id: string, parentId: string | null): Promise<void> {
    refuseSection(id);
    if (!isSectionId(parentId)) {
      if (parentId === null) throw fsError("Unsupported", undefined, "drop the page on Private or Shared");
      return inner.move(id, parentId);
    }
    const target = sectionOfId(parentId);
    const owner = ownerOf(id);
    const nested = !deps.isRoot(owner);
    if (!nested && deps.sectionOfPage(owner) === target) return;
    const refusal = deps.whyNotRelocatable(owner);
    if (refusal) throw fsError(refusal.code, undefined, refusal.reason);
    if (nested) await inner.move(id, null);
    if (deps.sectionOfPage(owner) !== target) deps.setSection(owner, target);
  }

  function subscribe(onChange: () => void): () => void {
    const stopInner = inner.subscribe?.(onChange);
    const signature = (): string => [...deps.roots()].map(([id, section]) => `${id}:${section}`).join(",");
    let last = signature();
    // Caveat: O(roots) per store commit, a keystroke included; only a section change fires.
    const stopDeps = deps.subscribe(() => {
      const next = signature();
      if (next === last) return;
      last = next;
      onChange();
    });
    return () => {
      stopInner?.();
      stopDeps();
    };
  }

  return {
    caseSensitivity: inner.caseSensitivity,
    toSegment: inner.toSegment,
    list: () => [...SECTIONS.map(sectionEntry), ...inner.list().map(placed)],
    children: (parentId) => {
      if (parentId === null) return SECTIONS.map(sectionEntry);
      if (isSectionId(parentId)) return rootsOf(sectionOfId(parentId));
      return inner.children?.(parentId) ?? inner.list().filter((e) => e.parentId === parentId);
    },
    childByName: (parentId, name) => {
      if (parentId === null) {
        const section = sectionNamed(name);
        return section ? sectionEntry(section) : undefined;
      }
      if (!isSectionId(parentId)) return inner.childByName?.(parentId, name);
      const found = inner.childByName?.(null, name);
      return found && deps.sectionOfPage(ownerOf(found.id)) === sectionOfId(parentId) ? placed(found) : undefined;
    },
    readContent: (id) => inner.readContent(id),
    writeContent: (id, text) => inner.writeContent(id, text),
    create,
    rename: async (id, title) => {
      refuseSection(id);
      return inner.rename(id, title);
    },
    move,
    archive: async (id) => {
      refuseSection(id);
      return inner.archive(id);
    },
    subscribe,
  };
}
