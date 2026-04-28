/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PlaygroundPageEditor.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 22:04:12 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useCallback, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { SlashCommandMenu } from "@/features/slash-commands";
import { PageSelectorMenu } from "./PageSelectorMenu";
import type { Block } from "@/entities/block";

import { usePageStore } from "@/store/usePageStore";
import { usePlaygroundBlockEditor, BlockEditor } from "@/features/block-editor";
import { BlockContextMenu } from "./BlockContextMenu";
import { getBlockSurfaceStyle } from "../model/blockColors";

import { isParentable, selfRendersChildren } from "@/entities/block";

interface PlaygroundPageEditorProps {
  pageId: string;
}

type DropPosition = "above" | "below" | "inside" | "left" | "right" | null;
const DND_TYPE = "application/x-playground-block-id";
const EMPTY_BLOCKS: Block[] = [];

interface DropIntent {
  position: Exclude<DropPosition, null>;
  targetParentBlockId: string | null;
  targetIndex: number;
}

interface SelectionPoint {
  x: number;
  y: number;
}

interface SelectionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function createSelectionRect(start: SelectionPoint, end: SelectionPoint): SelectionRect {
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  return {
    left,
    top,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function rectsIntersect(rect: SelectionRect, target: DOMRect): boolean {
  return !(
    rect.left + rect.width < target.left ||
    rect.left > target.right ||
    rect.top + rect.height < target.top ||
    rect.top > target.bottom
  );
}

function isInteractiveSelectionTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  return Boolean(
    target.closest(
      'button, input, textarea, select, a, [contenteditable="true"], [data-column-resize-handle]',
    ),
  );
}

function setsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

/** Returns true when a block's children should be rendered by BlockTree. */
function shouldRenderChildren(block: Block): boolean {
  if (!block.children?.length) return false;
  if (selfRendersChildren(block.type)) return false;
  if (block.type === "toggle" && block.collapsed) return false;
  return true;
}

function getNestedTreeClassName(
  parentBlockType: Block["type"] | null,
  isRoot: boolean,
) {
  if (isRoot || !parentBlockType) {
    return "";
  }

  if (
    parentBlockType === "bulleted_list" ||
    parentBlockType === "numbered_list"
  ) {
    return "ml-[3.25rem] mt-0.5";
  }

  if (parentBlockType === "to_do") {
    return "ml-[2.75rem] mt-0.5";
  }

  if (parentBlockType === "toggle") {
    return "ml-6 mt-0.5 pl-3 border-l-2 border-[var(--color-line)]";
  }

  if (parentBlockType === "column") {
    return "mt-0.5";
  }

  // Generic indentation for all other block types (paragraph, headings,
  // quote, callout, code, etc.) that have children via indent/outdent.
  return "ml-6 mt-0.5";
}

function findBlockById(blocks: Block[], blockId: string): Block | null {
  for (const block of blocks) {
    if (block.id === blockId) {
      return block;
    }

    if (!block.children?.length) {
      continue;
    }

    const nestedBlock = findBlockById(block.children, blockId);
    if (nestedBlock) {
      return nestedBlock;
    }
  }

  return null;
}

function blockContainsBlock(block: Block, candidateId: string): boolean {
  return Boolean(block.children?.some((child) => {
    if (child.id === candidateId) {
      return true;
    }

    return blockContainsBlock(child, candidateId);
  }));
}

function cloneBlock(block: Block): Block {
  return {
    ...block,
    children: block.children?.map(cloneBlock),
  };
}

function removeBlockById(
  blocks: Block[],
  blockId: string,
): { blocks: Block[]; removed: Block | null } {
  let removed: Block | null = null;
  const next: Block[] = [];

  for (const block of blocks) {
    if (block.id === blockId) {
      removed = cloneBlock(block);
      continue;
    }

    const childResult = block.children?.length
      ? removeBlockById(block.children, blockId)
      : null;
    if (childResult?.removed) {
      removed = childResult.removed;
      next.push({ ...cloneBlock(block), children: childResult.blocks });
    } else {
      next.push(cloneBlock(block));
    }
  }

  return { blocks: next, removed };
}

function createColumn(children: Block[]): Block {
  return {
    id: crypto.randomUUID(),
    type: "column",
    content: "",
    widthRatio: 0.5,
    children,
  };
}

function normalizeColumnRatio(column: Block, columnCount: number): number {
  return typeof column.widthRatio === "number" && Number.isFinite(column.widthRatio)
    ? Math.max(0.08, column.widthRatio)
    : 1 / Math.max(columnCount, 1);
}

function updateColumnRatiosInTree(
  blocks: Block[],
  columnListId: string,
  leftColumnId: string,
  rightColumnId: string,
  leftRatio: number,
  rightRatio: number,
): Block[] {
  return blocks.map((block) => {
    if (block.id === columnListId) {
      return {
        ...block,
        children: block.children?.map((column) => {
          if (column.id === leftColumnId) return { ...column, widthRatio: leftRatio };
          if (column.id === rightColumnId) return { ...column, widthRatio: rightRatio };
          return column;
        }),
      };
    }

    return {
      ...block,
      children: block.children
        ? updateColumnRatiosInTree(
            block.children,
            columnListId,
            leftColumnId,
            rightColumnId,
            leftRatio,
            rightRatio,
          )
        : undefined,
    };
  });
}

function wrapTargetInColumns(
  blocks: Block[],
  targetId: string,
  draggedBlock: Block,
  side: "left" | "right",
): Block[] {
  return blocks.map((block) => {
    if (block.id === targetId) {
      const targetColumn = createColumn([cloneBlock(block)]);
      const draggedColumn = createColumn([draggedBlock]);
      const columns =
        side === "left"
          ? [draggedColumn, targetColumn]
          : [targetColumn, draggedColumn];
      return {
        id: crypto.randomUUID(),
        type: "column_list",
        content: "",
        children: columns,
      };
    }

    if (!block.children?.length) {
      return cloneBlock(block);
    }

    return {
      ...cloneBlock(block),
      children: wrapTargetInColumns(block.children, targetId, draggedBlock, side),
    };
  });
}

function splitBlocksIntoColumns(
  blocks: Block[],
  draggedId: string,
  targetId: string,
  side: "left" | "right",
): Block[] {
  const withoutDragged = removeBlockById(blocks, draggedId);
  if (!withoutDragged.removed) return blocks;
  return wrapTargetInColumns(
    withoutDragged.blocks,
    targetId,
    withoutDragged.removed,
    side,
  );
}

function getDropIntent(
  block: Block,
  blocks: Block[],
  parentBlockId: string | null,
  clientX: number,
  clientY: number,
  rect: DOMRect,
): DropIntent | null {
  const targetIdx = blocks.findIndex((candidate) => candidate.id === block.id);
  if (targetIdx < 0) return null;

  const height = Math.max(rect.height, 1);
  const width = Math.max(rect.width, 1);
  const relativeY = (clientY - rect.top) / height;
  const relativeX = (clientX - rect.left) / width;
  const horizontalIndentIntent =
    clientX > rect.left + Math.min(96, rect.width * 0.28);

  if (width > 220 && relativeY > 0.15 && relativeY < 0.85) {
    if (relativeX < 0.14) {
      return {
        position: "left",
        targetParentBlockId: parentBlockId,
        targetIndex: targetIdx,
      };
    }

    if (relativeX > 0.86) {
      return {
        position: "right",
        targetParentBlockId: parentBlockId,
        targetIndex: targetIdx + 1,
      };
    }
  }

  if (isParentable(block.type) && horizontalIndentIntent && relativeY > 0.2) {
    return {
      position: "inside",
      targetParentBlockId: block.id,
      targetIndex: block.children?.length ?? 0,
    };
  }

  if (relativeY < 0.5) {
    return {
      position: "above",
      targetParentBlockId: parentBlockId,
      targetIndex: targetIdx,
    };
  }

  return {
    position: "below",
    targetParentBlockId: parentBlockId,
    targetIndex: targetIdx + 1,
  };
}

function getHighlightedRootBlockId(
  blocks: Block[],
  focusedBlockId: string | null,
): string | null {
  if (!focusedBlockId) {
    return null;
  }

  const focusedBlock = findBlockById(blocks, focusedBlockId);
  if (!focusedBlock) {
    return null;
  }

  return focusedBlock.id;
}

function getDropIndicatorClassName(position: Exclude<DropPosition, null>) {
  switch (position) {
    case "above":
      return "h-0.5 -top-px left-0 right-0";
    case "below":
      return "h-0.5 -bottom-px left-0 right-0";
    case "inside":
      return "h-0.5 -bottom-px left-6 right-0";
    case "left":
      return "left-0 top-1 bottom-1 w-0.5";
    case "right":
      return "right-0 top-1 bottom-1 w-0.5";
  }
}

/** Editable block-based page editor for the playground. */
export const PlaygroundPageEditor: React.FC<PlaygroundPageEditorProps> = ({
  pageId,
}) => {
  const page = usePageStore((s) => s.pageById(pageId));
  const deleteBlock = usePageStore((s) => s.deleteBlock);
  const moveBlock = usePageStore((s) => s.moveBlock);
  const blocks = useMemo(() => page?.content ?? EMPTY_BLOCKS, [page?.content]);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(() => new Set());
  const selectionRootRef = useRef<HTMLDivElement | null>(null);
  const selectionStartRef = useRef<SelectionPoint | null>(null);
  const highlightedRootBlockId = useMemo(
    () => getHighlightedRootBlockId(blocks, focusedBlockId),
    [blocks, focusedBlockId],
  );

  useEffect(() => {
    const syncFocusedBlock = () => {
      const activeElement = document.activeElement as HTMLElement | null;
      const activeBlockId =
        activeElement?.closest<HTMLElement>("[data-block-id]")?.dataset
          .blockId ?? null;
      setFocusedBlockId(activeBlockId);
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      const blockId =
        target?.closest<HTMLElement>("[data-block-id]")?.dataset.blockId ??
        null;
      setFocusedBlockId(blockId);
    };

    const handleFocusOut = () => {
      setTimeout(syncFocusedBlock, 0);
    };

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  const {
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
    handleSlashSelect,
    handleSlashTurnIntoSelect,
    handleSlashMediaSelect,
    handleSlashCreatePageSelect,
    handleSlashInlineSelect,
    handlePageSelectorSelect,
    handlePageSelectorCreate,
    handleAddBlock,
    handleInitBlock,
    registerBlockRef,
    focusBlock,
  } = usePlaygroundBlockEditor(pageId);

  const handleRequestSlashMenu = useCallback(
    (blockId: string, position: { x: number; y: number }) => {
      setSlashMenu({ blockId, position, filter: "" });
    },
    [setSlashMenu],
  );

  const updateMouseSelection = useCallback((rect: SelectionRect) => {
    const root = selectionRootRef.current;
    if (!root) return;

    const nextSelected = new Set<string>();
    root.querySelectorAll<HTMLElement>("[data-block-id]").forEach((element) => {
      const blockId = element.dataset.blockId;
      if (blockId && rectsIntersect(rect, element.getBoundingClientRect())) {
        nextSelected.add(blockId);
      }
    });

    setSelectedBlockIds((previous) =>
      setsEqual(previous, nextSelected) ? previous : nextSelected,
    );
  }, []);

  const handleSelectionPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || draggedBlockId) return;
      if (isInteractiveSelectionTarget(event.target)) return;

      const start = { x: event.clientX, y: event.clientY };
      selectionStartRef.current = start;
      setSelectionRect(createSelectionRect(start, start));
      setSelectedBlockIds(new Set());

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const current = { x: moveEvent.clientX, y: moveEvent.clientY };
        const rect = createSelectionRect(start, current);
        setSelectionRect(rect);
        updateMouseSelection(rect);
      };

      const handlePointerUp = () => {
        selectionStartRef.current = null;
        setSelectionRect(null);
        globalThis.removeEventListener("pointermove", handlePointerMove);
        globalThis.removeEventListener("pointerup", handlePointerUp);
      };

      globalThis.addEventListener("pointermove", handlePointerMove);
      globalThis.addEventListener("pointerup", handlePointerUp, { once: true });
    },
    [draggedBlockId, updateMouseSelection],
  );

  if (!page) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--color-line)] bg-[var(--color-surface-secondary)] px-6 py-12 text-center">
        <div>
          <p className="text-sm font-medium text-[var(--color-ink)]">
            Page unavailable
          </p>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            You cannot edit this page in the current session.
          </p>
        </div>
      </div>
    );
  }

  if (blocks.length === 0) {
    return (
      <button
        type="button"
        data-page-editor-empty-trigger
        className="flex-1 min-h-[200px] cursor-text text-left"
        onClick={() => handleInitBlock(blocks)}
      >
        <p className="text-sm text-[var(--color-ink-faint)] italic select-none pt-1">
          Click here to start writing...
        </p>
      </button>
    );
  }

  return (
    <div
      ref={selectionRootRef}
      className="relative flex flex-col"
      onPointerDown={handleSelectionPointerDown}
    >
      <BlockTree
        blocks={blocks}
        pageId={pageId}
        isRoot
        highlightedRootBlockId={highlightedRootBlockId}
        selectedBlockIds={selectedBlockIds}
        moveBlock={moveBlock}
        draggedBlockId={draggedBlockId}
        setDraggedBlockId={setDraggedBlockId}
        onChange={handleBlockChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onDeleteBlock={(blockId: string) => deleteBlock(pageId, blockId)}
        registerRef={registerBlockRef}
        focusBlock={focusBlock}
        onRequestSlashMenu={handleRequestSlashMenu}
        onContextMenu={openContextMenu}
      />

      <button
        type="button"
        className="flex items-center gap-2 text-sm text-[var(--color-ink-faint)] hover:text-[var(--color-ink-muted)] py-2 px-1 mt-1 transition-colors group"
        onClick={() => handleAddBlock(blocks)}
      >
        <Plus
          size={14}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        />
        <span className="opacity-0 group-hover:opacity-100 transition-opacity">
          Add a block
        </span>
      </button>

      {slashMenu && (
        <SlashCommandMenu
          key={`${slashMenu.blockId}:${slashMenu.filter}`}
          position={slashMenu.position}
          filter={slashMenu.filter}
          onSelect={(item) => {
            if (item.kind === "turn-into") {
              handleSlashTurnIntoSelect(item.blockType, blocks, {
                calloutIcon: item.calloutIcon,
                placeholderText: item.placeholderText,
              });
              return;
            }

            if (item.kind === "create-page") {
              void handleSlashCreatePageSelect(blocks);
              return;
            }

            if (item.kind === "inline") {
              handleSlashInlineSelect(item.insertText, blocks);
              return;
            }

            handleSlashSelect(item.blockType, blocks, item.calloutIcon);
          }}
          onMediaSelect={(kind, value) =>
            handleSlashMediaSelect(kind, value, blocks)
          }
          onClose={() => setSlashMenu(null)}
        />
      )}

      {pageSelector && (
        <PageSelectorMenu
          key={`${pageSelector.blockId}:${pageSelector.filter}`}
          position={pageSelector.position}
          filter={pageSelector.filter}
          onSelect={handlePageSelectorSelect}
          onCreate={() => {
            void handlePageSelectorCreate();
          }}
          onClose={() => setPageSelector(null)}
        />
      )}

      <BlockContextMenu
        menu={contextMenu}
        sections={contextMenuSections}
        onClose={closeContextMenu}
      />

      {selectionRect ? (
        <div
          className="fixed pointer-events-none z-[9999] rounded-sm border border-[var(--color-accent)] bg-[var(--color-accent)]/10"
          style={{
            left: selectionRect.left,
            top: selectionRect.top,
            width: selectionRect.width,
            height: selectionRect.height,
          }}
        />
      ) : null}
    </div>
  );
};

interface BlockTreeProps {
  blocks: Block[];
  pageId: string;
  isRoot?: boolean;
  parentBlockType?: Block["type"] | null;
  parentBlockId?: string | null;
  numberedDepth?: number;
  highlightedRootBlockId: string | null;
  selectedBlockIds: Set<string>;
  isHighlightedBranch?: boolean;
  moveBlock: (
    pageId: string,
    blockId: string,
    targetIndex: number,
    parentBlockId?: string | null,
  ) => void;
  draggedBlockId: string | null;
  setDraggedBlockId: (id: string | null) => void;
  onChange: (blockId: string, text: string) => void;
  onKeyDown: (
    e: React.KeyboardEvent,
    blockId: string,
    parentBlockId?: string | null,
  ) => void;
  onPaste: (e: React.ClipboardEvent, blockId: string) => void;
  onDeleteBlock: (blockId: string) => void;
  registerRef: (blockId: string, el: HTMLElement | null) => void;
  focusBlock: (blockId: string, cursorEnd?: boolean) => void;
  onContextMenu: (e: React.MouseEvent, blockId: string) => void;
  onRequestSlashMenu: (
    blockId: string,
    position: { x: number; y: number },
  ) => void;
}

const BlockTree: React.FC<BlockTreeProps> = ({
  blocks,
  pageId,
  isRoot = false,
  parentBlockType = null,
  parentBlockId = null,
  numberedDepth = 0,
  highlightedRootBlockId,
  selectedBlockIds,
  isHighlightedBranch = false,
  moveBlock,
  draggedBlockId,
  setDraggedBlockId,
  onChange,
  onKeyDown,
  onPaste,
  onDeleteBlock,
  registerRef,
  focusBlock,
  onContextMenu,
  onRequestSlashMenu,
}) => {
  let numberedCounter = 0;

  return (
    <div
      data-testid={
        isRoot ? "block-tree-root" : `${parentBlockType ?? "nested"}-children`
      }
      data-parent-block-type={parentBlockType ?? ""}
      data-parent-block-id={parentBlockId ?? ""}
      className={getNestedTreeClassName(parentBlockType, isRoot)}
    >
      {blocks.map((block) => {
        const numberedIndex =
          block.type === "numbered_list" ? ++numberedCounter : 0;
        if (block.type !== "numbered_list") numberedCounter = 0;
        const nextNumberedDepth =
          block.type === "numbered_list" ? numberedDepth + 1 : numberedDepth;
        const isHighlighted =
          isHighlightedBranch ||
          (highlightedRootBlockId !== null &&
            block.id === highlightedRootBlockId);

        return (
          <div key={block.id} className="group/block-branch rounded-md">
            <DraggablePlaygroundBlock
              block={block}
              blocks={blocks}
              pageId={pageId}
              parentBlockId={parentBlockId}
              moveBlock={moveBlock}
              draggedBlockId={draggedBlockId}
              setDraggedBlockId={setDraggedBlockId}
              selectedBlockIds={selectedBlockIds}
              onContextMenu={onContextMenu}
            >
              <EditableBlock
                pageId={pageId}
                block={block}
                parentBlockId={parentBlockId}
                numberedIndex={numberedIndex}
                numberedDepth={numberedDepth}
                isHighlighted={isHighlighted}
                onChange={onChange}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                onDeleteBlock={onDeleteBlock}
                registerRef={registerRef}
                onRequestSlashMenu={onRequestSlashMenu}
                focusBlock={focusBlock}
                moveBlock={moveBlock}
                draggedBlockId={draggedBlockId}
                setDraggedBlockId={setDraggedBlockId}
                selectedBlockIds={selectedBlockIds}
                onContextMenu={onContextMenu}
              />
            </DraggablePlaygroundBlock>

            {shouldRenderChildren(block) && (
              <div
                className={
                  isHighlighted
                    ? "rounded-md bg-[var(--color-surface-secondary)]"
                    : "rounded-md transition-colors"
                }
              >
                <BlockTree
                  blocks={block.children!}
                  pageId={pageId}
                  parentBlockType={block.type}
                  parentBlockId={block.id}
                  numberedDepth={nextNumberedDepth}
                  highlightedRootBlockId={highlightedRootBlockId}
                  selectedBlockIds={selectedBlockIds}
                  isHighlightedBranch={isHighlighted}
                  moveBlock={moveBlock}
                  draggedBlockId={draggedBlockId}
                  setDraggedBlockId={setDraggedBlockId}
                  onChange={onChange}
                  onKeyDown={onKeyDown}
                  onPaste={onPaste}
                  onDeleteBlock={onDeleteBlock}
                  registerRef={registerRef}
                  focusBlock={focusBlock}
                  onContextMenu={onContextMenu}
                  onRequestSlashMenu={onRequestSlashMenu}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

interface DraggablePlaygroundBlockProps {
  block: Block;
  blocks: Block[];
  pageId: string;
  parentBlockId: string | null;
  moveBlock: (
    pageId: string,
    blockId: string,
    targetIndex: number,
    parentBlockId?: string | null,
  ) => void;
  draggedBlockId: string | null;
  setDraggedBlockId: (id: string | null) => void;
  selectedBlockIds: Set<string>;
  onContextMenu: (e: React.MouseEvent, blockId: string) => void;
  children: React.ReactNode;
}

const DraggablePlaygroundBlock: React.FC<DraggablePlaygroundBlockProps> = ({
  block,
  blocks,
  pageId,
  parentBlockId,
  moveBlock,
  draggedBlockId,
  setDraggedBlockId,
  selectedBlockIds,
  onContextMenu,
  children,
}) => {
  const [dropPosition, setDropPosition] = useState<DropPosition>(null);
  const rootBlocks = usePageStore((s) => s.pageById(pageId)?.content ?? EMPTY_BLOCKS);

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLButtonElement>) => {
      e.dataTransfer.setData(DND_TYPE, block.id);
      e.dataTransfer.effectAllowed = "move";
      setDraggedBlockId(block.id);
    },
    [block.id, setDraggedBlockId],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes(DND_TYPE)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const intent = getDropIntent(
      block,
      blocks,
      parentBlockId,
      e.clientX,
      e.clientY,
      rect,
    );
    setDropPosition(intent?.position ?? null);
  }, [block, blocks, parentBlockId]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropPosition(null);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDropPosition(null);
      const draggedId = e.dataTransfer.getData(DND_TYPE);
      if (!draggedId || draggedId === block.id) return;

      const draggedBlock = findBlockById(rootBlocks, draggedId);
      if (!draggedBlock || blockContainsBlock(draggedBlock, block.id)) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const intent = getDropIntent(
        block,
        blocks,
        parentBlockId,
        e.clientX,
        e.clientY,
        rect,
      );
      if (!intent) return;

      if (intent.position === "left" || intent.position === "right") {
        usePageStore
          .getState()
          .updatePageContent(
            pageId,
            splitBlocksIntoColumns(rootBlocks, draggedId, block.id, intent.position),
          );
        setDraggedBlockId(null);
        return;
      }

      // Check if the dragged block is in the same sibling array
      const isSameLevel = blocks.some((b) => b.id === draggedId);

      if (isSameLevel && intent.targetParentBlockId === parentBlockId) {
        // Same parent — simple reorder
        moveBlock(pageId, draggedId, intent.targetIndex, parentBlockId);
      } else {
        // Cross-tree move — extract from old position, insert here
        usePageStore
          .getState()
          .moveBlockAcrossTree(
            pageId,
            draggedId,
            intent.targetParentBlockId,
            intent.targetIndex,
          );
      }

      setDraggedBlockId(null);
    },
    [
      block,
      blocks,
      moveBlock,
      pageId,
      parentBlockId,
      rootBlocks,
      setDraggedBlockId,
    ],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedBlockId(null);
    setDropPosition(null);
  }, [setDraggedBlockId]);

  const isDragged = draggedBlockId === block.id;
  const isSelected = selectedBlockIds.has(block.id);

  return (
    <div // NOSONAR - drag/drop wrapper cannot be a native interactive element due nested contentEditable controls
      data-testid="draggable-block"
      data-draggable-block-id={block.id}
      data-selected={isSelected ? "true" : undefined}
      data-block-type={block.type}
      className={`group/block relative rounded-md transition-colors transition-opacity hover:bg-[var(--color-surface-secondary)] focus-within:bg-[var(--color-surface-secondary)] ${isDragged ? "opacity-40" : ""} ${isSelected ? "bg-[var(--color-accent)]/10 ring-1 ring-[var(--color-accent)]/35" : ""}`}
      onContextMenu={(e) => onContextMenu(e, block.id)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <button
        type="button"
        draggable
        data-testid="block-drag-handle"
        onClick={(e) => onContextMenu(e, block.id)}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        className="absolute -left-7 top-2 p-0.5 rounded text-[var(--color-ink-faint)] hover:text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-secondary)] transition-colors opacity-0 group-hover/block:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
        aria-label="Drag to reorder block"
        title="Drag to reorder"
      >
        <svg
          className="w-4 h-4"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden
        >
          <circle cx="5.5" cy="3.5" r="1.5" />
          <circle cx="10.5" cy="3.5" r="1.5" />
          <circle cx="5.5" cy="8" r="1.5" />
          <circle cx="10.5" cy="8" r="1.5" />
          <circle cx="5.5" cy="12.5" r="1.5" />
          <circle cx="10.5" cy="12.5" r="1.5" />
        </svg>
      </button>

      {dropPosition && (
        <div
          data-testid="block-drop-indicator"
          className={`absolute bg-[var(--color-accent)] rounded-full pointer-events-none z-10 ${getDropIndicatorClassName(dropPosition)}`}
        />
      )}

      {children}
    </div>
  );
};

interface EditableBlockProps {
  pageId: string;
  block: Block;
  parentBlockId?: string | null;
  numberedIndex: number;
  numberedDepth: number;
  isHighlighted: boolean;
  onChange: (blockId: string, text: string) => void;
  onKeyDown: (
    e: React.KeyboardEvent,
    blockId: string,
    parentBlockId?: string | null,
  ) => void;
  onPaste: (e: React.ClipboardEvent, blockId: string) => void;
  onDeleteBlock: (blockId: string) => void;
  registerRef: (blockId: string, el: HTMLElement | null) => void;
  focusBlock: (blockId: string, cursorEnd?: boolean) => void;
  onRequestSlashMenu: (
    blockId: string,
    position: { x: number; y: number },
  ) => void;
  moveBlock: (
    pageId: string,
    blockId: string,
    targetIndex: number,
    parentBlockId?: string | null,
  ) => void;
  draggedBlockId: string | null;
  setDraggedBlockId: (id: string | null) => void;
  selectedBlockIds: Set<string>;
  onContextMenu: (e: React.MouseEvent, blockId: string) => void;
}

const EditableBlockBase: React.FC<EditableBlockProps> = ({
  pageId,
  block,
  parentBlockId = null,
  numberedIndex,
  numberedDepth,
  isHighlighted,
  onChange,
  onKeyDown,
  onPaste,
  onDeleteBlock,
  registerRef,
  focusBlock,
  onRequestSlashMenu,
  moveBlock,
  draggedBlockId,
  setDraggedBlockId,
  selectedBlockIds,
  onContextMenu,
}) => {
  const handleChange = useCallback(
    (text: string) => onChange(block.id, text),
    [block.id, onChange],
  );

  const handleKey = useCallback(
    (e: React.KeyboardEvent) => onKeyDown(e, block.id, parentBlockId),
    [block.id, onKeyDown, parentBlockId],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => onPaste(e, block.id),
    [block.id, onPaste],
  );

  const refCb = useCallback(
    (el: HTMLDivElement | null) => registerRef(block.id, el),
    [block.id, registerRef],
  );

  // NEW: callback for callout/quote to render children inside their container
  const renderChildren = useCallback(() => {
    if (!block.children?.length) return null;

    if (block.type === "column_list") {
      const columns = block.children;
      return (
        <div className="flex items-stretch gap-0 rounded-md border border-dashed border-transparent hover:border-[var(--color-line)]">
          {columns.map((column, index) => (
            <React.Fragment key={column.id}>
              <div
                className="min-w-0 px-1"
                style={{
                  flexGrow: normalizeColumnRatio(column, columns.length),
                  flexBasis: 0,
                }}
              >
                <BlockTree
                  blocks={column.children ?? []}
                  pageId={pageId}
                  parentBlockType="column"
                  parentBlockId={column.id}
                  numberedDepth={numberedDepth}
                  highlightedRootBlockId={isHighlighted ? block.id : null}
                  selectedBlockIds={selectedBlockIds}
                  isHighlightedBranch={isHighlighted}
                  moveBlock={moveBlock}
                  draggedBlockId={draggedBlockId}
                  setDraggedBlockId={setDraggedBlockId}
                  onChange={onChange}
                  onKeyDown={onKeyDown}
                  onPaste={onPaste}
                  onDeleteBlock={onDeleteBlock}
                  registerRef={registerRef}
                  focusBlock={focusBlock}
                  onContextMenu={onContextMenu}
                  onRequestSlashMenu={onRequestSlashMenu}
                />
              </div>
              {index < columns.length - 1 ? (
                <ColumnResizeHandle
                  pageId={pageId}
                  columnListId={block.id}
                  leftColumn={column}
                  rightColumn={columns[index + 1]}
                  columnCount={columns.length}
                />
              ) : null}
            </React.Fragment>
          ))}
        </div>
      );
    }

    return (
      <BlockTree
        blocks={block.children}
        pageId={pageId}
        parentBlockType={block.type}
        parentBlockId={block.id}
        numberedDepth={block.type === "numbered_list" ? numberedDepth + 1 : numberedDepth}
        highlightedRootBlockId={isHighlighted ? block.id : null}
        selectedBlockIds={selectedBlockIds}
        isHighlightedBranch={isHighlighted}
        moveBlock={moveBlock}
        draggedBlockId={draggedBlockId}
        setDraggedBlockId={setDraggedBlockId}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onDeleteBlock={onDeleteBlock}
        registerRef={registerRef}
        focusBlock={focusBlock}
        onContextMenu={onContextMenu}
        onRequestSlashMenu={onRequestSlashMenu}
      />
    );
  }, [
    block.children,
    block.type,
    block.id,
    isHighlighted,
    pageId,
    moveBlock,
    draggedBlockId,
    setDraggedBlockId,
    onChange,
    onKeyDown,
    onPaste,
    onDeleteBlock,
    registerRef,
    focusBlock,
    onContextMenu,
    onRequestSlashMenu,
    numberedDepth,
    selectedBlockIds,
  ]);

  return (
    <div
      data-block-id={block.id}
      data-block-type={block.type}
      ref={refCb}
      className="-mx-1 rounded-md px-1"
      style={getBlockSurfaceStyle(block)}
    >
      <BlockEditor
        pageId={pageId}
        block={block}
        numberedIndex={numberedIndex}
        numberedDepth={numberedDepth}
        isSelected={selectedBlockIds.has(block.id)}
        onChange={handleChange}
        onKeyDown={handleKey}
        onPaste={handlePaste}
        onDeleteCodeBlock={() => onDeleteBlock(block.id)}
        focusBlock={focusBlock}
        onRequestSlashMenu={(position) =>
          onRequestSlashMenu(block.id, position)
        }
        renderChildren={renderChildren}
      />
    </div>
  );
};

const EditableBlock = React.memo(EditableBlockBase);

interface ColumnResizeHandleProps {
  pageId: string;
  columnListId: string;
  leftColumn: Block;
  rightColumn: Block;
  columnCount: number;
}

const ColumnResizeHandle: React.FC<ColumnResizeHandleProps> = ({
  pageId,
  columnListId,
  leftColumn,
  rightColumn,
  columnCount,
}) => {
  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const container = event.currentTarget.parentElement;
      const totalWidth = Math.max(container?.getBoundingClientRect().width ?? 1, 1);
      const startX = event.clientX;
      const startLeft = normalizeColumnRatio(leftColumn, columnCount);
      const startRight = normalizeColumnRatio(rightColumn, columnCount);
      const pairTotal = startLeft + startRight;
      const minRatio = Math.min(0.24, pairTotal / 2 - 0.02);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const deltaRatio = (moveEvent.clientX - startX) / totalWidth;
        const nextLeft = Math.min(
          pairTotal - minRatio,
          Math.max(minRatio, startLeft + deltaRatio),
        );
        const nextRight = pairTotal - nextLeft;
        const rootBlocks = usePageStore.getState().pageById(pageId)?.content ?? [];
        usePageStore.getState().updatePageContent(
          pageId,
          updateColumnRatiosInTree(
            rootBlocks,
            columnListId,
            leftColumn.id,
            rightColumn.id,
            nextLeft,
            nextRight,
          ),
        );
      };

      const handlePointerUp = () => {
        globalThis.removeEventListener("pointermove", handlePointerMove);
        globalThis.removeEventListener("pointerup", handlePointerUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      globalThis.addEventListener("pointermove", handlePointerMove);
      globalThis.addEventListener("pointerup", handlePointerUp, { once: true });
    },
    [columnCount, columnListId, leftColumn, pageId, rightColumn],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize columns"
      className="group/resize flex w-3 shrink-0 cursor-col-resize items-stretch justify-center"
      onPointerDown={handlePointerDown}
    >
      <div className="w-px rounded-full bg-[var(--color-line)] transition-colors group-hover/resize:bg-[var(--color-accent)]" />
    </div>
  );
};
