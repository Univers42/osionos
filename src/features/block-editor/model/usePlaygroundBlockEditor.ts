/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePlaygroundBlockEditor.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/13 13:52:58 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
} from "react";
import { usePageStore } from "@/store/usePageStore";
import {
  detectBlockType,
  getInlineEditorSelectionOffsets,
  getCalloutIconForKind,
  parseMarkdownToBlocks,
  type InlineEditorSelectionOffsets,
} from "@/shared/lib/markengine";
import { useSlashSelect, repositionCursor } from "@/features/slash-commands";
import { useUserStore } from "@/features/auth";
import {
  isIndentable,
  isParentable,
  isHeadingBlock,
  isListBlock,
  isEffectivelyEmpty,
  enterCreatesChild,
  findBlockInTree,
} from "@/entities/block";
import { createTableBlockFromData } from "@/entities/block/model/tableBlocks";
import { useDatabaseStore } from "@/store/useDatabaseStore";
import type { Block, LayoutCell } from "@/entities/block";
import {
  handleArrowUp,
  handleArrowDown,
  handleEnterKey,
  getAdjacentRenderedBlockId,
} from "./playgroundBlockEditor.helpers";
import { useBlockHistory } from "./useBlockHistory";
import { getInlineMarkAtCaretEnd } from "./inlineMarkHelpers";
import type {
  SlashMenuState,
  PageSelectorMenuState,
} from "./playgroundBlockEditor.helpers";
import { useBlockContextMenu } from "./useBlockContextMenu";
import { focusEditableBlock } from "./blockDomFocus";
import {
  clearBlockDraft,
  clearBlockDraftsForSource,
  flushAllBlockDraftsForSource,
  flushBlockDraft,
  rebaseBlockDraft,
  setBlockDraft,
  setBlockDraftCommitter,
  type BlockDraftCommitReason,
} from "./blockDraftStore";

export type PlaygroundBlockEditorSource =
  | string
  | { kind: "page"; pageId: string }
  | { kind: "cell"; pageId: string; layoutBlockId: string; cellId: string };

type NormalizedEditorSource =
  | { kind: "page"; pageId: string }
  | { kind: "cell"; pageId: string; layoutBlockId: string; cellId: string };

const HEADING_SHORTCUT_RE = /^#{1,6}$/;
const EMPTY_BLOCKS: Block[] = [];

const fallbackBlocksByCell = new WeakMap<LayoutCell, {
  blockType: unknown;
  blocks: Block[];
  content: unknown;
}>();

function parsePipeTable(text: string): Partial<Block> | null {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) return null;

  const parseRow = (line: string): string[] | null => {
    if (!line.includes("|")) return null;
    const core = line.replace(/^\|/, "").replace(/\|$/, "");
    const cells = core.split("|").map((cell) => cell.trim());
    return cells.length >= 2 ? cells : null;
  };

  const header = parseRow(lines[0]);
  const separator = parseRow(lines[1]);
  if (!header || !separator || header?.length !== separator?.length)
    return null;

  const isSeparator = separator.every((cell) => /^:?-{3,}:?$/.test(cell));
  if (!isSeparator) return null;
  const columnAlignments = separator.map((cell) => {
    const trimmed = cell.trim();
    if (trimmed.startsWith(":") && trimmed.endsWith(":")) return "center";
    if (trimmed.endsWith(":")) return "right";
    if (trimmed.startsWith(":")) return "left";
    return null;
  });

  const bodyRows = lines
    .slice(2)
    .map(parseRow)
    .filter(
      (row): row is string[] =>
        Array.isArray(row) && row.length === header.length,
    );

  const tableData = [header, ...bodyRows];
  return tableData.length
    ? createTableBlockFromData(tableData, { columnAlignments })
    : null;
}

function shouldTryMarkdownShortcut(text: string): boolean {
  const trimmed = text.trimEnd();
  return (
    text.endsWith(" ") ||
    /^[-*_]{3,}$/.test(trimmed) ||
    trimmed.startsWith("```") ||
    trimmed === "$$"
  );
}

function isEffectivelyEmptyForDeletion(text: string): boolean {
  return text.replaceAll("\u200B", "").trim().length === 0;
}

function normalizeCreatedPageTitleFromLinkQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return "Untitled";

  if (!trimmed.endsWith("]]")) {
    return trimmed;
  }

  const withoutClosingBrackets = trimmed.slice(0, -2).trimEnd();
  return withoutClosingBrackets || "Untitled";
}

function findChildrenForParent(
  blocks: Block[],
  parentBlockId: string,
): Block[] | null {
  for (const block of blocks) {
    if (block.id === parentBlockId) {
      return block.children ?? [];
    }

    if (!block.children) {
      continue;
    }

    const nestedChildren = findChildrenForParent(block.children, parentBlockId);
    if (nestedChildren) {
      return nestedChildren;
    }
  }

  return null;
}

function normalizeEditorSource(source: PlaygroundBlockEditorSource): NormalizedEditorSource {
  return typeof source === "string" ? { kind: "page", pageId: source } : source;
}

function editorSourceKey(source: NormalizedEditorSource): string {
  return source.kind === "page"
    ? `page:${source.pageId}`
    : `cell:${source.pageId}:${source.layoutBlockId}:${source.cellId}`;
}

function isBlockLike(value: unknown): value is Block {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as Block).id === "string" &&
      typeof (value as Block).type === "string" &&
      typeof (value as Block).content === "string",
  );
}

function createCellFallbackBlock(cellId: string, content: unknown, blockType: unknown): Block {
  const fallbackType = typeof blockType === "string" ? blockType as Block["type"] : "paragraph";
  return {
    id: `${cellId}-content`,
    type: fallbackType,
    content: typeof content === "string" ? content : "",
  };
}

function layoutCellsOf(block: Block): LayoutCell[] {
  return Array.isArray(block.layoutCells) ? block.layoutCells : [];
}

function blocksFromCell(cell: LayoutCell | undefined): Block[] {
  if (!cell) return EMPTY_BLOCKS;
  if (Array.isArray(cell.blocks) && cell.blocks.length > 0) {
    const candidateBlocks: unknown[] = cell.blocks;
    if (candidateBlocks.every(isBlockLike)) return candidateBlocks;
    const blocks = candidateBlocks.filter(isBlockLike);
    if (blocks.length > 0) return blocks;
  }

  const cached = fallbackBlocksByCell.get(cell);
  if (cached && cached.content === cell.content && cached.blockType === cell.blockType) {
    return cached.blocks;
  }

  const blocks = [
    createCellFallbackBlock(
      cell.id,
      cell.content,
      cell.blockType,
    ),
  ];
  fallbackBlocksByCell.set(cell, { blockType: cell.blockType, blocks, content: cell.content });
  return blocks;
}

function selectEditorContent(pageContent: Block[] | undefined, source: NormalizedEditorSource): Block[] {
  const rootContent = pageContent ?? EMPTY_BLOCKS;
  if (source.kind === "page") return rootContent;
  return findLayoutCellBlocks(rootContent, source.layoutBlockId, source.cellId);
}

function replaceLayoutCellBlocks(cell: LayoutCell, nextBlocks: Block[]): LayoutCell {
  return {
    ...cell,
    type: "text" as const,
    content: summarizeBlocks(nextBlocks),
    blocks: nextBlocks,
  };
}

function summarizeBlocks(blocks: Block[]): string {
  return blocks.map((block) => block.content).join("\n");
}

function findLayoutCellBlocks(
  blocks: Block[],
  layoutBlockId: string,
  cellId: string,
): Block[] {
  for (const block of blocks) {
    if (block.id === layoutBlockId) {
      const cell = layoutCellsOf(block).find((candidate) => candidate.id === cellId);
      return blocksFromCell(cell);
    }

    if (block.children?.length) {
      const childResult = findLayoutCellBlocks(block.children, layoutBlockId, cellId);
      if (childResult.length > 0) return childResult;
    }

    for (const cell of layoutCellsOf(block)) {
      const nestedResult = findLayoutCellBlocks(blocksFromCell(cell), layoutBlockId, cellId);
      if (nestedResult.length > 0) return nestedResult;
    }
  }

  return EMPTY_BLOCKS;
}

function patchLayoutCellBlocks(
  blocks: Block[],
  layoutBlockId: string,
  cellId: string,
  nextBlocks: Block[],
): Block[] {
  let changed = false;

  const nextTree = blocks.map((block) => {
    if (block.id === layoutBlockId) {
      let cellsChanged = false;
      const nextCells = layoutCellsOf(block).map((cell) => {
        if (cell.id !== cellId) return cell;
        cellsChanged = true;
        return replaceLayoutCellBlocks(cell, nextBlocks);
      });
      if (!cellsChanged) return block;
      changed = true;
      return { ...block, layoutCells: nextCells };
    }

    const nextChildren = block.children?.length
      ? patchLayoutCellBlocks(block.children, layoutBlockId, cellId, nextBlocks)
      : undefined;
    const childrenChanged = Boolean(nextChildren && nextChildren !== block.children);

    const sourceCells = layoutCellsOf(block);
    let cellsChanged = false;
    const nextCells = sourceCells.length > 0
      ? sourceCells.map((cell) => {
          const currentBlocks = blocksFromCell(cell);
          const nestedBlocks = patchLayoutCellBlocks(currentBlocks, layoutBlockId, cellId, nextBlocks);
          if (nestedBlocks === currentBlocks) return cell;
          cellsChanged = true;
          return replaceLayoutCellBlocks(cell, nestedBlocks);
        })
      : undefined;

    if (!childrenChanged && !cellsChanged) return block;
    if (cellsChanged) changed = true;
    return {
      ...block,
      ...(childrenChanged ? { children: nextChildren } : {}),
      ...(cellsChanged && nextCells ? { layoutCells: nextCells } : {}),
    };
  });

  return changed ? nextTree : blocks;
}

function cloneBlocks(blocks: Block[]): Block[] {
  return blocks.map((block) => ({
    ...block,
    children: block.children ? cloneBlocks(block.children) : undefined,
  }));
}

function updateBlockInEditorTree(
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

    if (!block.children?.length) return block;
    const nextChildren = updateBlockInEditorTree(block.children, blockId, updater);
    if (nextChildren === block.children) return block;
    changed = true;
    return { ...block, children: nextChildren };
  });
  return changed ? nextBlocks : blocks;
}

function insertBlockAfterInEditorTree(blocks: Block[], afterBlockId: string, blockToInsert: Block): Block[] {
  const nextBlocks = cloneBlocks(blocks);

  const insertInto = (list: Block[]): boolean => {
    for (let index = 0; index < list.length; index += 1) {
      if (list[index].id === afterBlockId) {
        list.splice(index + 1, 0, blockToInsert);
        return true;
      }
      if (list[index].children && insertInto(list[index].children!)) return true;
    }
    return false;
  };

  if (!insertInto(nextBlocks)) nextBlocks.push(blockToInsert);
  return nextBlocks;
}

function replaceBlockInEditorTree(blocks: Block[], blockId: string, replacement: Block[]): Block[] {
  const nextBlocks = cloneBlocks(blocks);

  const replaceIn = (list: Block[]): boolean => {
    for (let index = 0; index < list.length; index += 1) {
      if (list[index].id === blockId) {
        list.splice(index, 1, ...replacement);
        return true;
      }
      if (list[index].children && replaceIn(list[index].children!)) return true;
    }
    return false;
  };

  return replaceIn(nextBlocks) ? nextBlocks : blocks;
}

function clampOffset(offset: number, max: number): number {
  return Math.max(0, Math.min(offset, max));
}

function resolvePasteSelectionOffsets(
  event: React.ClipboardEvent,
  fallbackContent: string,
): InlineEditorSelectionOffsets {
  const target = event.currentTarget;
  const fallbackOffset = fallbackContent.length;

  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    return {
      start: target.selectionStart ?? fallbackOffset,
      end: target.selectionEnd ?? fallbackOffset,
    };
  }

  if (target instanceof HTMLElement) {
    const offsets = getInlineEditorSelectionOffsets(target);
    if (offsets) return offsets;
  }

  return { start: fallbackOffset, end: fallbackOffset };
}

function isBlockStructuredMarkdown(text: string): boolean {
  if (/\n\s*\n/.test(text)) return true;

  return text
    .split("\n")
    .some((line) => {
      const trimmed = line.trim();
      return (
        /^#{1,6}\s+/.test(trimmed) ||
        /^(```|~~~)/.test(trimmed) ||
        /^[-*+]\s+/.test(trimmed) ||
        /^\d+\.\s+/.test(trimmed) ||
        /^[-*+]\s+\[[ xX]\]\s+/.test(trimmed) ||
        /^>\s?/.test(trimmed) ||
        /^[-*_]{3,}$/.test(trimmed) ||
        /^\|.*\|$/.test(trimmed) ||
        /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed)
      );
    });
}

function buildMarkdownPasteReplacement(
  currentBlock: Block,
  pastedBlocks: Block[],
  offsets: InlineEditorSelectionOffsets,
): Block[] {
  const content = currentBlock.content ?? "";
  if (isEffectivelyEmpty(content)) return pastedBlocks;

  const start = clampOffset(Math.min(offsets.start, offsets.end), content.length);
  const end = clampOffset(Math.max(offsets.start, offsets.end), content.length);
  const before = content.slice(0, start);
  const after = content.slice(end);
  const replacement: Block[] = [];

  if (before.length > 0) {
    replacement.push({ ...currentBlock, content: before });
  }

  replacement.push(...pastedBlocks);

  if (after.length > 0) {
    replacement.push({
      ...currentBlock,
      id: crypto.randomUUID(),
      content: after,
      children: undefined,
    });
  }

  return replacement;
}

function deleteBlockFromEditorTree(blocks: Block[], blockId: string): Block[] {
  return blocks.flatMap((block) => {
    if (block.id === blockId) return block.children ?? [];
    return [{
      ...block,
      children: block.children ? deleteBlockFromEditorTree(block.children, blockId) : undefined,
    }];
  });
}

function moveBlockInEditorTree(
  blocks: Block[],
  blockId: string,
  targetIndex: number,
  parentBlockId: string | null = null,
): Block[] {
  const content = cloneBlocks(blocks);

  const reorderInArray = (list: Block[]): boolean => {
    const fromIndex = list.findIndex((block) => block.id === blockId);
    if (fromIndex < 0) return false;
    const [moved] = list.splice(fromIndex, 1);
    list.splice(Math.max(0, Math.min(targetIndex, list.length)), 0, moved);
    return true;
  };

  const reorderInParent = (list: Block[]): boolean => {
    for (const block of list) {
      if (block.id === parentBlockId) {
        block.children = block.children ?? [];
        return reorderInArray(block.children);
      }
      if (block.children && reorderInParent(block.children)) return true;
    }
    return false;
  };

  if (parentBlockId) reorderInParent(content);
  else reorderInArray(content);
  return content;
}

function moveBlockAcrossEditorTree(
  blocks: Block[],
  blockId: string,
  targetParentBlockId: string | null,
  targetIndex: number,
): Block[] {
  let extracted: Block | null = null;
  const extractFromTree = (list: Block[]): Block[] =>
    list.flatMap((block) => {
      if (block.id === blockId) {
        extracted = cloneBlocks([block])[0];
        return [];
      }
      return [{ ...block, children: block.children ? extractFromTree(block.children) : undefined }];
    });

  const withoutBlock = extractFromTree(cloneBlocks(blocks));
  if (!extracted) return blocks;

  if (!targetParentBlockId) {
    withoutBlock.splice(Math.max(0, Math.min(targetIndex, withoutBlock.length)), 0, extracted);
    return withoutBlock;
  }

  const insertInParent = (list: Block[]): boolean => {
    for (const block of list) {
      if (block.id === targetParentBlockId) {
        block.children = block.children ?? [];
        block.children.splice(Math.max(0, Math.min(targetIndex, block.children.length)), 0, extracted!);
        return true;
      }
      if (block.children && insertInParent(block.children)) return true;
    }
    return false;
  };

  if (!insertInParent(withoutBlock)) {
    withoutBlock.splice(Math.max(0, Math.min(targetIndex, withoutBlock.length)), 0, extracted);
  }
  return withoutBlock;
}

function indentBlockInEditorTree(blocks: Block[], blockId: string): Block[] {
  const content = cloneBlocks(blocks);

  const indent = (list: Block[]): boolean => {
    for (let index = 0; index < list.length; index += 1) {
      if (list[index].id === blockId) {
        if (index === 0) return true;
        const [moved] = list.splice(index, 1);
        const previous = list[index - 1];
        previous.children = previous.children ?? [];
        previous.children.push(moved);
        return true;
      }
      if (list[index].children && indent(list[index].children!)) return true;
    }
    return false;
  };

  indent(content);
  return content;
}

function outdentBlockInEditorTree(blocks: Block[], blockId: string): Block[] {
  const content = cloneBlocks(blocks);

  const outdent = (list: Block[], parentList: Block[] | null = null, parentIndex = -1): boolean => {
    for (let index = 0; index < list.length; index += 1) {
      if (list[index].id === blockId) {
        if (!parentList || parentIndex < 0) return true;
        const [moved] = list.splice(index, 1);
        parentList.splice(parentIndex + 1, 0, moved);
        return true;
      }
      if (list[index].children && outdent(list[index].children!, list, index)) return true;
    }
    return false;
  };

  outdent(content);
  return content;
}

/** Manages block editing, slash commands, and keyboard navigation for playground pages. */
export function usePlaygroundBlockEditor(editorSource: PlaygroundBlockEditorSource) {
  const source = useMemo(() => normalizeEditorSource(editorSource), [editorSource]);
  const sourceKey = useMemo(() => editorSourceKey(source), [source]);
  const pageId = source.pageId;
  const content = usePageStore(
    useCallback(
      (state) => selectEditorContent(state.pageById(pageId)?.content, source),
      [pageId, source],
    ),
  );

  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  const [pageSelector, setPageSelector] =
    useState<PageSelectorMenuState | null>(null);
  const blockRefs = useRef<Map<string, HTMLElement>>(new Map());
  const contentRef = useRef<Block[]>(content);

  /** Focus a block element after a short delay. */
  const focusBlock = useCallback((blockId: string, cursorEnd = false) => {
    focusEditableBlock(blockId, cursorEnd ? "end" : "start");
  }, []);

  const updatePageContent = useCallback(
    (_pid: string, blocks: Block[]) => {
      contentRef.current = blocks;
      if (source.kind === "page") {
        usePageStore.getState().updatePageContent(pageId, blocks);
        return;
      }

      const rootContent = usePageStore.getState().pageById(pageId)?.content ?? [];
      const nextRootContent = patchLayoutCellBlocks(rootContent, source.layoutBlockId, source.cellId, blocks);
      usePageStore.getState().updatePageContent(pageId, nextRootContent);
    },
    [pageId, source],
  );

  const flushPendingDrafts = useCallback(
    (reason: BlockDraftCommitReason = "structural") => {
      flushAllBlockDraftsForSource(sourceKey, reason);
      return contentRef.current;
    },
    [sourceKey],
  );

  const flushPendingBlockDraft = useCallback(
    (blockId: string, reason: BlockDraftCommitReason = "structural") => {
      flushBlockDraft(sourceKey, blockId, reason);
      return contentRef.current;
    },
    [sourceKey],
  );

  const replaceContent = useCallback(
    (blocks: Block[]) => updatePageContent(pageId, blocks),
    [pageId, updatePageContent],
  );

  const updateBlock = useCallback(
    (_pid: string, blockId: string, updates: Partial<Block>) => {
      updatePageContent(pageId, updateBlockInEditorTree(contentRef.current, blockId, (block) => ({
        ...block,
        ...updates,
      })));
      if (typeof updates.content === "string") {
        rebaseBlockDraft(sourceKey, blockId, updates.content);
      }
    },
    [pageId, sourceKey, updatePageContent],
  );

  const insertBlock = useCallback(
    (_pid: string, afterBlockId: string, block: Block) => {
      flushPendingDrafts("structural");
      updatePageContent(pageId, insertBlockAfterInEditorTree(contentRef.current, afterBlockId, block));
    },
    [flushPendingDrafts, pageId, updatePageContent],
  );

  const deleteBlock = useCallback(
    (_pid: string, blockId: string) => {
      flushPendingDrafts("structural");
      updatePageContent(pageId, deleteBlockFromEditorTree(contentRef.current, blockId));
      clearBlockDraft(sourceKey, blockId);
    },
    [flushPendingDrafts, pageId, sourceKey, updatePageContent],
  );

  const changeBlockType = useCallback(
    (_pid: string, blockId: string, newType: Block["type"]) => {
      flushPendingBlockDraft(blockId, "shortcut");
      updatePageContent(pageId, updateBlockInEditorTree(contentRef.current, blockId, (block) => ({
        ...block,
        type: newType,
      })));
    },
    [flushPendingBlockDraft, pageId, updatePageContent],
  );

  const moveBlock = useCallback(
    (_pid: string, blockId: string, targetIndex: number, parentBlockId: string | null = null) => {
      flushPendingDrafts("structural");
      updatePageContent(pageId, moveBlockInEditorTree(contentRef.current, blockId, targetIndex, parentBlockId));
    },
    [flushPendingDrafts, pageId, updatePageContent],
  );

  const moveBlockAcrossTree = useCallback(
    (_pid: string, blockId: string, targetParentBlockId: string | null, targetIndex: number) => {
      flushPendingDrafts("structural");
      updatePageContent(pageId, moveBlockAcrossEditorTree(contentRef.current, blockId, targetParentBlockId, targetIndex));
    },
    [flushPendingDrafts, pageId, updatePageContent],
  );

  const indentBlock = useCallback(
    (_pid: string, blockId: string) => {
      flushPendingBlockDraft(blockId, "structural");
      updatePageContent(pageId, indentBlockInEditorTree(contentRef.current, blockId));
    },
    [flushPendingBlockDraft, pageId, updatePageContent],
  );

  const outdentBlock = useCallback(
    (_pid: string, blockId: string) => {
      flushPendingBlockDraft(blockId, "structural");
      updatePageContent(pageId, outdentBlockInEditorTree(contentRef.current, blockId));
    },
    [flushPendingBlockDraft, pageId, updatePageContent],
  );

  const { pushSnapshot, undo, redo, clearHistory, canUndo, canRedo } = useBlockHistory(
    sourceKey,
    updatePageContent,
    focusBlock,
  );

  // Clear undo/redo history when navigating to a different page.
  useEffect(() => {
    clearHistory();
  }, [sourceKey, clearHistory]);

  /** Get the bounding rect of the caret. */
  const getCaretRect = useCallback((): { x: number; y: number } => {
    const sel = globalThis.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.x !== 0 || rect.y !== 0) return { x: rect.x, y: rect.bottom };
    }
    return { x: 100, y: 300 };
  }, []);

  /** Persist block content edits in the page store. */
  const persistBlockText = useCallback(
    (blockId: string, text: string) => {
      updateBlock(pageId, blockId, {
        content: text,
        ...(text.trim().length > 0 ? { placeholderText: undefined } : {}),
      });
    },
    [pageId, updateBlock],
  );

  useEffect(
    () => setBlockDraftCommitter(sourceKey, (blockId, text) => {
      persistBlockText(blockId, text);
    }),
    [persistBlockText, sourceKey],
  );

  useEffect(() => () => {
    flushAllBlockDraftsForSource(sourceKey, "unmount");
    clearBlockDraftsForSource(sourceKey);
  }, [sourceKey]);

  const tryHandleCodeOrTable = useCallback(
    (blockId: string, text: string): boolean => {
      const trimmedText = text.trim();
      const language = trimmedText.startsWith("```")
        ? trimmedText.slice(3).trim().toLowerCase()
        : "";
      const isLanguageSafe = [...language].every(
        (char) =>
          (char >= "a" && char <= "z") ||
          (char >= "0" && char <= "9") ||
          char === "_" ||
          char === "+" ||
          char === "-",
      );

      if (trimmedText.startsWith("```") && isLanguageSafe) {
        changeBlockType(pageId, blockId, "code");
        updateBlock(pageId, blockId, {
          content: "",
          language: language || "plaintext",
        });
        repositionCursor(blockId, "");
        return true;
      }

      const parsedTable = parsePipeTable(text);
      if (!parsedTable) return false;

      changeBlockType(pageId, blockId, "table_block");
      updateBlock(pageId, blockId, parsedTable);
      return true;
    },
    [pageId, changeBlockType, updateBlock],
  );

  const tryHandleSlashMenu = useCallback(
    (blockId: string, text: string): boolean => {
      if (text.endsWith("/") && !slashMenu) {
        setSlashMenu({ blockId, position: getCaretRect(), filter: "" });
        return true;
      }

      if (slashMenu?.blockId !== blockId) return false;

      const slashIdx = text.lastIndexOf("/");
      if (slashIdx >= 0) {
        const newFilter = text.slice(slashIdx + 1);
        setSlashMenu((prev) => {
          if (prev?.filter === newFilter) return prev;
          return prev ? { ...prev, filter: newFilter } : null;
        });
      } else {
        setSlashMenu(null);
      }

      return true;
    },
    [slashMenu, getCaretRect],
  );

  const tryHandlePageSelectorMenu = useCallback(
    (blockId: string, text: string): boolean => {
      if (text.endsWith("[[") && !pageSelector) {
        setPageSelector({ blockId, position: getCaretRect(), filter: "" });
        return true;
      }

      if (pageSelector?.blockId !== blockId) return false;

      const triggerIdx = text.lastIndexOf("[[");
      if (triggerIdx >= 0) {
        const newFilter = text.slice(triggerIdx + 2);
        setPageSelector((prev) => {
          if (prev?.filter === newFilter) return prev;
          return prev ? { ...prev, filter: newFilter } : null;
        });
      } else {
        setPageSelector(null);
      }

      return true;
    },
    [pageSelector, getCaretRect],
  );

  const applyMarkdownDetection = useCallback(
    (blockId: string, detection: ReturnType<typeof detectBlockType>): void => {
      if (!detection) return;

      changeBlockType(pageId, blockId, detection.type);
      updateBlock(pageId, blockId, {
        content: detection.remainingContent,
        ...(detection.type === "to_do"
          ? { checked: Boolean(detection.checked) }
          : { checked: undefined }),
        ...(detection.type === "callout"
          ? { color: getCalloutIconForKind(detection.kind ?? "note") }
          : {}),
        ...(detection.type === "code"
          ? { language: detection.language ?? "plaintext" }
          : { language: undefined }),
        ...(detection.type === "toggle" ? { collapsed: false } : {}),
        headingLevel: detection.headingLevel,
      });
      repositionCursor(blockId, detection.remainingContent);
    },
    [pageId, changeBlockType, updateBlock],
  );

  const tryHandleMarkdownShortcut = useCallback(
    (blockId: string, text: string): void => {
      if (!shouldTryMarkdownShortcut(text)) return;

      const detection = detectBlockType(text);
      if (!detection) return;

      applyMarkdownDetection(blockId, detection);
    },
    [applyMarkdownDetection],
  );

  /** Handle content change — detects '/' trigger and markdown shortcuts. */
  const handleBlockChange = useCallback(
    (blockId: string, text: string) => {
      const block = findBlockInTree(contentRef.current, blockId);
      setBlockDraft(sourceKey, blockId, block?.content ?? "", text);
      if (tryHandleCodeOrTable(blockId, text)) return;

      // Code blocks are plain-text editors: no slash menu or markdown shortcuts.
      if (block?.type === "code") return;

      if (tryHandleSlashMenu(blockId, text)) return;
      if (tryHandlePageSelectorMenu(blockId, text)) return;
      tryHandleMarkdownShortcut(blockId, text);
    },
    [
      sourceKey,
      tryHandleCodeOrTable,
      tryHandleSlashMenu,
      tryHandlePageSelectorMenu,
      tryHandleMarkdownShortcut,
    ],
  );

  const handleParagraphSpaceShortcut = useCallback(
    (e: React.KeyboardEvent, blockId: string, block: Block): boolean => {
      if (e.key !== " " || block.type !== "paragraph") return false;

      const detection = detectBlockType(`${block.content} `);
      if (!detection) return false;

      e.preventDefault();
      applyMarkdownDetection(blockId, detection);
      focusBlock(blockId);
      return true;
    },
    [applyMarkdownDetection, focusBlock],
  );

  const handleToggleHeadingSpaceShortcut = useCallback(
    (e: React.KeyboardEvent, blockId: string, block: Block): boolean => {
      if (e.key !== " " || block.type !== "toggle") return false;
      if (!HEADING_SHORTCUT_RE.test(block.content)) return false;

      e.preventDefault();
      updateBlock(pageId, blockId, {
        content: "",
        headingLevel: block.content.length as 1 | 2 | 3 | 4 | 5 | 6,
      });
      focusBlock(blockId);
      return true;
    },
    [pageId, updateBlock, focusBlock],
  );

  const handleBlockIndentation = useCallback(
    (
      e: React.KeyboardEvent,
      blockId: string,
      block: Block,
      content: Block[],
    ): boolean => {
      if (e.key !== "Tab" || !isIndentable(block.type)) return false;

      const idx = content.findIndex((b) => b.id === blockId);

      if (!e.shiftKey) {
        // Can't indent the first sibling
        if (idx <= 0) return false;
        // Can't indent under a leaf block
        if (!isParentable(content[idx - 1].type)) return false;
      }

      e.preventDefault();

      if (e.shiftKey) {
        outdentBlock(pageId, blockId);
      } else {
        indentBlock(pageId, blockId);
      }

      repositionCursor(blockId, block.content);

      return true;
    },
    [pageId, indentBlock, outdentBlock],
  );

  const handleEmptyListEnter = useCallback(
    (
      e: React.KeyboardEvent,
      blockId: string,
      block: Block,
      blockIdx: number,
      content: Block[],
      isEmpty: boolean,
    ): boolean => {
      if (
        e.key !== "Enter" ||
        e.shiftKey ||
        !isListBlock(block.type) ||
        !isEmpty
      ) {
        return false;
      }

      e.preventDefault();

      changeBlockType(pageId, blockId, "paragraph");
      updateBlock(pageId, blockId, { content: "" });
      focusBlock(blockId);
      repositionCursor(blockId, "");

      return true;
    },
    [pageId, changeBlockType, updateBlock, focusBlock],
  );

  const handleEmptyTodoEnter = useCallback(
    (
      e: React.KeyboardEvent,
      blockId: string,
      block: Block,
      isEmpty: boolean,
    ): boolean => {
      if (
        e.key !== "Enter" ||
        e.shiftKey ||
        block.type !== "to_do" ||
        !isEmpty
      ) {
        return false;
      }

      e.preventDefault();
      changeBlockType(pageId, blockId, "paragraph");
      updateBlock(pageId, blockId, { content: "", checked: false });
      focusBlock(blockId);
      repositionCursor(blockId, "");

      return true;
    },
    [pageId, changeBlockType, updateBlock, focusBlock],
  );

  const handleEmptyListDelete = useCallback(
    (
      e: React.KeyboardEvent,
      blockId: string,
      block: Block,
      blockIdx: number,
      content: Block[],
      isEmpty: boolean,
    ): boolean => {
      if (e.key !== "Delete" || !isListBlock(block.type) || !isEmpty) {
        return false;
      }

      e.preventDefault();
      const nextRenderedBlockId = getAdjacentRenderedBlockId(blockId, "next");
      const prevRenderedBlockId = getAdjacentRenderedBlockId(blockId, "prev");
      deleteBlock(pageId, blockId);
      if (nextRenderedBlockId) {
        focusBlock(nextRenderedBlockId);
      } else if (prevRenderedBlockId) {
        focusBlock(prevRenderedBlockId, true);
      }

      return true;
    },
    [pageId, deleteBlock, focusBlock],
  );

  const handleDividerDelete = useCallback(
    (
      e: React.KeyboardEvent,
      blockId: string,
      block: Block,
      _blockIdx: number,
      _content: Block[],
    ): boolean => {
      if (
        (e.key !== "Backspace" && e.key !== "Delete") ||
        block.type !== "divider"
      ) {
        return false;
      }

      e.preventDefault();
      const nextRenderedBlockId = getAdjacentRenderedBlockId(blockId, "next");
      const prevRenderedBlockId = getAdjacentRenderedBlockId(blockId, "prev");
      deleteBlock(pageId, blockId);
      if (nextRenderedBlockId) {
        focusBlock(nextRenderedBlockId);
      } else if (prevRenderedBlockId) {
        focusBlock(prevRenderedBlockId, true);
      }
      return true;
    },
    [pageId, deleteBlock, focusBlock],
  );

  const deleteAndFocusAdjacent = useCallback(
    (e: React.KeyboardEvent, blockId: string) => {
      e.preventDefault();
      const nextId = getAdjacentRenderedBlockId(blockId, "next");
      const prevId = getAdjacentRenderedBlockId(blockId, "prev");
      deleteBlock(pageId, blockId);

      const preferNext = e.key === "Delete";
      const primaryId = preferNext ? nextId : prevId;
      const fallbackId = preferNext ? prevId : nextId;

      if (primaryId) {
        focusBlock(primaryId, !preferNext);
      } else if (fallbackId) {
        focusBlock(fallbackId, preferNext);
      }
    },
    [pageId, deleteBlock, focusBlock],
  );

  const handleEmptyBackspace = useCallback(
    (
      e: React.KeyboardEvent,
      blockId: string,
      block: Block,
      blockIdx: number,
      content: Block[],
      parentBlockId: string | null,
      isEmpty: boolean,
    ): boolean => {
      if ((e.key !== "Backspace" && e.key !== "Delete") || !isEmpty)
        return false;

      if (isHeadingBlock(block.type)) {
        e.preventDefault();
        changeBlockType(pageId, blockId, "paragraph");
        updateBlock(pageId, blockId, { content: "" });
        focusBlock(blockId);
        return true;
      }

      if (isListBlock(block.type)) {
        deleteAndFocusAdjacent(e, blockId);
        return true;
      }

      if (block.type === "paragraph" && parentBlockId) {
        e.preventDefault();
        outdentBlock(pageId, blockId);
        focusBlock(blockId);
        repositionCursor(blockId, "");
        return true;
      }

      if (content.length >= 1) {
        deleteAndFocusAdjacent(e, blockId);
        return true;
      }

      return false;
    },
    [
      pageId,
      changeBlockType,
      updateBlock,
      focusBlock,
      outdentBlock,
      deleteAndFocusAdjacent,
    ],
  );

  // Backspace at the very start of a NON-empty indented block outdents it one
  // level (Notion behaviour), instead of doing nothing. Repeated presses walk
  // the block back out level by level; at root level it falls through to the
  // default merge-with-previous. Empty blocks keep their existing handling.
  const handleStartBackspaceOutdent = useCallback(
    (
      e: React.KeyboardEvent,
      blockId: string,
      block: Block,
      parentBlockId: string | null,
      isEmpty: boolean,
    ): boolean => {
      if (e.key !== "Backspace" || e.shiftKey || isEmpty || !parentBlockId) return false;

      const editorEl = e.currentTarget as HTMLElement | null;
      const offsets = editorEl ? getInlineEditorSelectionOffsets(editorEl) : null;
      if (!offsets || offsets.start !== 0 || offsets.end !== 0) return false;

      e.preventDefault();
      flushPendingBlockDraft(blockId, "structural");
      outdentBlock(pageId, blockId);
      repositionCursor(blockId, block.content);
      return true;
    },
    [pageId, outdentBlock, flushPendingBlockDraft],
  );

  const handleArrowNavigation = useCallback(
    (e: React.KeyboardEvent, blockId: string, content: Block[]): boolean => {
      if (
        e.key === "ArrowRight" &&
        !e.shiftKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        const mark = getInlineMarkAtCaretEnd(e.target as HTMLElement);
        if (mark) {
          e.preventDefault();
          const sel = globalThis.getSelection();
          if (sel) {
            const r = document.createRange();
            r.setStartAfter(mark);
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
          }
          return true;
        }
      }

      if (e.key === "ArrowUp") {
        if (handleArrowUp(blockId, content, focusBlock)) e.preventDefault();
        return true;
      }

      if (e.key === "ArrowDown") {
        if (
          handleArrowDown(blockId, content, e.target as HTMLElement, focusBlock)
        )
          e.preventDefault();
        return true;
      }

      return false;
    },
    [focusBlock],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent, blockId: string) => {
      flushPendingBlockDraft(blockId, "structural");
      const currentBlock = findBlockInTree(contentRef.current, blockId);
      if (!currentBlock || currentBlock.type === "code") return;

      const rawMarkdown = e.clipboardData.getData("text/markdown");
      const rawPlainText = e.clipboardData.getData("text/plain");
      const raw = rawMarkdown || rawPlainText;
      if (!raw) return;

      const markdown = raw.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
      if (!markdown.trim() || !isBlockStructuredMarkdown(markdown)) return;

      const parsed = parseMarkdownToBlocks(markdown);
      if (parsed.length === 0) return;

      e.preventDefault();

      const offsets = resolvePasteSelectionOffsets(e, currentBlock.content ?? "");
      const replacement = buildMarkdownPasteReplacement(currentBlock, parsed, offsets);
      updatePageContent(pageId, replaceBlockInEditorTree(contentRef.current, blockId, replacement));
      focusBlock(parsed.at(-1)?.id ?? replacement.at(-1)?.id ?? blockId, true);
    },
    [flushPendingBlockDraft, pageId, updatePageContent, focusBlock],
  );

  const handleContainerEnter = useCallback(
    (e: React.KeyboardEvent, blockId: string, block: Block): boolean => {
      if (
        e.key !== "Enter" ||
        e.shiftKey ||
        !enterCreatesChild(block.type) ||
        block.type === "toggle"
      ) {
        return false;
      }

      e.preventDefault();
      const child: Block = {
        id: crypto.randomUUID(),
        type: "paragraph",
        content: "",
      };
      const existingChildren = block.children ?? [];
      updateBlock(pageId, blockId, { children: [...existingChildren, child] });
      focusBlock(child.id);
      return true;
    },
    [pageId, updateBlock, focusBlock],
  );

  /** Handle Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z for undo/redo. Returns true if handled. */
  const handleUndoRedo = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;

      if (e.key === "z" && !e.shiftKey) {
        // Only intercept if we have structural history; otherwise let
        // the browser handle native text undo.
        if (!canUndo()) return false;
        flushPendingDrafts("undo-redo");
        if (undo(contentRef.current)) {
          clearBlockDraftsForSource(sourceKey);
          e.preventDefault();
          return true;
        }
        return false;
      }
      if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        if (!canRedo()) return false;
        flushPendingDrafts("undo-redo");
        if (redo(contentRef.current)) {
          clearBlockDraftsForSource(sourceKey);
          e.preventDefault();
          return true;
        }
        return false;
      }
      return false;
    },
    [canRedo, canUndo, flushPendingDrafts, redo, sourceKey, undo],
  );

  /** Push an undo snapshot if the key will trigger a structural block mutation. */
  const maybePushStructuralSnapshot = useCallback(
    (e: React.KeyboardEvent, isEmptyForDeletion: boolean) => {
      const isStructural =
        e.key === "Tab" || e.key === "Enter" ||
        ((e.key === "Backspace" || e.key === "Delete") && isEmptyForDeletion);
      if (isStructural) {
        flushPendingDrafts("structural");
        pushSnapshot(contentRef.current);
      }
    },
    [flushPendingDrafts, pushSnapshot],
  );

  /** Try Enter-key actions (new block creation). Returns true if handled. */
  const handleEnterAction = useCallback(
    (e: React.KeyboardEvent, blockId: string, blockType: Block["type"]) => {
      if (e.key !== "Enter" || e.shiftKey) return false;
      flushPendingBlockDraft(blockId, "structural");
      handleEnterKey(e, blockId, blockType, slashMenu, pageId, insertBlock, focusBlock);
      return true;
    },
    [flushPendingBlockDraft, slashMenu, pageId, insertBlock, focusBlock],
  );

  /** Try Escape-key actions (close menus). */
  const handleEscapeAction = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (slashMenu) setSlashMenu(null);
      if (pageSelector) setPageSelector(null);
    },
    [slashMenu, pageSelector],
  );

  /** Handle key presses — Enter, Backspace, Arrow navigation. */
  const handleKeyDown = useCallback(
    (
      e: React.KeyboardEvent,
      blockId: string,
      parentBlockId: string | null = null,
    ) => {
      if (handleUndoRedo(e)) return;

      const content = parentBlockId
        ? (findChildrenForParent(contentRef.current, parentBlockId) ?? [])
        : contentRef.current;
      const block = content.find((b) => b.id === blockId);
      if (!block) return;
      const liveText =
        (e.currentTarget as HTMLElement | null)?.textContent ?? block.content;
      const isEmpty = isEffectivelyEmpty(liveText);
      const isEmptyForDeletion = isEffectivelyEmptyForDeletion(liveText);

      maybePushStructuralSnapshot(e, isEmptyForDeletion);

      const nextContent = parentBlockId
        ? (findChildrenForParent(contentRef.current, parentBlockId) ?? [])
        : contentRef.current;
      const nextBlock = nextContent.find((b) => b.id === blockId) ?? block;
      const nextBlockIdx = nextContent.findIndex((b) => b.id === blockId);

      const handled =
        handleBlockIndentation(e, blockId, nextBlock, nextContent) ||
        handleParagraphSpaceShortcut(e, blockId, nextBlock) ||
        handleToggleHeadingSpaceShortcut(e, blockId, nextBlock) ||
        handleEmptyListEnter(e, blockId, nextBlock, nextBlockIdx, nextContent, isEmpty) ||
        handleEmptyTodoEnter(e, blockId, nextBlock, isEmpty) ||
        handleEmptyListDelete(e, blockId, nextBlock, nextBlockIdx, nextContent, isEmpty) ||
        handleDividerDelete(e, blockId, nextBlock, nextBlockIdx, nextContent) ||
        (e.key === "Enter" && nextBlock.type === "code") ||
        handleContainerEnter(e, blockId, nextBlock);

      if (handled) return;
      if (handleEnterAction(e, blockId, nextBlock.type)) return;
      if (handleStartBackspaceOutdent(e, blockId, nextBlock, parentBlockId, isEmpty)) return;
      if (handleEmptyBackspace(e, blockId, nextBlock, nextBlockIdx, nextContent, parentBlockId, isEmptyForDeletion)) return;
      if (handleArrowNavigation(e, blockId, nextContent)) return;
      handleEscapeAction(e);
    },
    [
      handleUndoRedo,
      maybePushStructuralSnapshot,
      handleBlockIndentation,
      handleParagraphSpaceShortcut,
      handleToggleHeadingSpaceShortcut,
      handleEmptyListEnter,
      handleEmptyTodoEnter,
      handleEmptyListDelete,
      handleDividerDelete,
      handleContainerEnter,
      handleEnterAction,
      handleStartBackspaceOutdent,
      handleEmptyBackspace,
      handleArrowNavigation,
      handleEscapeAction,
    ],
  );

  /** Create a real inline database + default view in the shared DBMS store. */
  const createInlineDatabase = useCallback((name?: string) => {
    return useDatabaseStore.getState().createInlineDatabase(name);
  }, []);

  const createPageInPrivateWorkspace = useCallback(
    async (
      title = "Untitled",
      options?: { icon?: string; content?: Block[]; open?: boolean },
    ) => {
      const session = useUserStore.getState().activeSession();
      const privateWorkspaceId = session?.privateWorkspaces[0]?._id;
      if (!privateWorkspaceId) return null;

      const jwt = session?.accessToken ?? "";
      const page = await usePageStore
        .getState()
        .addPage(privateWorkspaceId, title, jwt, undefined, {
          icon: options?.icon,
          content: options?.content,
        });

      if (page && options?.open) {
        globalThis.setTimeout(() => {
          usePageStore.getState().openPage({
            id: page._id,
            workspaceId: privateWorkspaceId,
            kind: "page",
            title: page.title,
            icon: page.icon,
          });
        }, 0);
      }

      return page ? { id: page._id } : null;
    },
    [],
  );

  const createDatabasePageInPrivateWorkspace = useCallback(
    async (title = "Untitled database") => {
      const session = useUserStore.getState().activeSession();
      const privateWorkspaceId = session?.privateWorkspaces[0]?._id;
      if (!privateWorkspaceId) return null;

      const jwt = session?.accessToken ?? "";
      const databaseReference = useDatabaseStore.getState().createInlineDatabase(title);
      const page = await usePageStore
        .getState()
        .addDatabasePage(
          privateWorkspaceId,
          title,
          jwt,
          databaseReference.databaseId,
        );

      if (!page) return null;

      usePageStore.getState().openPage({
        id: page._id,
        workspaceId: privateWorkspaceId,
        kind: "database",
        title: page.title,
        icon: page.icon,
        databaseId: page.databaseId ?? databaseReference.databaseId,
      });

      return { id: page._id };
    },
    [],
  );

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  /** Wrap updatePageContent so context menu operations push undo snapshots. */
  const updatePageContentWithHistory = useCallback(
    (pid: string, blocks: Block[]) => {
      const currentContent = flushPendingDrafts("structural");
      pushSnapshot(currentContent);
      updatePageContent(pid, blocks);
    },
    [flushPendingDrafts, pushSnapshot, updatePageContent],
  );

  const {
    contextMenu,
    contextMenuSections,
    openContextMenu,
    closeContextMenu,
  } = useBlockContextMenu({
    pageId,
    content,
    updatePageContent: updatePageContentWithHistory,
    focusBlock,
  });

  /** Handle slash-command selection. */
  const {
    handleSlashBlockSelect,
    handleSlashTurnIntoSelect,
    handleSlashDatabaseViewSelect,
    handleSlashMediaSelect,
    handleSlashCreatePageSelect,
    handleSlashInlineSelect,
  } = useSlashSelect({
    pageId,
    slashMenu,
    setSlashMenu,
    updateBlock,
    changeBlockType,
    insertBlock,
    createInlineDatabase,
    createPageInPrivateWorkspace,
    createDatabasePageInPrivateWorkspace,
    focusBlock,
  });

  const handlePageSelectorSelect = useCallback(
    (targetPageId: string) => {
      if (!pageSelector) return;
      const { blockId } = pageSelector;
      flushPendingBlockDraft(blockId, "shortcut");
      const block = findBlockInTree(contentRef.current, blockId);
      if (!block) return;

      const text = block.content;
      const triggerIdx = text.lastIndexOf("[[");
      if (triggerIdx >= 0) {
        const newContent =
          text.slice(0, triggerIdx) + `[[page:${targetPageId}]] `;
        updateBlock(pageId, blockId, { content: newContent });
        repositionCursor(blockId, newContent);
      }
      setPageSelector(null);
    },
    [flushPendingBlockDraft, pageSelector, pageId, updateBlock],
  );

  const handlePageSelectorCreate = useCallback(async () => {
    if (!pageSelector) return;

    const createdPageTitle = normalizeCreatedPageTitleFromLinkQuery(
      pageSelector.filter,
    );

    const createdPage = await createPageInPrivateWorkspace(createdPageTitle);

    if (!createdPage) {
      setPageSelector(null);
      return;
    }

    handlePageSelectorSelect(createdPage.id);
  }, [
    pageSelector,
    createPageInPrivateWorkspace,
    handlePageSelectorSelect,
    setPageSelector,
  ]);

  /** Add a new blank paragraph at the end. */
  const handleAddBlock = useCallback(
    (content: Block[]) => {
      const lastId = content.length > 0 ? content.at(-1)!.id : null; // NOSONAR
      const newBlock: Block = {
        id: crypto.randomUUID(),
        type: "paragraph",
        content: "",
      };
      if (lastId) {
        insertBlock(pageId, lastId, newBlock);
      } else {
        updatePageContent(pageId, [newBlock]);
      }
      focusBlock(newBlock.id);
    },
    [pageId, insertBlock, updatePageContent, focusBlock],
  );

  /** Initialize the first block when focusing the empty area. */
  const handleInitBlock = useCallback(
    (content: Block[]) => {
      if (content.length === 0) {
        const newBlock: Block = {
          id: crypto.randomUUID(),
          type: "paragraph",
          content: "",
        };
        updatePageContent(pageId, [newBlock]);
        focusBlock(newBlock.id);
      }
    },
    [pageId, updatePageContent, focusBlock],
  );

  /** Register or unregister a block ref. */
  const registerBlockRef = useCallback(
    (blockId: string, el: HTMLElement | null) => {
      if (el) blockRefs.current.set(blockId, el);
      else blockRefs.current.delete(blockId);
    },
    [],
  );

  return {
    slashMenu,
    setSlashMenu,
    pageSelector,
    setPageSelector,
    contextMenu,
    contextMenuSections,
    openContextMenu,
    closeContextMenu,
    handleBlockChange,
    handleKeyDown,
    handlePaste,
    handleSlashSelect: handleSlashBlockSelect,
    handleSlashTurnIntoSelect,
    handleSlashDatabaseViewSelect,
    handleSlashMediaSelect,
    handleSlashCreatePageSelect,
    handleSlashInlineSelect,
    handlePageSelectorSelect,
    handlePageSelectorCreate,
    handleAddBlock,
    handleInitBlock,
    registerBlockRef,
    focusBlock,
    flushPendingDrafts,
    content,
    source,
    sourceKey,
    updateBlock,
    deleteBlock,
    updateContent: replaceContent,
    moveBlock,
    moveBlockAcrossTree,
    undo,
    redo,
    pushSnapshot,
  };
}
