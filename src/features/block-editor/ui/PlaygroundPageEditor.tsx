/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PlaygroundPageEditor.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: vjan-nie <vjan-nie@student.42madrid.com    +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/20 12:00:00 by vjan-nie         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useCallback, useState } from "react";
import { Plus } from "lucide-react";

import { SlashCommandMenu } from "@/features/slash-commands";
import { PageSelectorMenu } from "./PageSelectorMenu";
import type { Block } from "@/entities/block";

import { usePageStore } from "@/store/usePageStore";
import { usePlaygroundBlockEditor, BlockEditor } from "@/features/block-editor";
import { BlockContextMenu } from "./BlockContextMenu";

import { selfRendersChildren } from "@/entities/block";

interface PlaygroundPageEditorProps {
  pageId: string;
}

type DropPosition = "above" | "below" | null;
const DND_TYPE = "application/x-playground-block-id";

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
  const moveBlock = usePageStore((s) => s.moveBlock);
  const blocks = useMemo(() => page?.content ?? [], [page?.content]);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
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
      const blockId = target?.closest<HTMLElement>("[data-block-id]")?.dataset
        .blockId ?? null;
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
    handlePageSelectorSelect,
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
    <div className="flex flex-col">
      <BlockTree
        blocks={blocks}
        pageId={pageId}
        isRoot
        highlightedRootBlockId={highlightedRootBlockId}
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
  highlightedRootBlockId,
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
    <div className={getNestedTreeClassName(parentBlockType, isRoot)}>
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
              blocks={blocks}
              pageId={pageId}
              parentBlockId={parentBlockId}
              isHighlighted={isHighlighted}
              moveBlock={moveBlock}
              draggedBlockId={draggedBlockId}
              setDraggedBlockId={setDraggedBlockId}
              onContextMenu={onContextMenu}
            >
              <EditableBlock
                pageId={pageId}
                block={block}
                parentBlockId={parentBlockId}
                numberedIndex={numberedIndex}
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
  isHighlighted: boolean;
  moveBlock: (
    pageId: string,
    blockId: string,
    targetIndex: number,
    parentBlockId?: string | null,
  ) => void;
  draggedBlockId: string | null;
  setDraggedBlockId: (id: string | null) => void;
  onContextMenu: (e: React.MouseEvent, blockId: string) => void;
  children: React.ReactNode;
}

const DraggablePlaygroundBlock: React.FC<DraggablePlaygroundBlockProps> = ({
  block,
  blocks,
  pageId,
  parentBlockId,
  isHighlighted,
  moveBlock,
  draggedBlockId,
  setDraggedBlockId,
  onContextMenu,
  children,
}) => {
  const [dropPosition, setDropPosition] = useState<DropPosition>(null);

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
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setDropPosition(e.clientY < midY ? "above" : "below");
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropPosition(null);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDropPosition(null);
      const draggedId = e.dataTransfer.getData(DND_TYPE);
      if (!draggedId || draggedId === block.id) return;

      const targetIdx = blocks.findIndex((b) => b.id === block.id);
      if (targetIdx < 0) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const insertionIdx = e.clientY < midY ? targetIdx : targetIdx + 1;

      // Check if the dragged block is in the same sibling array
      const isSameLevel = blocks.some((b) => b.id === draggedId);

      if (isSameLevel) {
        // Same parent — simple reorder
        moveBlock(pageId, draggedId, insertionIdx, parentBlockId);
      } else {
        // Cross-tree move — extract from old position, insert here
        usePageStore.getState().moveBlockAcrossTree(
          pageId,
          draggedId,
          parentBlockId,
          insertionIdx,
        );
      }

      setDraggedBlockId(null);
    },
    [block.id, blocks, moveBlock, pageId, parentBlockId, setDraggedBlockId],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedBlockId(null);
    setDropPosition(null);
  }, [setDraggedBlockId]);

  const isDragged = draggedBlockId === block.id;

  return (
    <div // NOSONAR - drag/drop wrapper cannot be a native interactive element due nested contentEditable controls
      className={`group/block relative rounded-md transition-colors transition-opacity ${isHighlighted ? "bg-[var(--color-surface-secondary)]" : "hover:bg-[var(--color-surface-secondary)]"} ${isDragged ? "opacity-40" : ""}`}
      onContextMenu={(e) => onContextMenu(e, block.id)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <button
        type="button"
        draggable
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
          className={`absolute left-0 right-0 h-0.5 bg-[var(--color-accent)] rounded-full pointer-events-none z-10 ${dropPosition === "above" ? "-top-px" : "-bottom-px"}`}
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
  onContextMenu: (e: React.MouseEvent, blockId: string) => void;
}

const EditableBlockBase: React.FC<EditableBlockProps> = ({
  pageId,
  block,
  parentBlockId = null,
  numberedIndex,
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

    return (
      <BlockTree
        blocks={block.children}
        pageId={pageId}
        parentBlockType={block.type}
        parentBlockId={block.id}
        highlightedRootBlockId={isHighlighted ? block.id : null}
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
  ]);

  return (
    <div data-block-id={block.id} ref={refCb} className="-mx-1 rounded-md px-1">
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
