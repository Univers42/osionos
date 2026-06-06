/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageStore.helpers.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/13 13:52:58 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block, BlockType } from "@/entities/block";
import type { SeedPage } from "../data/seedPages";
import type { ActivePage, PageEntry, PageIndexEntry } from "@/entities/page";
import { timed } from "@/shared/lib/perf/measure";

const RECENTS_KEY = "pg:recents";
const ACTIVE_PAGE_KEY = "pg:activePage";
const LEGACY_PAGE_CACHE_KEYS = ["osio:pages", "pg:pages"];
const PAGE_CACHE_WORKSPACE_PREFIX = "osio:pages:";
const PAGE_CACHE_SAVE_DEBOUNCE_MS = 750;
const PAGE_CACHE_IDLE_FALLBACK_MS = 50;
const DUPLICATE_TITLE_SUFFIX_RE = /^(.*)\((\d{1,10})\)$/;
// Maximum positive value for a signed 32-bit integer.
const MAX_SIGNED_INT32 = 2147483647;

/** A 24-hex-char string that looks like a MongoDB ObjectId. */
const OBJECT_ID_RE = /^[a-f\d]{24}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface PageDerivedState {
  pages: Record<string, PageEntry[]>;
  pageIdsByWorkspace: Record<string, string[]>;
  pagesIndex: Record<string, PageIndexEntry>;
}

/** Returns `true` when `id` looks like a valid MongoDB ObjectId. */
export function isMongoId(id: string): boolean {
  return OBJECT_ID_RE.test(id);
}

export function isUuidId(id: string): boolean {
  return UUID_RE.test(id);
}

export function isPersistedPageId(id: string): boolean {
  return isMongoId(id) || isUuidId(id);
}

/**
 * Generates the next duplicate title using osionos-style incremental
 * numbering. If the title ends with ` (N)` where N is a valid positive
 * integer below INT_MAX, increments N. Otherwise appends ` (1)`.
 */
export function nextDuplicateTitle(title: string): string {
  if (title === "") {
    return "(1)";
  }

  const match = DUPLICATE_TITLE_SUFFIX_RE.exec(title);
  if (!match) {
    return `${title} (1)`;
  }

  const [, prefix, duplicateNumber] = match;
  const parsedDuplicateNumber = Number.parseInt(duplicateNumber, 10);
  const isValidDuplicateNumber =
    parsedDuplicateNumber > 0 && parsedDuplicateNumber < MAX_SIGNED_INT32;

  if (!isValidDuplicateNumber) {
    return `${title} (1)`;
  }

  return `${prefix}(${parsedDuplicateNumber + 1})`;
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

export function loadActivePage(): ActivePage | null {
  try {
    const raw = localStorage.getItem(ACTIVE_PAGE_KEY);
    return raw ? (JSON.parse(raw) as ActivePage) : null;
  } catch {
    return null;
  }
}

export function saveActivePage(page: ActivePage | null) {
  try {
    if (page) localStorage.setItem(ACTIVE_PAGE_KEY, JSON.stringify(page));
    else localStorage.removeItem(ACTIVE_PAGE_KEY);
  } catch {
    // localStorage might be unavailable (e.g. private browsing quota)
  }
}

export function loadPagesCache(): Record<string, PageEntry[]> {
  const splitCache = loadSplitPagesCache();
  if (Object.keys(splitCache).length > 0) return splitCache;

  return migrateLegacyPagesCache();
}

export function derivePageState(
  pages: Record<string, PageEntry[]>,
  previousPageIdsByWorkspace: Record<string, string[]> = {},
): PageDerivedState {
  const pageIdsByWorkspace: Record<string, string[]> = {};
  const pagesIndex: Record<string, PageIndexEntry> = {};

  for (const [workspaceId, workspacePages] of Object.entries(pages)) {
    const list = Array.isArray(workspacePages) ? workspacePages : [];
    const pageIds = list.map((page, index) => {
      pagesIndex[page._id] = { workspaceId, index };
      return page._id;
    });
    const previousPageIds = previousPageIdsByWorkspace[workspaceId];
    pageIdsByWorkspace[workspaceId] = areStringArraysEqual(previousPageIds, pageIds)
      ? previousPageIds
      : pageIds;
  }

  return { pages, pageIdsByWorkspace, pagesIndex };
}

function areStringArraysEqual(left: readonly string[] | undefined, right: readonly string[]): left is string[] {
  return !!left && left.length === right.length && left.every((value, index) => value === right[index]);
}

export function savePagesCache(
  pages: Record<string, PageEntry[]>,
  dirtyWorkspaceIds?: string | string[],
) {
  enqueuePagesCachePersist(pages, dirtyWorkspaceIds);
}

let pendingPagesCache: Record<string, PageEntry[]> | null = null;
let pendingPagesCacheMicrotask = false;
let pendingPagesCacheDebounceHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
let pendingPagesCacheIdleHandle: number | null = null;
let pendingPagesCacheTimeoutHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
const dirtyWorkspaceIds = new Set<string>();

type RequestIdleCallback = (
  callback: IdleRequestCallback,
  options?: IdleRequestOptions,
) => number;
type CancelIdleCallback = (handle: number) => void;

export function schedulePagesCachePersist(
  pages: Record<string, PageEntry[]>,
  dirtyWorkspaceIds?: string | string[],
) {
  enqueuePagesCachePersist(pages, dirtyWorkspaceIds);
}

function enqueuePagesCachePersist(
  pages: Record<string, PageEntry[]>,
  workspaceIds?: string | string[],
) {
  pendingPagesCache = pages;
  markDirtyWorkspaces(workspaceIds ?? Object.keys(pages));

  if (pendingPagesCacheMicrotask) {
    return;
  }

  pendingPagesCacheMicrotask = true;
  queueMicrotask(() => {
    pendingPagesCacheMicrotask = false;
    scheduleDebouncedPagesCacheFlush();
  });
}

export function flushScheduledPagesCachePersist() {
  cancelIdlePagesCacheFlush();

  if (!pendingPagesCache) {
    return;
  }

  const pages = pendingPagesCache;
  const workspaceIds = [...dirtyWorkspaceIds];
  pendingPagesCache = null;
  dirtyWorkspaceIds.clear();

  timed("savePagesCache", () => {
    try {
      for (const workspaceId of workspaceIds) {
        const workspacePages = pages[workspaceId];
        if (workspacePages) {
          localStorage.setItem(workspaceCacheKey(workspaceId), JSON.stringify(workspacePages));
        } else {
          localStorage.removeItem(workspaceCacheKey(workspaceId));
        }
      }
      for (const legacyKey of LEGACY_PAGE_CACHE_KEYS) {
        localStorage.removeItem(legacyKey);
      }
    } catch {
      // localStorage might be unavailable (e.g. private browsing quota)
    }
  });
}

if (globalThis.window !== undefined) {
  globalThis.addEventListener("pagehide", flushScheduledPagesCachePersist);
}

function loadSplitPagesCache(): Record<string, PageEntry[]> {
  const pages: Record<string, PageEntry[]> = {};

  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(PAGE_CACHE_WORKSPACE_PREFIX)) continue;
      const workspaceId = key.slice(PAGE_CACHE_WORKSPACE_PREFIX.length);
      const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
      pages[workspaceId] = Array.isArray(parsed) ? (parsed as PageEntry[]) : [];
    }
  } catch {
    return {};
  }

  return pages;
}

function migrateLegacyPagesCache(): Record<string, PageEntry[]> {
  for (const legacyKey of LEGACY_PAGE_CACHE_KEYS) {
    try {
      const raw = localStorage.getItem(legacyKey);
      if (!raw) continue;
      const pages = JSON.parse(raw) as Record<string, PageEntry[]>;
      for (const [workspaceId, workspacePages] of Object.entries(pages)) {
        localStorage.setItem(workspaceCacheKey(workspaceId), JSON.stringify(workspacePages));
      }
      localStorage.removeItem(legacyKey);
      return pages;
    } catch {
      return {};
    }
  }

  return {};
}

function workspaceCacheKey(workspaceId: string): string {
  return `${PAGE_CACHE_WORKSPACE_PREFIX}${workspaceId}`;
}

function markDirtyWorkspaces(workspaceIds: string | string[]) {
  const ids = Array.isArray(workspaceIds) ? workspaceIds : [workspaceIds];
  for (const workspaceId of ids) {
    if (workspaceId) dirtyWorkspaceIds.add(workspaceId);
  }
}

function scheduleDebouncedPagesCacheFlush() {
  if (pendingPagesCacheDebounceHandle !== null) {
    globalThis.clearTimeout(pendingPagesCacheDebounceHandle);
  }

  pendingPagesCacheDebounceHandle = globalThis.setTimeout(() => {
    pendingPagesCacheDebounceHandle = null;
    scheduleIdlePagesCacheFlush();
  }, PAGE_CACHE_SAVE_DEBOUNCE_MS);
}

function scheduleIdlePagesCacheFlush() {
  if (pendingPagesCacheIdleHandle !== null || pendingPagesCacheTimeoutHandle !== null) return;

  const requestIdle = (globalThis as typeof globalThis & {
    requestIdleCallback?: RequestIdleCallback;
  }).requestIdleCallback;

  if (requestIdle) {
    pendingPagesCacheIdleHandle = requestIdle(() => {
      pendingPagesCacheIdleHandle = null;
      flushScheduledPagesCachePersist();
    });
    return;
  }

  pendingPagesCacheTimeoutHandle = globalThis.setTimeout(() => {
    pendingPagesCacheTimeoutHandle = null;
    flushScheduledPagesCachePersist();
  }, PAGE_CACHE_IDLE_FALLBACK_MS);
}

function cancelIdlePagesCacheFlush() {
  if (pendingPagesCacheDebounceHandle !== null) {
    globalThis.clearTimeout(pendingPagesCacheDebounceHandle);
    pendingPagesCacheDebounceHandle = null;
  }

  if (pendingPagesCacheTimeoutHandle !== null) {
    globalThis.clearTimeout(pendingPagesCacheTimeoutHandle);
    pendingPagesCacheTimeoutHandle = null;
  }

  if (pendingPagesCacheIdleHandle === null) return;

  const cancelIdle = (globalThis as typeof globalThis & {
    cancelIdleCallback?: CancelIdleCallback;
  }).cancelIdleCallback;

  if (cancelIdle) {
    cancelIdle(pendingPagesCacheIdleHandle);
  } else {
    clearTimeout(pendingPagesCacheIdleHandle);
  }

  pendingPagesCacheIdleHandle = null;
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

/** Wraps a page updater to also set updatedAt to the current time. */
export function withTimestamp(
  updater: (page: PageEntry) => PageEntry,
): (page: PageEntry) => PageEntry {
  return (page) => ({
    ...updater(page),
    updatedAt: new Date().toISOString(),
  });
}

/** Convert seed page format to PageEntry (with content) */
export function seedToEntry(sp: SeedPage): PageEntry {
  return {
    _id: sp._id,
    title: sp.title,
    icon: sp.icon,
    updatedAt: sp.updatedAt ?? "2026-04-20T12:00:00.000Z",
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

/**
 * Drop columns emptied of all content and unwrap a column_list back to plain
 * blocks once 0 or 1 column remains, so dragging the content that created a
 * column out of it can never leave an unremovable empty column behind.
 */
export function pruneColumns(blocks: Block[]): Block[] {
  const result: Block[] = [];
  for (const block of blocks) {
    if (block.type === "column_list") {
      const columns = (block.children ?? [])
        .map((column) => ({ ...column, children: pruneColumns(column.children ?? []) }))
        .filter((column) => (column.children?.length ?? 0) > 0);
      if (columns.length === 0) continue;
      if (columns.length === 1) {
        result.push(...(columns[0].children ?? []));
        continue;
      }
      result.push({ ...block, children: columns });
      continue;
    }
    result.push(block.children ? { ...block, children: pruneColumns(block.children) } : block);
  }
  return result;
}

/** Creates a page updater that removes a block. */
export function applyBlockDelete(
  blockId: string,
): (page: PageEntry) => PageEntry {
  return (page) => ({
    ...page,
    content: pruneColumns(deleteBlockFromTree(page.content ?? [], blockId)),
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
      arr.splice(boundedTarget, 0, moved);
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

    return { ...page, content: pruneColumns(content) };
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
      return { ...page, content: pruneColumns(withoutBlock) };
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

    return { ...page, content: pruneColumns(withoutBlock) };
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
