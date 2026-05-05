/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useBlockContextMenu.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 20:16:25 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/05 23:43:38 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  CopyPlus,
  Link,
  MessageSquare,
  MoveRight,
  Palette,
  PlusSquare,
  Presentation,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { Block } from "@/entities/block";
import {
  BLOCK_COLOR_OPTIONS,
  ensureReadableTextColor,
} from "./blockColors";
import {
  BLOCK_TRANSFORM_OPTIONS,
  changeBlockTypeInTree,
  changeBlockToColumnsInTree,
  changeBlockToToggleHeadingInTree,
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

  const handleToggleHeading = useCallback(
    (headingLevel: 1 | 2 | 3 | 4) => {
      if (!contextMenu) return;
      applyOperation(
        changeBlockToToggleHeadingInTree(
          content,
          contextMenu.blockId,
          headingLevel,
        ),
      );
    },
    [applyOperation, content, contextMenu],
  );

  const handleColumns = useCallback(
    (count: number) => {
      if (!contextMenu) return;
      applyOperation(changeBlockToColumnsInTree(content, contextMenu.blockId, count));
    },
    [applyOperation, content, contextMenu],
  );

  const handleCopyText = useCallback(() => {
    if (!blockLocation?.block.content.trim()) return;
    navigator.clipboard?.writeText(blockLocation.block.content).catch(() => undefined);
    closeContextMenu();
  }, [blockLocation, closeContextMenu]);

  const handleCopyLink = useCallback(() => {
    if (!contextMenu) return;
    const url = `${globalThis.location.origin}${globalThis.location.pathname}#block-${contextMenu.blockId}`;
    navigator.clipboard?.writeText(url).catch(() => undefined);
    closeContextMenu();
  }, [closeContextMenu, contextMenu]);

  const handleSetBlockStyle = useCallback(
    (style: Partial<Pick<Block, "textColor" | "backgroundColor">>) => {
      if (!contextMenu) return;
      const updateTree = (blocks: Block[]): Block[] =>
        blocks.map((block) => ({
          ...block,
          ...(block.id === contextMenu.blockId ? style : {}),
          children: block.children ? updateTree(block.children) : undefined,
        }));

      applyOperation({ blocks: updateTree(content), focusBlockId: contextMenu.blockId });
    },
    [applyOperation, content, contextMenu],
  );

  const handleUnavailable = useCallback(() => {
    closeContextMenu();
  }, [closeContextMenu]);

  const handleComment = useCallback(() => {
    if (!contextMenu) return;
    globalThis.dispatchEvent(
      new CustomEvent("osionos:add-page-comment", {
        detail: { pageId, blockId: contextMenu.blockId },
      }),
    );
    closeContextMenu();
  }, [closeContextMenu, contextMenu, pageId]);

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
      items: [
        {
          icon: <MoveRight size={15} />,
          label: "Turn into",
          onClick: handleUnavailable,
          subItems: BLOCK_TRANSFORM_OPTIONS.map((option) => ({
            icon: option.icon,
            label: option.label,
            active: option.type === blockLocation.block.type,
            onClick: () => handleChangeType(option.type),
          })).concat([
            {
              icon: "▸H1",
              label: "Toggle heading 1",
              active:
                blockLocation.block.type === "toggle" &&
                blockLocation.block.headingLevel === 1,
              onClick: () => handleToggleHeading(1),
            },
            {
              icon: "▸H2",
              label: "Toggle heading 2",
              active:
                blockLocation.block.type === "toggle" &&
                blockLocation.block.headingLevel === 2,
              onClick: () => handleToggleHeading(2),
            },
            {
              icon: "▸H3",
              label: "Toggle heading 3",
              active:
                blockLocation.block.type === "toggle" &&
                blockLocation.block.headingLevel === 3,
              onClick: () => handleToggleHeading(3),
            },
            {
              icon: "▸H4",
              label: "Toggle heading 4",
              active:
                blockLocation.block.type === "toggle" &&
                blockLocation.block.headingLevel === 4,
              onClick: () => handleToggleHeading(4),
            },
            {
              icon: "▥",
              label: "3 columns",
              active:
                blockLocation.block.type === "column_list" &&
                blockLocation.block.children?.length === 3,
              onClick: () => handleColumns(3),
            },
            {
              icon: "▥",
              label: "4 columns",
              active:
                blockLocation.block.type === "column_list" &&
                blockLocation.block.children?.length === 4,
              onClick: () => handleColumns(4),
            },
            {
              icon: "▥",
              label: "5 columns",
              active:
                blockLocation.block.type === "column_list" &&
                blockLocation.block.children?.length === 5,
              onClick: () => handleColumns(5),
            },
          ]),
        },
        {
          icon: <Palette size={15} />,
          label: "Color",
          onClick: handleUnavailable,
          subItems: [
            {
              icon: <span className="font-semibold text-[#b91c1c]">A</span>,
              label: "Red text",
              shortcut: "Ctrl+⇧+H",
              active: blockLocation.block.textColor === "#b91c1c",
              onClick: () => handleSetBlockStyle({ textColor: "#b91c1c" }),
            },
            {
              icon: "Text",
              label: "Text color",
              disabled: true,
              onClick: handleUnavailable,
            },
            {
              icon: "A",
              label: "Default text",
              active: !blockLocation.block.textColor,
              onClick: () => handleSetBlockStyle({ textColor: undefined }),
            },
            ...BLOCK_COLOR_OPTIONS.map((option) => ({
              icon: <span style={{ color: option.text }}>A</span>,
              label: `${option.label} text`,
              active: blockLocation.block.textColor === option.text,
              onClick: () => handleSetBlockStyle({ textColor: option.text }),
            })),
            {
              icon: "Bg",
              label: "Background color",
              disabled: true,
              onClick: handleUnavailable,
            },
            {
              icon: "□",
              label: "Default background",
              active: !blockLocation.block.backgroundColor,
              onClick: () => handleSetBlockStyle({ backgroundColor: undefined, textColor: blockLocation.block.textColor }),
            },
            ...BLOCK_COLOR_OPTIONS.map((option) => ({
              icon: <span style={{ backgroundColor: option.background }} className="h-4 w-4 rounded border border-[var(--color-line)]" />,
              label: `${option.label} background`,
              active: blockLocation.block.backgroundColor === option.background,
              onClick: () =>
                handleSetBlockStyle({
                  backgroundColor: option.background,
                  textColor: ensureReadableTextColor(
                    option.background,
                    blockLocation.block.textColor,
                  ),
                }),
            })),
          ],
        },
      ],
    });

    const actionItems = [
      ...(blockLocation.block.content.trim()
        ? [
            {
              icon: <Copy size={15} />,
              label: "Copy text",
              onClick: handleCopyText,
            },
          ]
        : []),
      {
        icon: <Link size={15} />,
        label: "Copy link to block",
        shortcut: "Alt+⇧+L",
        onClick: handleCopyLink,
      },
      {
        icon: <CopyPlus size={15} />,
        label: "Duplicate",
        shortcut: "Ctrl+D",
        onClick: handleDuplicate,
      },
      {
        icon: <MoveRight size={15} />,
        label: "Move to",
        shortcut: "Ctrl+⇧+P",
        onClick: handleUnavailable,
      },
    ];

    sections.push(
      { label: "Actions", items: actionItems },
      {
        items: [
          {
            icon: <Trash2 size={15} />,
            label: "Delete",
            shortcut: "Del",
            danger: true,
            onClick: handleDelete,
          },
        ],
      },
    );

    return [
      ...sections,
      {
        items: [
          {
            icon: <MessageSquare size={15} />,
            label: "Comment",
            shortcut: "Ctrl+⇧+M",
            onClick: handleComment,
          },
          {
            icon: <MessageSquare size={15} />,
            label: "Suggest edits",
            shortcut: "Ctrl+⇧+Alt+X",
            onClick: handleUnavailable,
          },
          {
            icon: <Presentation size={15} />,
            label: "Present from here",
            shortcut: "Ctrl+Alt+P",
            onClick: handleUnavailable,
          },
          {
            icon: <Sparkles size={15} />,
            label: "Ask AI",
            shortcut: "Ctrl+J",
            onClick: handleUnavailable,
          },
        ],
      },
    ];
  }, [
    blockLocation,
    handleChangeType,
    handleCopyText,
    handleCopyLink,
    handleDelete,
    handleDuplicate,
    handleInsert,
    handleMove,
    handleColumns,
    handleComment,
    handleSetBlockStyle,
    handleToggleHeading,
    handleUnavailable,
  ]);

  return {
    contextMenu: activeContextMenu,
    contextMenuSections,
    openContextMenu,
    closeContextMenu,
  };
}
