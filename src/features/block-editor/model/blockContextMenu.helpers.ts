import type { ReactNode } from "react";
import type { Block, BlockType } from "@/entities/block";
import { COLLECTION_SLASH_ITEMS } from "@/shared/lib/markengine/uiCollectionAssets";

export interface BlockContextMenuState {
  blockId: string;
  x: number;
  y: number;
}

export interface BlockLocation {
  block: Block;
  siblings: Block[];
  index: number;
  parentId: string | null;
}

export interface BlockContextMenuItem {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}

export interface BlockContextMenuSection {
  label?: string;
  items: BlockContextMenuItem[];
}

export interface BlockTransformOption {
  type: BlockType;
  label: string;
  icon: ReactNode;
}

const CONTEXT_MENU_TRANSFORM_TYPES = new Set<BlockType>([
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  "heading_4",
  "heading_5",
  "heading_6",
  "bulleted_list",
  "numbered_list",
  "to_do",
  "toggle",
  "quote",
  "code",
  "callout",
  "divider",
]);

export const BLOCK_TRANSFORM_OPTIONS: readonly BlockTransformOption[] =
  COLLECTION_SLASH_ITEMS.filter((item) =>
    CONTEXT_MENU_TRANSFORM_TYPES.has(item.type),
  ).map((item) => ({
    type: item.type,
    label: item.label,
    icon: item.icon,
  }));

export function cloneBlock(block: Block, regenerateIds = false): Block {
  const nextId = regenerateIds ? crypto.randomUUID() : block.id;
  return {
    ...block,
    id: nextId,
    children: block.children?.map((child) => cloneBlock(child, regenerateIds)),
  };
}

export function findBlockLocation(
  blocks: Block[],
  blockId: string,
  parentId: string | null = null,
): BlockLocation | null {
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.id === blockId) {
      return { block, siblings: blocks, index, parentId };
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

export function insertBlockRelative(
  blocks: Block[],
  targetId: string,
  newBlock: Block,
  position: "before" | "after",
): { blocks: Block[]; focusBlockId: string; focusAtEnd?: boolean } {
  const nextBlocks = blocks.map((block) => cloneBlock(block));
  const location = findBlockLocation(nextBlocks, targetId);

  if (!location) {
    nextBlocks.push(newBlock);
    return { blocks: nextBlocks, focusBlockId: newBlock.id };
  }

  const insertionIndex =
    position === "before" ? location.index : location.index + 1;
  location.siblings.splice(insertionIndex, 0, newBlock);

  return { blocks: nextBlocks, focusBlockId: newBlock.id };
}

export function duplicateBlockInTree(
  blocks: Block[],
  blockId: string,
): { blocks: Block[]; focusBlockId?: string } {
  const nextBlocks = blocks.map((block) => cloneBlock(block));
  const location = findBlockLocation(nextBlocks, blockId);

  if (!location) {
    return { blocks: nextBlocks };
  }

  const duplicate = cloneBlock(location.block, true);
  location.siblings.splice(location.index + 1, 0, duplicate);

  return { blocks: nextBlocks, focusBlockId: duplicate.id };
}

export function deleteBlockInTree(
  blocks: Block[],
  blockId: string,
): { blocks: Block[]; focusBlockId?: string; focusAtEnd?: boolean } {
  const nextBlocks = blocks.map((block) => cloneBlock(block));
  const location = findBlockLocation(nextBlocks, blockId);

  if (!location) {
    return { blocks: nextBlocks };
  }

  const prevSibling =
    location.index > 0 ? location.siblings[location.index - 1] : null;
  const nextSibling =
    location.index < location.siblings.length - 1
      ? location.siblings[location.index + 1]
      : null;

  location.siblings.splice(location.index, 1);

  return {
    blocks: nextBlocks,
    focusBlockId: nextSibling?.id ?? prevSibling?.id,
    focusAtEnd: !nextSibling && Boolean(prevSibling),
  };
}

export function moveBlockInTree(
  blocks: Block[],
  blockId: string,
  direction: "up" | "down",
): { blocks: Block[]; focusBlockId?: string } {
  const nextBlocks = blocks.map((block) => cloneBlock(block));
  const location = findBlockLocation(nextBlocks, blockId);

  if (!location) {
    return { blocks: nextBlocks };
  }

  const targetIndex =
    direction === "up" ? location.index - 1 : location.index + 1;
  if (targetIndex < 0 || targetIndex >= location.siblings.length) {
    return { blocks: nextBlocks, focusBlockId: location.block.id };
  }

  const [moved] = location.siblings.splice(location.index, 1);
  location.siblings.splice(targetIndex, 0, moved);

  return { blocks: nextBlocks, focusBlockId: moved.id };
}

function normalizeBlockForType(block: Block, nextType: BlockType): Block {
  const base: Block = {
    ...block,
    type: nextType,
  };

  switch (nextType) {
    case "to_do":
      return { ...base, checked: Boolean(block.checked) };
    case "callout":
      return {
        ...base,
        color: typeof block.color === "string" ? block.color : "💡",
      };
    case "code":
      return {
        ...base,
        language:
          typeof block.language === "string" && block.language.trim().length > 0
            ? block.language
            : "typescript",
      };
    case "divider":
      return { ...base, content: "" };
    default:
      return base;
  }
}

export function changeBlockTypeInTree(
  blocks: Block[],
  blockId: string,
  nextType: BlockType,
): { blocks: Block[]; focusBlockId?: string } {
  const transform = (list: Block[]): Block[] =>
    list.map((block) => ({
      ...(block.id === blockId
        ? normalizeBlockForType(block, nextType)
        : block),
      children: block.children ? transform(block.children) : undefined,
    }));

  return {
    blocks: transform(blocks),
    focusBlockId: blockId,
  };
}
