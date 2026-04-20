/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageStore.helpers.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: vjan-nie <vjan-nie@student.42madrid.com    +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/19 20:09:11 by vjan-nie         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block, BlockType } from "@/entities/block";
import type { SeedPage } from "../data/seedPages";
import type { ActivePage, PageEntry } from "@/entities/page";

const RECENTS_KEY = "pg:recents";
const PAGE_CACHE_KEY = "pg:pages";
const PAGE_CACHE_SAVE_DELAY_MS = 180;

/** A 24-hex-char string that looks like a MongoDB ObjectId. */
const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

/** Returns `true` when `id` looks like a valid MongoDB ObjectId. */
export function isMongoId(id: string): boolean {
  return OBJECT_ID_RE.test(id);
}

export function loadRecents(): ActivePage[] {
  try {
    return JSON.parse(
      localStorage.getItem(RECENTS_KEY) ?? "[]",
    ) as ActivePage[];
  } catch {
    return [];
  }
}

export function saveRecents(recents: ActivePage[]) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
  } catch {
    // localStorage might be unavailable (e.g. private browsing quota)
  }
}

export function loadPagesCache(): Record<string, PageEntry[]> {
  try {
    return JSON.parse(localStorage.getItem(PAGE_CACHE_KEY) ?? "{}") as Record<
      string,
      PageEntry[]
    >;
  } catch {
    return {};
  }
}

export function savePagesCache(pages: Record<string, PageEntry[]>) {
  try {
    localStorage.setItem(PAGE_CACHE_KEY, JSON.stringify(pages));
  } catch {
    // localStorage might be unavailable (e.g. private browsing quota)
  }
}

let pendingPagesCache: Record<string, PageEntry[]> | null = null;
let pendingPagesCacheTimer: ReturnType<typeof setTimeout> | null = null;

export function schedulePagesCachePersist(pages: Record<string, PageEntry[]>) {
  pendingPagesCache = pages;

  if (pendingPagesCacheTimer) {
    clearTimeout(pendingPagesCacheTimer);
  }

  pendingPagesCacheTimer = setTimeout(() => {
    flushScheduledPagesCachePersist();
  }, PAGE_CACHE_SAVE_DELAY_MS);
}

export function flushScheduledPagesCachePersist() {
  if (pendingPagesCacheTimer) {
    clearTimeout(pendingPagesCacheTimer);
    pendingPagesCacheTimer = null;
  }

  if (!pendingPagesCache) {
    return;
  }

  savePagesCache(pendingPagesCache);
  pendingPagesCache = null;
}

if (globalThis.window !== undefined) {
  globalThis.addEventListener("beforeunload", flushScheduledPagesCachePersist);
}

export function mergeWorkspacePages(
  existingPages: PageEntry[] | undefined,
  incomingPages: PageEntry[],
): PageEntry[] {
  const previousPages = existingPages ?? [];
  if (incomingPages.length === 0) return previousPages;

  const cachedById = new Map(
    previousPages.map((page) => [page._id, page] as const),
  );
  const mergedPages = incomingPages.map((page) => {
    const cachedPage = cachedById.get(page._id);
    if (!cachedPage) return page;
    return {
      ...cachedPage,
      ...page,
      content: page.content ?? cachedPage.content,
    };
  });

  const incomingIds = new Set(incomingPages.map((page) => page._id));
  for (const cachedPage of previousPages) {
    if (!incomingIds.has(cachedPage._id)) {
      mergedPages.push(cachedPage);
    }
  }

  return mergedPages;
}

/**
 * Recursively get all descendant page IDs for a given parent page.
 * Includes protection against infinite recursion (circular references).
 */
export function getAllDescendantIds(
  pages: PageEntry[],
  parentId: string,
  visited = new Set<string>(),
): string[] {
  if (visited.has(parentId)) return [];
  visited.add(parentId);

  const children = pages.filter((p) => p.parentPageId === parentId);
  let ids = children.map((c) => c._id);

  for (const child of children) {
    ids = ids.concat(getAllDescendantIds(pages, child._id, visited));
  }
  return ids;
}

/** Compute the number of sub-pages affected by a deletion. */
export function countSubPages(pages: PageEntry[], parentId: string): number {
  // We use a fresh set for the helper call
  return getAllDescendantIds(pages, parentId).length;
}

/** Convert seed page format to PageEntry (with content) */
export function seedToEntry(sp: SeedPage): PageEntry {
  return {
    _id: sp._id,
    title: sp.title,
    icon: sp.icon,
    workspaceId: sp.workspaceId,
    ownerId: sp.ownerId ?? null,
    visibility: sp.visibility,
    collaborators: sp.collaborators,
    parentPageId: sp.parentPageId ?? null,
    databaseId: sp.databaseId ?? null,
    archivedAt: sp.archivedAt ?? null,
    content: sp.content,
  };
}

let _localIdCounter = 0;

export function localId(): string {
  return `local-page-${++_localIdCounter}-${Date.now().toString(36)}`;
}

export function updatePageInState(
  pages: Record<string, PageEntry[]>,
  pageId: string,
  updater: (page: PageEntry) => PageEntry,
): Record<string, PageEntry[]> {
  const newPages = { ...pages };
  for (const wsId of Object.keys(newPages)) {
    const list = newPages[wsId];
    const idx = list.findIndex((p) => p._id === pageId);
    if (idx < 0) continue;
    newPages[wsId] = list.map((p, i) => (i === idx ? updater(p) : p));
    return newPages;
  }
  return pages;
}

function cloneBlocks(blocks: Block[]): Block[] {
  return blocks.map((block) => ({
    ...block,
    children: block.children ? cloneBlocks(block.children) : undefined,
  }));
}

function updateBlockInTree(
  blocks: Block[],
  blockId: string,
  updater: (block: Block) => Block,
): Block[] {
  let changed = false;

  const nextBlocks = blocks.map((block) => {
    if (block.id === blockId) {
      changed = true;
      return updater(block);
    }

    if (!block.children) {
      return block;
    }

    const nextChildren = updateBlockInTree(block.children, blockId, updater);
    if (nextChildren === block.children) {
      return block;
    }

    changed = true;
    return {
      ...block,
      children: nextChildren,
    };
  });

  return changed ? nextBlocks : blocks;
}

function deleteBlockFromTree(blocks: Block[], blockId: string): Block[] {
  return blocks.flatMap((block) => {
    if (block.id === blockId) {
      return block.children ?? [];
    }
    return [{
      ...block,
      children: block.children
        ? deleteBlockFromTree(block.children, blockId)
        : undefined,
    }];
  });
}

function insertBlockIntoTree(
  blocks: Block[],
  afterBlockId: string,
  nextBlock: Block,
): boolean {
  for (let idx = 0; idx < blocks.length; idx += 1) {
    const block = blocks[idx];

    if (block.id === afterBlockId) {
      blocks.splice(idx + 1, 0, nextBlock);
      return true;
    }

    if (block.children && insertBlockIntoTree(block.children, afterBlockId, nextBlock)) {
      return true;
    }
  }

  return false;
}

function indentBlockInTree(blocks: Block[], blockId: string): boolean {
  for (let idx = 0; idx < blocks.length; idx += 1) {
    const block = blocks[idx];

    if (block.id === blockId) {
      if (idx === 0) return true;
      const [moved] = blocks.splice(idx, 1);
      const prev = blocks[idx - 1];
      prev.children = prev.children ?? [];
      prev.children.push(moved);
      return true;
    }

    if (block.children && indentBlockInTree(block.children, blockId)) {
      return true;
    }
  }

  return false;
}

function outdentBlockInTree(
  blocks: Block[],
  blockId: string,
  parentBlocks: Block[] | null = null,
  parentIndex = -1,
): boolean {
  for (let idx = 0; idx < blocks.length; idx += 1) {
    const block = blocks[idx];

    if (block.id === blockId) {
      if (!parentBlocks || parentIndex < 0) return true;
      const [moved] = blocks.splice(idx, 1);
      parentBlocks.splice(parentIndex + 1, 0, moved);
      return true;
    }

    if (
      block.children &&
      outdentBlockInTree(block.children, blockId, blocks, idx)
    ) {
      return true;
    }
  }

  return false;
}

/** Creates a page updater that patches a single block. */
export function applyBlockUpdate(
  blockId: string,
  updates: Partial<Block>,
): (page: PageEntry) => PageEntry {
  return (page) => ({
    ...page,
    content: updateBlockInTree(page.content ?? [], blockId, (block) => ({
      ...block,
      ...updates,
    })),
  });
}

/** Creates a page updater that inserts a block after another. */
export function applyBlockInsert(
  afterBlockId: string,
  block: Block,
): (page: PageEntry) => PageEntry {
  return (page) => {
    const content = cloneBlocks(page.content ?? []);
    const inserted = insertBlockIntoTree(content, afterBlockId, block);
    if (!inserted) {
      content.push(block);
    }
    return { ...page, content };
  };
}

/** Creates a page updater that removes a block. */
export function applyBlockDelete(
  blockId: string,
): (page: PageEntry) => PageEntry {
  return (page) => ({
    ...page,
    content: deleteBlockFromTree(page.content ?? [], blockId),
  });
}

/** Creates a page updater that reorders a block to a target index. */
export function applyBlockMove(
  blockId: string,
  targetIndex: number,
  parentBlockId: string | null = null,
): (page: PageEntry) => PageEntry {
  return (page) => {
    const content = cloneBlocks(page.content ?? []);

    const reorderInArray = (arr: Block[]): boolean => {
      const fromIdx = arr.findIndex((b) => b.id === blockId);
      if (fromIdx < 0) return false;

      const [moved] = arr.splice(fromIdx, 1);
      const boundedTarget = Math.max(0, Math.min(targetIndex, arr.length));
      const insertIdx =
        fromIdx < targetIndex ? boundedTarget - 1 : boundedTarget;
      arr.splice(Math.max(0, insertIdx), 0, moved);
      return true;
    };

    const reorderInParent = (arr: Block[]): boolean => {
      for (const block of arr) {
        if (block.id === parentBlockId) {
          block.children = block.children ?? [];
          return reorderInArray(block.children);
        }
        if (block.children && reorderInParent(block.children)) {
          return true;
        }
      }
      return false;
    };

    if (parentBlockId) {
      reorderInParent(content);
    } else {
      reorderInArray(content);
    }

    return { ...page, content };
  };
}

/**
 * Extracts a block (with its children) from anywhere in the tree
 * and inserts it at a target position under a specified parent.
 * Used by drag-and-drop to move blocks across nesting levels.
 */
export function applyBlockMoveAcrossTree(
  blockId: string,
  targetParentBlockId: string | null,
  targetIndex: number,
): (page: PageEntry) => PageEntry {
  return (page) => {
    const content = cloneBlocks(page.content ?? []);

    // Step 1: Extract the block from its current position
    let extracted: Block | null = null;

    const extractFromTree = (blocks: Block[]): Block[] =>
      blocks.flatMap((block) => {
        if (block.id === blockId) {
          extracted = block;
          return [];
        }
        return [{
          ...block,
          children: block.children
            ? extractFromTree(block.children)
            : undefined,
        }];
      });

    const withoutBlock = extractFromTree(content);
    if (!extracted) return page;

    // Step 2: Insert at root level
    if (!targetParentBlockId) {
      const bounded = Math.max(0, Math.min(targetIndex, withoutBlock.length));
      withoutBlock.splice(bounded, 0, extracted);
      return { ...page, content: withoutBlock };
    }

    // Step 3: Insert as child of target parent
    const insertInParent = (blocks: Block[]): boolean => {
      for (const block of blocks) {
        if (block.id === targetParentBlockId) {
          block.children = block.children ?? [];
          const bounded = Math.max(0, Math.min(targetIndex, block.children.length));
          block.children.splice(bounded, 0, extracted!);
          return true;
        }
        if (block.children && insertInParent(block.children)) {
          return true;
        }
      }
      return false;
    };

    if (!insertInParent(withoutBlock)) {
      // Fallback: if target parent not found, insert at root
      withoutBlock.splice(Math.max(0, Math.min(targetIndex, withoutBlock.length)), 0, extracted);
    }

    return { ...page, content: withoutBlock };
  };
}

/** Creates a page updater that changes a block's type. */
export function applyBlockTypeChange(
  blockId: string,
  newType: BlockType,
): (page: PageEntry) => PageEntry {
  return (page) => ({
    ...page,
    content: updateBlockInTree(page.content ?? [], blockId, (block) => ({
      ...block,
      type: newType,
    })),
  });
}

/** Creates a page updater that indents a block under its previous sibling. */
export function applyBlockIndent(
  blockId: string,
): (page: PageEntry) => PageEntry {
  return (page) => {
    const content = cloneBlocks(page.content ?? []);
    indentBlockInTree(content, blockId);
    return { ...page, content };
  };
}

/** Creates a page updater that outdents a block to its parent's level. */
export function applyBlockOutdent(
  blockId: string,
): (page: PageEntry) => PageEntry {
  return (page) => {
    const content = cloneBlocks(page.content ?? []);
    outdentBlockInTree(content, blockId);
    return { ...page, content };
  };
}

/** Validates if a page can be moved to the target destination. */
export function isValidMove(
  pages: Record<string, PageEntry[]>,
  sourceId: string,
  targetId: string | null,
): boolean {
  if (targetId === null) return true;
  if (sourceId === targetId) return false;

  const allPages = Object.values(pages).flat();
  const descendantIds = getAllDescendantIds(allPages, sourceId);
  if (descendantIds.includes(targetId)) return false;

  return true;
}
