/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-file-facade-fixtures.ts                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#+    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "../../src/entities/block/model/types.ts";
import type { PageEntry } from "../../src/entities/page/model/types.ts";
import assert from "node:assert/strict";
import { isFsError, type FsErrorCode } from "../../src/features/ide/vfs/errors.ts";
import { generatedTree } from "./page-tree-fixtures.ts";
import type { PageFileStore, NewPage } from "../../src/features/page-file/model/pageFileFacade.ts";

/** Minimal page entry for the in-memory fixture store. */
export function page(
  _id: string,
  title: string,
  parentPageId: string | null,
  surface: PageEntry["surface"] = "page",
  content: Block[] = [],
  archivedAt: string | null = null,
): PageEntry {
  return {
    _id,
    title,
    workspaceId: "ws",
    surface,
    parentPageId,
    archivedAt,
    content,
    updatedAt: new Date().toISOString(),
  };
}

/** A page the server listed but whose body was never fetched (`content` absent). */
export function unloadedPage(_id: string, title: string, parentPageId: string | null, surface: PageEntry["surface"] = "page"): PageEntry {
  const entry = page(_id, title, parentPageId, surface);
  delete entry.content;
  return entry;
}

/** The fixture store plus its test hooks: `_seed` swaps the page array, `_server`
 *  holds bodies `loadContent` can fetch, `replaceAccess` hands out a NEW access
 *  snapshot (as the real user store does when grants change). */
export type FixtureStore = Omit<PageFileStore, "addPage"> & {
  addPage: (input: NewPage) => Promise<PageEntry>;
  _seed: (pages: PageEntry[]) => void;
  _server: Map<string, Block[]>;
  replaceAccess: () => void;
};

/**
 * In-memory store implementing PageFileStore for node tests. `pages()` returns
 * ONE stable array until a mutator replaces it — the real zustand store does
 * the same, and the facade's per-array WeakMap memoisation depends on it.
 */
export function createFixtureStore(workspaceId: string): FixtureStore {
  let pages: PageEntry[] = [];
  let nextId = 1;
  const listeners = new Set<(state: unknown, prevState: unknown) => void>();
  let access: object = {};
  const server = new Map<string, Block[]>();
  const notify = (): void => {
    for (const l of listeners) l(undefined, undefined);
  };

  return {
    workspaceId,
    pages: () => pages,
    access: () => access,
    canRead: (_page: PageEntry) => true,
    canEdit: (_page: PageEntry) => true,
    // Hydrating swaps the array (like the real store) but does not notify: a
    // fetched body is not a tree change.
    loadContent: async (pageId: string) => {
      const body = server.get(pageId);
      if (body !== undefined) pages = pages.map((p) => (p._id === pageId ? { ...p, content: body } : p));
    },
    subscribe: (listener: (state: unknown, prevState: unknown) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    addPage: async (input: NewPage) => {
      const _id = `p${nextId++}`;
      const newPage = page(_id, input.title, input.parentId, input.surface, input.content);
      pages = [...pages, newPage];
      notify();
      return newPage;
    },
    patchPage: (pageId: string, patch: Partial<PageEntry>) => {
      pages = pages.map((p) => (p._id === pageId ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p));
      notify();
    },
    updatePageContent: (pageId: string, blocks: Block[]) => {
      pages = pages.map((p) => (p._id === pageId ? { ...p, content: blocks, updatedAt: new Date().toISOString() } : p));
      notify();
    },
    updatePageTitle: (pageId: string, title: string) => {
      pages = pages.map((p) => (p._id === pageId ? { ...p, title, updatedAt: new Date().toISOString() } : p));
      notify();
    },
    updateBlock: (pageId: string, blockId: string, updates: Partial<Block>) => {
      pages = pages.map((p) => (p._id === pageId
        ? { ...p, content: (p.content ?? []).map((b) => (b.id === blockId ? { ...b, ...updates } : b)), updatedAt: new Date().toISOString() }
        : p));
      notify();
    },
    movePage: (pageId: string, parentId: string | null) => {
      pages = pages.map((p) => (p._id === pageId ? { ...p, parentPageId: parentId, updatedAt: new Date().toISOString() } : p));
      notify();
    },
    archivePage: async (pageId: string) => {
      // The store's descendant behaviour: archiving a page archives its subtree.
      const archived = new Set<string>([pageId]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const p of pages) {
          if (typeof p.parentPageId === "string" && archived.has(p.parentPageId) && !archived.has(p._id)) {
            archived.add(p._id);
            grew = true;
          }
        }
      }
      const stamp = new Date().toISOString();
      pages = pages.map((p) => (archived.has(p._id) ? { ...p, archivedAt: stamp, updatedAt: stamp } : p));
      notify();
    },
    toSegment: (title: string) => title
      .replace(/[/\\]/g, " ")
      .replace(/\.\.+/g, ".")
      .trim()
      .replace(/\s+/g, " ") || "untitled",
    _seed: (seed: PageEntry[]) => {
      pages = seed;
    },
    _server: server,
    replaceAccess: () => {
      access = {};
    },
  };
}

/** Seed the shared generated tree (colliding titles, mixed surfaces, ~5 % archived) with
 *  empty bodies — page-tree-fixtures builds shapes only, and the facade reads `content`. */
export function seed300PageTree(store: FixtureStore): void {
  const stamp = new Date().toISOString();
  store._seed(generatedTree(300).map((entry) => ({ ...entry, content: [], updatedAt: stamp })));
}

/** Assert `promise` rejects with an FsError carrying `code` (a plain Error does not count). */
export async function rejectsWithCode(promise: Promise<unknown>, code: FsErrorCode): Promise<void> {
  await assert.rejects(promise, (error: unknown) => isFsError(error) && error.code === code, `expected an FsError ${code}`);
}
