/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PlaygroundPageEditor.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/05 01:31:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo, useCallback, useState } from "react";
import { Plus } from "lucide-react";

import { SlashCommandMenu } from "@src/components/blocks/SlashCommandMenu";
import type { Block } from "@src/types/database";

import { usePageStore } from "../store/usePageStore";
import { usePlaygroundBlockEditor } from "../hooks/usePlaygroundBlockEditor";
import { BlockEditor } from "./BlockEditor";

interface PlaygroundPageEditorProps {
  pageId: string;
}

type DropPosition = "above" | "below" | null;
const DND_TYPE = "application/x-playground-block-id";

/** Editable block-based page editor for the playground. */
export const PlaygroundPageEditor: React.FC<PlaygroundPageEditorProps> = ({
  pageId,
}) => {
  const page = usePageStore((s) => s.pageById(pageId));
  const deleteBlock = usePageStore((s) => s.deleteBlock);
  const moveBlock = usePageStore((s) => s.moveBlock);
  const blocks = useMemo(() => page?.content ?? [], [page?.content]);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);

  const {
    slashMenu,
    setSlashMenu,
    handleBlockChange,
    handleKeyDown,
    handleSlashSelect,
    handleAddBlock,
    handleInitBlock,
    registerBlockRef,
  } = usePlaygroundBlockEditor(pageId);

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
        moveBlock={moveBlock}
        draggedBlockId={draggedBlockId}
        setDraggedBlockId={setDraggedBlockId}
        onChange={handleBlockChange}
        onKeyDown={handleKeyDown}
        onDeleteBlock={(blockId: string) => deleteBlock(pageId, blockId)}
        registerRef={registerBlockRef}
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
          position={slashMenu.position}
          filter={slashMenu.filter}
          onSelect={(item) => handleSlashSelect(item.type, blocks, item.calloutIcon)}
          onClose={() => setSlashMenu(null)}
        />
      )}
    </div>
  );
};

interface BlockTreeProps {
  blocks: Block[];
  pageId: string;
  isRoot?: boolean;
  parentBlockId?: string | null;
  moveBlock: (
    pageId: string,
    blockId: string,
    targetIndex: number,
    parentBlockId?: string | null,
  ) => void;
  draggedBlockId: string | null;
  setDraggedBlockId: (id: string | null) => void;
  onChange: (blockId: string, text: string, blocks: Block[]) => void;
  onKeyDown: (e: React.KeyboardEvent, blockId: string, blocks: Block[]) => void;
  onDeleteBlock: (blockId: string) => void;
  registerRef: (blockId: string, el: HTMLElement | null) => void;
}

const BlockTree: React.FC<BlockTreeProps> = ({
  blocks,
  pageId,
  isRoot = false,
  parentBlockId = null,
  moveBlock,
  draggedBlockId,
  setDraggedBlockId,
  onChange,
  onKeyDown,
  onDeleteBlock,
  registerRef,
}) => {
  let numberedCounter = 0;

  return (
    <div className={isRoot ? "" : "ml-7"}>
      {blocks.map((block) => {
        const numberedIndex =
          block.type === "numbered_list" ? ++numberedCounter : 0;
        if (block.type !== "numbered_list") numberedCounter = 0;

        return (
          <div key={block.id}>
            <DraggablePlaygroundBlock
              block={block}
              blocks={blocks}
              pageId={pageId}
              parentBlockId={parentBlockId}
              moveBlock={moveBlock}
              draggedBlockId={draggedBlockId}
              setDraggedBlockId={setDraggedBlockId}
            >
              <EditableBlock
                pageId={pageId}
                block={block}
                blocks={blocks}
                numberedIndex={numberedIndex}
                onChange={onChange}
                onKeyDown={onKeyDown}
                onDeleteBlock={onDeleteBlock}
                registerRef={registerRef}
              />
            </DraggablePlaygroundBlock>

            {!!block.children?.length && (
              <BlockTree
                blocks={block.children}
                pageId={pageId}
                parentBlockId={block.id}
                moveBlock={moveBlock}
                draggedBlockId={draggedBlockId}
                setDraggedBlockId={setDraggedBlockId}
                onChange={onChange}
                onKeyDown={onKeyDown}
                onDeleteBlock={onDeleteBlock}
                registerRef={registerRef}
              />
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

      moveBlock(pageId, draggedId, insertionIdx, parentBlockId);
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
    <div
      className={`group/block relative transition-opacity ${isDragged ? "opacity-40" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <button
        type="button"
        draggable
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
  blocks: Block[];
  numberedIndex: number;
  onChange: (blockId: string, text: string, blocks: Block[]) => void;
  onKeyDown: (e: React.KeyboardEvent, blockId: string, blocks: Block[]) => void;
  onDeleteBlock: (blockId: string) => void;
  registerRef: (blockId: string, el: HTMLElement | null) => void;
}

const EditableBlock: React.FC<EditableBlockProps> = ({
  pageId,
  block,
  blocks,
  numberedIndex,
  onChange,
  onKeyDown,
  onDeleteBlock,
  registerRef,
}) => {
  const handleChange = useCallback(
    (text: string) => onChange(block.id, text, blocks),
    [block.id, blocks, onChange],
  );

  const handleKey = useCallback(
    (e: React.KeyboardEvent) => onKeyDown(e, block.id, blocks),
    [block.id, blocks, onKeyDown],
  );

  const refCb = useCallback(
    (el: HTMLDivElement | null) => registerRef(block.id, el),
    [block.id, registerRef],
  );

  return (
    <div data-block-id={block.id} ref={refCb}>
      <BlockEditor
        pageId={pageId}
        block={block}
        numberedIndex={numberedIndex}
        onChange={handleChange}
        onKeyDown={handleKey}
        onDeleteCodeBlock={() => onDeleteBlock(block.id)}
      />
    </div>
  );
};
