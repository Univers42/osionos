/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageStore.helpers.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/05 03:57:44 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block, BlockType } from '@src/types/database';
import type { SeedPage } from '../data/seedPages';
import type { ActivePage, PageEntry } from './pageStore.types';

const RECENTS_KEY = 'pg:recents';

/** A 24-hex-char string that looks like a MongoDB ObjectId. */
const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

/** Returns `true` when `id` looks like a valid MongoDB ObjectId. */
export function isMongoId(id: string): boolean {
  return OBJECT_ID_RE.test(id);
}

export function loadRecents(): ActivePage[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]') as ActivePage[];
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

/** Convert seed page format to PageEntry (with content) */
export function seedToEntry(sp: SeedPage): PageEntry {
  return {
    _id:          sp._id,
    title:        sp.title,
    icon:         sp.icon,
    workspaceId:  sp.workspaceId,
    parentPageId: sp.parentPageId ?? null,
    databaseId:   sp.databaseId ?? null,
    archivedAt:   sp.archivedAt ?? null,
    content:      sp.content,
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
    const idx = list.findIndex(p => p._id === pageId);
    if (idx < 0) continue;
    newPages[wsId] = list.map((p, i) => i === idx ? updater(p) : p);
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

function mapBlocksTree(blocks: Block[], mapper: (block: Block) => Block): Block[] {
  return blocks.map((block) => {
    const nextChildren = block.children
      ? mapBlocksTree(block.children, mapper)
      : undefined;
    return mapper({ ...block, children: nextChildren });
  });
}

function deleteBlockFromTree(blocks: Block[], blockId: string): Block[] {
  return blocks
    .filter((block) => block.id !== blockId)
    .map((block) => ({
      ...block,
      children: block.children ? deleteBlockFromTree(block.children, blockId) : undefined,
    }));
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

    if (block.children && outdentBlockInTree(block.children, blockId, blocks, idx)) {
      return true;
    }
  }

  return false;
}

/** Creates a page updater that patches a single block. */
export function applyBlockUpdate(blockId: string, updates: Partial<Block>): (page: PageEntry) => PageEntry {
  return (page) => ({
    ...page,
    content: mapBlocksTree(page.content ?? [], (block) =>
      block.id === blockId ? { ...block, ...updates } : block),
  });
}

/** Creates a page updater that inserts a block after another. */
export function applyBlockInsert(afterBlockId: string, block: Block): (page: PageEntry) => PageEntry {
  return (page) => {
    const content = [...(page.content ?? [])];
    const afterIdx = content.findIndex(b => b.id === afterBlockId);
    if (afterIdx >= 0) content.splice(afterIdx + 1, 0, block);
    else content.push(block);
    return { ...page, content };
  };
}

/** Creates a page updater that removes a block. */
export function applyBlockDelete(blockId: string): (page: PageEntry) => PageEntry {
  return (page) => ({
    ...page,
    content: deleteBlockFromTree(page.content ?? [], blockId),
  });
}

/** Creates a page updater that reorders a block to a target index. */
export function applyBlockMove(blockId: string, targetIndex: number, parentBlockId: string | null = null): (page: PageEntry) => PageEntry {
  return (page) => {
    const content = cloneBlocks(page.content ?? []);

    const reorderInArray = (arr: Block[]): boolean => {
      const fromIdx = arr.findIndex((b) => b.id === blockId);
      if (fromIdx < 0) return false;

      const [moved] = arr.splice(fromIdx, 1);
      const boundedTarget = Math.max(0, Math.min(targetIndex, arr.length));
      const insertIdx = fromIdx < targetIndex ? boundedTarget - 1 : boundedTarget;
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

/** Creates a page updater that changes a block's type. */
export function applyBlockTypeChange(blockId: string, newType: BlockType): (page: PageEntry) => PageEntry {
  return (page) => ({
    ...page,
    content: mapBlocksTree(page.content ?? [], (block) =>
      block.id === blockId ? { ...block, type: newType } : block),
  });
}

/** Creates a page updater that indents a block under its previous sibling. */
export function applyBlockIndent(blockId: string): (page: PageEntry) => PageEntry {
  return (page) => {
    const content = cloneBlocks(page.content ?? []);
    indentBlockInTree(content, blockId);
    return { ...page, content };
  };
}

/** Creates a page updater that outdents a block to its parent's level. */
export function applyBlockOutdent(blockId: string): (page: PageEntry) => PageEntry {
  return (page) => {
    const content = cloneBlocks(page.content ?? []);
    outdentBlockInTree(content, blockId);
    return { ...page, content };
  };
}
