import { useCallback, useMemo, useState } from "react";
import { findBlockInTree, isParentable, type Block } from "@/entities/block";
import { usePageStore } from "@/store/usePageStore";

export const BLOCK_DRAG_TYPE = "application/x-playground-block-id";
export const BLOCK_INDENT_PX = 28;

export interface DropTarget {
  referenceBlockId: string;
  position: "before" | "after";
  indentLevel: number;
  targetParentId: string | null;
}

interface VisibleBlockMeta {
  block: Block;
  parentId: string | null;
  level: number;
  start: number;
  end: number;
}

interface BlockLocation {
  block: Block;
  index: number;
  parentId: string | null;
}

function collectDescendantIds(block: Block): Set<string> {
  const ids = new Set<string>();

  const visit = (node: Block) => {
    ids.add(node.id);
    node.children?.forEach(visit);
  };

  visit(block);
  return ids;
}

function findBlockLocation(
  blocks: Block[],
  blockId: string,
  parentId: string | null = null,
): BlockLocation | null {
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.id === blockId) {
      return { block, index, parentId };
    }

    if (block.children?.length) {
      const nested = findBlockLocation(block.children, blockId, block.id);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

function buildVisibleBlockMeta(blocks: Block[]): VisibleBlockMeta[] {
  const items: VisibleBlockMeta[] = [];

  const visit = (
    list: Block[],
    parentId: string | null,
    level: number,
  ) => {
    for (const block of list) {
      const item: VisibleBlockMeta = {
        block,
        parentId,
        level,
        start: items.length,
        end: items.length,
      };

      items.push(item);

      if (block.children?.length && !(block.type === "toggle" && block.collapsed)) {
        visit(block.children, block.id, level + 1);
      }

      item.end = items.length - 1;
    }
  };

  visit(blocks, null, 0);
  return items;
}

function resolveIndentLevel(
  requestedLevel: number,
  insertionPoint: number,
  visibleBlocks: VisibleBlockMeta[],
  blockedIds: Set<string>,
): { indentLevel: number; targetParentId: string | null } {
  for (let indentLevel = requestedLevel; indentLevel > 0; indentLevel -= 1) {
    for (let index = insertionPoint - 1; index >= 0; index -= 1) {
      const candidate = visibleBlocks[index];
      if (blockedIds.has(candidate.block.id)) {
        continue;
      }

      if (
        candidate.level === indentLevel - 1 &&
        isParentable(candidate.block.type)
      ) {
        return { indentLevel, targetParentId: candidate.block.id };
      }
    }
  }

  return { indentLevel: 0, targetParentId: null };
}

function getSiblingList(blocks: Block[], parentId: string | null): Block[] {
  if (!parentId) {
    return blocks;
  }

  return findBlockInTree(blocks, parentId)?.children ?? [];
}

function getTargetIndex(
  blocks: Block[],
  targetParentId: string | null,
  insertionPoint: number,
  visibleBlocks: VisibleBlockMeta[],
  sourceLocation: BlockLocation,
): number {
  const siblings = getSiblingList(blocks, targetParentId);
  const visibleById = new Map(visibleBlocks.map((item) => [item.block.id, item]));
  let targetIndex = siblings.filter((sibling) => {
    const siblingMeta = visibleById.get(sibling.id);
    return siblingMeta ? siblingMeta.end < insertionPoint : false;
  }).length;

  if (sourceLocation.parentId === targetParentId && sourceLocation.index < targetIndex) {
    targetIndex -= 1;
  }

  return Math.max(0, targetIndex);
}

export interface UseBlockDragDropReturn {
  draggedBlockId: string | null;
  dropTarget: DropTarget | null;
  handleDragStart: (blockId: string) => void;
  handleDragOver: (e: React.DragEvent, blockId: string) => void;
  handleDragEnd: () => void;
  handleDrop: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
}

export function useBlockDragDrop(
  pageId: string,
  blocks: Block[],
): UseBlockDragDropReturn {
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const moveBlock = usePageStore((s) => s.moveBlock);
  const moveBlockAcrossTree = usePageStore((s) => s.moveBlockAcrossTree);

  const visibleBlocks = useMemo(() => buildVisibleBlockMeta(blocks), [blocks]);

  const handleDragStart = useCallback((blockId: string) => {
    setDraggedBlockId(blockId);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, blockId: string) => {
      if (!e.dataTransfer.types.includes(BLOCK_DRAG_TYPE) || !draggedBlockId) {
        return;
      }

      // Always prevent default to allow drop
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";

      const sourceLocation = findBlockLocation(blocks, draggedBlockId);
      const referenceBlock = visibleBlocks.find((item) => item.block.id === blockId);
      if (!sourceLocation || !referenceBlock) {
        setDropTarget(null);
        return;
      }

      const blockedIds = collectDescendantIds(sourceLocation.block);
      if (blockedIds.has(blockId)) {
        setDropTarget(null);
        return;
      }

      const blockElement =
        (e.currentTarget as HTMLElement).closest<HTMLElement>(
          `[data-draggable-block-id="${blockId}"]`,
        ) ?? (e.currentTarget as HTMLElement);
      const rect = blockElement.getBoundingClientRect();
      const position = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
      const insertionPoint =
        position === "before" ? referenceBlock.start : referenceBlock.end + 1;
      const previousVisible = visibleBlocks[insertionPoint - 1] ?? null;
      
      let maxAllowedLevel = 0;
      if (previousVisible) {
        const canNestUnder =
          isParentable(previousVisible.block.type) &&
          !blockedIds.has(previousVisible.block.id);
        maxAllowedLevel = previousVisible.level + (canNestUnder ? 1 : 0);
      }
      const editorContainer = blockElement.closest("[data-page-editor]");
      const editorLeft =
        editorContainer?.getBoundingClientRect().left ?? rect.left;
      const offsetFromEditorLeft = e.clientX - editorLeft;
      const requestedLevel = Math.max(
        0,
        Math.min(Math.floor(offsetFromEditorLeft / BLOCK_INDENT_PX), maxAllowedLevel),
      );
      const resolvedTarget = resolveIndentLevel(
        requestedLevel,
        insertionPoint,
        visibleBlocks,
        blockedIds,
      );

      setDropTarget({
        referenceBlockId: blockId,
        position,
        indentLevel: resolvedTarget.indentLevel,
        targetParentId: resolvedTarget.targetParentId,
      });
    },
    [blocks, draggedBlockId, visibleBlocks],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedBlockId(null);
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();

      if (!draggedBlockId || !dropTarget) {
        setDraggedBlockId(null);
        setDropTarget(null);
        return;
      }

      const sourceLocation = findBlockLocation(blocks, draggedBlockId);
      const referenceBlock = visibleBlocks.find(
        (item) => item.block.id === dropTarget.referenceBlockId,
      );

      if (!sourceLocation || !referenceBlock) {
        setDraggedBlockId(null);
        setDropTarget(null);
        return;
      }

      const insertionPoint =
        dropTarget.position === "before"
          ? referenceBlock.start
          : referenceBlock.end + 1;
      const targetIndex = getTargetIndex(
        blocks,
        dropTarget.targetParentId,
        insertionPoint,
        visibleBlocks,
        sourceLocation,
      );

      if (sourceLocation.parentId === dropTarget.targetParentId) {
        moveBlock(pageId, draggedBlockId, targetIndex, dropTarget.targetParentId);
      } else {
        moveBlockAcrossTree(
          pageId,
          draggedBlockId,
          dropTarget.targetParentId,
          targetIndex,
        );
      }

      setDraggedBlockId(null);
      setDropTarget(null);
    },
    [blocks, draggedBlockId, dropTarget, moveBlock, moveBlockAcrossTree, pageId, visibleBlocks],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const relatedTarget = e.relatedTarget as Node | null;
    const editorContainer = (e.currentTarget as HTMLElement).closest(
      "[data-page-editor]",
    );
    if (!relatedTarget || !editorContainer?.contains(relatedTarget)) {
      setDropTarget(null);
    }
  }, []);

  return {
    draggedBlockId,
    dropTarget,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDrop,
    handleDragLeave,
  };
}
