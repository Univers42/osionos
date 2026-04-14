import React, { useCallback, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  CopyPlus,
  PlusSquare,
  Trash2,
} from "lucide-react";
import type { Block } from "@/entities/block";
import {
  BLOCK_TRANSFORM_OPTIONS,
  changeBlockTypeInTree,
  deleteBlockInTree,
  duplicateBlockInTree,
  findBlockLocation,
  insertBlockRelative,
  moveBlockInTree,
  type BlockContextMenuSection,
  type BlockContextMenuState,
} from "./blockContextMenu.helpers";

interface UseBlockContextMenuOptions {
  pageId: string;
  content: Block[];
  updatePageContent: (pageId: string, blocks: Block[]) => void;
  focusBlock: (blockId: string, cursorEnd?: boolean) => void;
}

interface OperationResult {
  blocks: Block[];
  focusBlockId?: string;
  focusAtEnd?: boolean;
}

export function useBlockContextMenu({
  pageId,
  content,
  updatePageContent,
  focusBlock,
}: Readonly<UseBlockContextMenuOptions>) {
  const [contextMenu, setContextMenu] = useState<BlockContextMenuState | null>(
    null,
  );

  const blockLocation = useMemo(() => {
    if (!contextMenu) return null;
    return findBlockLocation(content, contextMenu.blockId);
  }, [content, contextMenu]);

  const activeContextMenu = useMemo(() => {
    if (!contextMenu || !blockLocation) return null;
    return contextMenu;
  }, [blockLocation, contextMenu]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const openContextMenu = useCallback(
    (event: React.MouseEvent, blockId: string) => {
      event.preventDefault();
      setContextMenu({
        blockId,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [],
  );

  const applyOperation = useCallback(
    (operation: OperationResult) => {
      updatePageContent(pageId, operation.blocks);
      closeContextMenu();
      if (operation.focusBlockId) {
        focusBlock(operation.focusBlockId, operation.focusAtEnd);
      }
    },
    [closeContextMenu, focusBlock, pageId, updatePageContent],
  );

  const handleInsert = useCallback(
    (position: "before" | "after") => {
      if (!contextMenu) return;

      const newBlock: Block = {
        id: crypto.randomUUID(),
        type: "paragraph",
        content: "",
      };

      applyOperation(
        insertBlockRelative(content, contextMenu.blockId, newBlock, position),
      );
    },
    [applyOperation, content, contextMenu],
  );

  const handleDuplicate = useCallback(() => {
    if (!contextMenu) return;
    applyOperation(duplicateBlockInTree(content, contextMenu.blockId));
  }, [applyOperation, content, contextMenu]);

  const handleDelete = useCallback(() => {
    if (!contextMenu) return;
    applyOperation(deleteBlockInTree(content, contextMenu.blockId));
  }, [applyOperation, content, contextMenu]);

  const handleMove = useCallback(
    (direction: "up" | "down") => {
      if (!contextMenu) return;
      applyOperation(moveBlockInTree(content, contextMenu.blockId, direction));
    },
    [applyOperation, content, contextMenu],
  );

  const handleChangeType = useCallback(
    (nextType: Block["type"]) => {
      if (!contextMenu) return;
      applyOperation(
        changeBlockTypeInTree(content, contextMenu.blockId, nextType),
      );
    },
    [applyOperation, content, contextMenu],
  );

  const handleCopyText = useCallback(() => {
    if (!blockLocation?.block.content.trim()) return;
    void navigator.clipboard?.writeText(blockLocation.block.content);
    closeContextMenu();
  }, [blockLocation, closeContextMenu]);

  const contextMenuSections = useMemo<BlockContextMenuSection[]>(() => {
    if (!blockLocation) return [];

    const sections: BlockContextMenuSection[] = [
      {
        label: "Insert",
        items: [
          {
            icon: <PlusSquare size={15} />,
            label: "Insert text above",
            onClick: () => handleInsert("before"),
          },
          {
            icon: <PlusSquare size={15} />,
            label: "Insert text below",
            onClick: () => handleInsert("after"),
          },
        ],
      },
    ];

    const moveItems = [];
    if (blockLocation.index > 0) {
      moveItems.push({
        icon: <ArrowUp size={15} />,
        label: "Move up",
        onClick: () => handleMove("up"),
      });
    }
    if (blockLocation.index < blockLocation.siblings.length - 1) {
      moveItems.push({
        icon: <ArrowDown size={15} />,
        label: "Move down",
        onClick: () => handleMove("down"),
      });
    }
    if (moveItems.length > 0) {
      sections.push({ label: "Move", items: moveItems });
    }

    sections.push({
      label: "Turn into",
      items: BLOCK_TRANSFORM_OPTIONS.map((option) => ({
        icon: option.icon,
        label: option.label,
        active: option.type === blockLocation.block.type,
        onClick: () => handleChangeType(option.type),
      })),
    });

    const actionItems = [];
    if (blockLocation.block.content.trim()) {
      actionItems.push({
        icon: <Copy size={15} />,
        label: "Copy text",
        onClick: handleCopyText,
      });
    }
    actionItems.push({
      icon: <CopyPlus size={15} />,
      label: "Duplicate",
      onClick: handleDuplicate,
    });
    sections.push({ label: "Actions", items: actionItems });

    sections.push({
      items: [
        {
          icon: <Trash2 size={15} />,
          label: "Delete",
          danger: true,
          onClick: handleDelete,
        },
      ],
    });

    return sections;
  }, [
    blockLocation,
    handleChangeType,
    handleCopyText,
    handleDelete,
    handleDuplicate,
    handleInsert,
    handleMove,
  ]);

  return {
    contextMenu: activeContextMenu,
    contextMenuSections,
    openContextMenu,
    closeContextMenu,
  };
}
