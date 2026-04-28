/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PlaygroundPageEditor.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 00:00:00 by codex             ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useCallback, useState } from "react";
import { GripVertical, Plus } from "lucide-react";

import { SlashCommandMenu } from "@/features/slash-commands";
import { PageSelectorMenu } from "./PageSelectorMenu";
import type { Block } from "@/entities/block";

import { usePageStore } from "@/store/usePageStore";
import {
  BLOCK_DRAG_TYPE,
  BLOCK_INDENT_PX,
  useBlockDragDrop,
  usePlaygroundBlockEditor,
  BlockEditor,
} from "@/features/block-editor";
import { BlockContextMenu } from "./BlockContextMenu";

import { selfRendersChildren } from "@/entities/block";

interface PlaygroundPageEditorProps {
  pageId: string;
}

interface DropTargetViewModel {
  referenceBlockId: string;
  position: "before" | "after";
  indentLevel: number;
  targetParentId: string | null;
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

/** Editable block-based page editor for the playground. */
export const PlaygroundPageEditor: React.FC<PlaygroundPageEditorProps> = ({
  pageId,
}) => {
  const page = usePageStore((s) => s.pageById(pageId));
  const deleteBlock = usePageStore((s) => s.deleteBlock);
  const blocks = useMemo(() => page?.content ?? [], [page?.content]);
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const highlightedRootBlockId = useMemo(
    () => getHighlightedRootBlockId(blocks, focusedBlockId),
    [blocks, focusedBlockId],
  );
  const {
    draggedBlockId,
    dropTarget,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDrop,
    handleDragLeave,
  } = useBlockDragDrop(pageId, blocks);

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
    <div // NOSONAR — onDragLeave is a native drag-and-drop cleanup handler, not user interaction
      className="flex flex-col"
      data-page-editor
      onDragLeave={handleDragLeave}
    >
      <BlockTree
        blocks={blocks}
        pageId={pageId}
        isRoot
        highlightedRootBlockId={highlightedRootBlockId}
        draggedBlockId={draggedBlockId}
        dropTarget={dropTarget}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDrop={handleDrop}
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
    </div>
  );
};

interface BlockTreeProps {
  blocks: Block[];
  pageId: string;
  isRoot?: boolean;
  parentBlockType?: Block["type"] | null;
  parentBlockId?: string | null;
  highlightedRootBlockId: string | null;
  isHighlightedBranch?: boolean;
  draggedBlockId: string | null;
  dropTarget: DropTargetViewModel | null;
  onDragStart: (blockId: string) => void;
  onDragOver: (e: React.DragEvent, blockId: string) => void;
  onDragEnd: () => void;
  onDrop: (e: React.DragEvent) => void;
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
  highlightedRootBlockId,
  isHighlightedBranch = false,
  draggedBlockId,
  dropTarget,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
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
        const isHighlighted =
          isHighlightedBranch ||
          (highlightedRootBlockId !== null &&
            block.id === highlightedRootBlockId);

        return (
          <div key={block.id} className="group/block-branch rounded-md">
            <DraggablePlaygroundBlock
              block={block}
              draggedBlockId={draggedBlockId}
              dropTarget={dropTarget}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
              onDrop={onDrop}
              onContextMenu={onContextMenu}
            >
              <EditableBlock
                pageId={pageId}
                block={block}
                parentBlockId={parentBlockId}
                numberedIndex={numberedIndex}
                isHighlighted={isHighlighted}
                draggedBlockId={draggedBlockId}
                dropTarget={dropTarget}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDragEnd={onDragEnd}
                onDrop={onDrop}
                onChange={onChange}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                onDeleteBlock={onDeleteBlock}
                registerRef={registerRef}
                onRequestSlashMenu={onRequestSlashMenu}
                focusBlock={focusBlock}
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
                  highlightedRootBlockId={highlightedRootBlockId}
                  isHighlightedBranch={isHighlighted}
                  draggedBlockId={draggedBlockId}
                  dropTarget={dropTarget}
                  onDragStart={onDragStart}
                  onDragOver={onDragOver}
                  onDragEnd={onDragEnd}
                  onDrop={onDrop}
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
  draggedBlockId: string | null;
  dropTarget: DropTargetViewModel | null;
  onDragStart: (blockId: string) => void;
  onDragOver: (e: React.DragEvent, blockId: string) => void;
  onDragEnd: () => void;
  onDrop: (e: React.DragEvent) => void;
  onContextMenu: (e: React.MouseEvent, blockId: string) => void;
  children: React.ReactNode;
}

const DraggablePlaygroundBlock: React.FC<DraggablePlaygroundBlockProps> = ({
  block,
  draggedBlockId,
  dropTarget,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  onContextMenu,
  children,
}) => {
  const isDropReference = dropTarget?.referenceBlockId === block.id;
  const isDragged = draggedBlockId === block.id;

  return (
    <div// NOSONAR
      role="group"
      data-testid="draggable-block"
      data-draggable-block-id={block.id}
      data-block-type={block.type}
      className={[
        "group/block relative rounded-md pl-7 transition-colors transition-opacity hover:bg-[var(--color-surface-secondary)] focus-within:bg-[var(--color-surface-secondary)]",
        isDragged ? "opacity-30" : "",
      ].join(" ")}
      onContextMenu={(e) => onContextMenu(e, block.id)}
      onDragOver={(e) => {
        e.stopPropagation();
        onDragOver(e, block.id);
      }}
      onDrop={(e) => {
        e.stopPropagation();
        onDrop(e);
      }}
    >
      {/* Drop indicator — BEFORE */}
      {isDropReference && dropTarget.position === "before" && (
        <div
          data-testid="block-drop-indicator"
          className="absolute right-0 -top-px z-10 h-0.5 rounded-full bg-blue-500 pointer-events-none"
          style={{ left: `${dropTarget.indentLevel * BLOCK_INDENT_PX}px` }}
        />
      )}

      <button
        type="button"
        draggable
        data-testid="block-drag-handle"
        onClick={(e) => onContextMenu(e, block.id)}
        onDragStart={(e) => {
          e.dataTransfer.setData(BLOCK_DRAG_TYPE, block.id);
          e.dataTransfer.effectAllowed = "move";
          onDragStart(block.id);
        }}
        onDragEnd={onDragEnd}
        className="absolute left-0 top-2 flex h-5 w-5 items-center justify-center rounded text-[var(--color-ink-faint)] opacity-0 transition-colors transition-opacity hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-ink-muted)] group-hover/block:opacity-100 cursor-grab active:cursor-grabbing"
        aria-label="Drag to reorder block"
        title="Drag to reorder"
      >
        <GripVertical size={14} />
      </button>

      {children}

      {/* Drop indicator — AFTER */}
      {isDropReference && dropTarget.position === "after" && (
        <div
          data-testid="block-drop-indicator"
          className="absolute right-0 -bottom-px z-10 h-0.5 rounded-full bg-blue-500 pointer-events-none"
          style={{ left: `${dropTarget.indentLevel * BLOCK_INDENT_PX}px` }}
        />
      )}
    </div>
  );
};

interface EditableBlockProps {
  pageId: string;
  block: Block;
  parentBlockId?: string | null;
  numberedIndex: number;
  isHighlighted: boolean;
  draggedBlockId: string | null;
  dropTarget: DropTargetViewModel | null;
  onDragStart: (blockId: string) => void;
  onDragOver: (e: React.DragEvent, blockId: string) => void;
  onDragEnd: () => void;
  onDrop: (e: React.DragEvent) => void;
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
  onContextMenu: (e: React.MouseEvent, blockId: string) => void;
}

const EditableBlockBase: React.FC<EditableBlockProps> = ({
  pageId,
  block,
  parentBlockId = null,
  numberedIndex,
  isHighlighted,
  draggedBlockId,
  dropTarget,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  onChange,
  onKeyDown,
  onPaste,
  onDeleteBlock,
  registerRef,
  focusBlock,
  onRequestSlashMenu,
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

  const renderChildren = useCallback(() => {
    if (!block.children?.length) return null;

    return (
      <BlockTree
        blocks={block.children}
        pageId={pageId}
        parentBlockType={block.type}
        parentBlockId={block.id}
        highlightedRootBlockId={isHighlighted ? block.id : null}
        isHighlightedBranch={isHighlighted}
        draggedBlockId={draggedBlockId}
        dropTarget={dropTarget}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDrop={onDrop}
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
    draggedBlockId,
    dropTarget,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDrop,
    onChange,
    onKeyDown,
    onPaste,
    onDeleteBlock,
    registerRef,
    focusBlock,
    onContextMenu,
    onRequestSlashMenu,
  ]);

  return (
    <div
      data-block-id={block.id}
      data-block-type={block.type}
      ref={refCb}
      className="-mx-1 rounded-md px-1"
    >
      <BlockEditor
        pageId={pageId}
        block={block}
        numberedIndex={numberedIndex}
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
