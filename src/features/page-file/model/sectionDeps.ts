/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sectionDeps.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { fsError, type FsErrorCode } from "@/features/ide/vfs/errors";
import type { PageEntry } from "@/entities/page";

import { sectionOf, type PageSection } from "./pageSections";

// Pure: the sectioned facade's view of the page store, over an injected source so node tests can
// drive it with the in-memory fixture store. The live wiring is pageFileFacadeStore.ts.

export interface SectionSource {
  pages(): readonly PageEntry[];
  /** The signed-in user's id, null when offline. */
  currentUserId(): string | null;
  /** Owner-only: may this user change who sees the page (canChangePageVisibility). */
  mayChangeSharing(page: PageEntry): boolean;
  patchPage(pageId: string, patch: Partial<PageEntry>): void;
  subscribe(listener: (state: unknown, prevState: unknown) => void): () => void;
}

export interface SectionRefusal {
  code: FsErrorCode;
  reason: string;
}

export interface SectionDeps {
  /** The section of the page an entry belongs to; null = archived or unknown. */
  sectionOfPage(pageId: string): PageSection | null;
  isRoot(pageId: string): boolean;
  /** Live root pages with their section, for change detection. */
  roots(): Iterable<readonly [string, PageSection]>;
  /** Why this page cannot change section, or null. */
  whyNotRelocatable(pageId: string): SectionRefusal | null;
  setSection(pageId: string, to: PageSection): void;
  subscribe(onChange: () => void): () => void;
}

/** O(n) once per pages array: the store replaces the array on every commit, a keystroke included. */
function lookupFor(pages: readonly PageEntry[], cache: WeakMap<readonly PageEntry[], Map<string, PageEntry>>): Map<string, PageEntry> {
  const known = cache.get(pages);
  if (known) return known;
  const built = new Map(pages.map((page) => [page._id, page]));
  cache.set(pages, built);
  return built;
}

export function createSectionDeps(source: SectionSource): SectionDeps {
  const cache = new WeakMap<readonly PageEntry[], Map<string, PageEntry>>();
  const byId = (id: string): PageEntry | undefined => lookupFor(source.pages(), cache).get(id);
  const context = () => ({ userId: source.currentUserId() });
  return {
    sectionOfPage: (pageId) => {
      const page = byId(pageId);
      return page ? sectionOf(page, context(), byId) : null;
    },
    isRoot: (pageId) => !byId(pageId)?.parentPageId,
    *roots() {
      const ctx = context();
      for (const page of source.pages()) {
        if (page.parentPageId) continue;
        const section = sectionOf(page, ctx, byId);
        if (section) yield [page._id, section] as const;
      }
    },
    whyNotRelocatable: (pageId) => {
      const page = byId(pageId);
      if (!page) return { code: "NotFound", reason: `no page ${pageId}` };
      if (!source.mayChangeSharing(page)) return { code: "PermissionDenied", reason: "only the owner can change who sees this page" };
      if (page.visibility === "public") return { code: "Unsupported", reason: "a published page keeps its visibility; change it from the Share menu" };
      return null;
    },
    setSection(pageId, to) {
      source.patchPage(pageId, { visibility: to });
      // The store may refuse the patch and keep the old visibility; reading it back is the only signal.
      if (byId(pageId)?.visibility !== to) throw fsError("Io", undefined, `the page did not become ${to}`);
    },
    subscribe: (onChange) => source.subscribe(() => onChange()),
  };
}
