/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useBlockContextMenu.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 20:16:25 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/08 04:43:11 by dlesieur         ###   ########.fr       */
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
  Plus,
  PlusSquare,
  Presentation,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { Block } from "@/entities/block";
import {
  getTableColumnCount,
  normalizeTableData,
  resolveTableConfig,
} from "@/entities/block/model/tableBlocks";
import {
  BLOCK_COLOR_OPTIONS,
  ensureReadableTextColor,
} from "./blockColors";
import { useBlockColorProfileStore } from "@/shared/config/blockColorProfileStore";
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

type TableConfigUpdate = Partial<NonNullable<Block["tableConfig"]>>;

function resolveBlockTableConfig(block: Block) {
  const tableData = normalizeTableData(block.tableData);
  return resolveTableConfig(block, getTableColumnCount(tableData), tableData.length);
}

function createTableContextMenuSections(
  block: Block,
  handleUnavailable: () => void,
  handleSetTableConfig: (updates: TableConfigUpdate) => void,
): BlockContextMenuSection[] {
  if (block.type !== "table_block") return [];

  const tableConfig = resolveBlockTableConfig(block);
  const wrapEnabled = tableConfig.wrap !== false;
  const bordersEnabled = tableConfig.showBorders !== false;
  const headerRowEnabled = tableConfig.headerRow !== false;

  return [
    {
      label: "Table",
      items: [
        {
          icon: <Settings2 size={15} />,
          label: "Table settings",
          onClick: handleUnavailable,
          subItems: [
            {
              icon: "Auto",
              label: "Auto layout",
              active: tableConfig.layoutMode === "auto",
              onClick: () => handleSetTableConfig({ layoutMode: "auto" }),
            },
            {
              icon: "Fit",
              label: "Fit to width",
              active: tableConfig.layoutMode === "fit",
              onClick: () => handleSetTableConfig({ layoutMode: "fit" }),
            },
            {
              icon: "Fixed",
              label: "Fixed column widths",
              active: tableConfig.layoutMode === "fixed",
              onClick: () => handleSetTableConfig({ layoutMode: "fixed" }),
            },
            {
              icon: "Wrap",
              label: wrapEnabled ? "Wrap text" : "No text wrap",
              active: wrapEnabled,
              onClick: () => handleSetTableConfig({ wrap: !wrapEnabled }),
            },
            {
              icon: "80",
              label: "Compact columns",
              active: tableConfig.minColumnWidth === 80,
              onClick: () => handleSetTableConfig({ minColumnWidth: 80 }),
            },
            {
              icon: "120",
              label: "Standard columns",
              active: tableConfig.minColumnWidth === 120,
              onClick: () => handleSetTableConfig({ minColumnWidth: 120 }),
            },
            {
              icon: "180",
              label: "Wide columns",
              active: tableConfig.minColumnWidth === 180,
              onClick: () => handleSetTableConfig({ minColumnWidth: 180 }),
            },
            {
              icon: "Sm",
              label: "Compact padding",
              active: tableConfig.cellPadding === "compact",
              onClick: () => handleSetTableConfig({ cellPadding: "compact" }),
            },
            {
              icon: "Md",
              label: "Normal padding",
              active: tableConfig.cellPadding === "normal",
              onClick: () => handleSetTableConfig({ cellPadding: "normal" }),
            },
            {
              icon: "Lg",
              label: "Comfortable padding",
              active: tableConfig.cellPadding === "comfortable",
              onClick: () => handleSetTableConfig({ cellPadding: "comfortable" }),
            },
            {
              icon: "H",
              label: headerRowEnabled ? "Header row on" : "Header row off",
              active: headerRowEnabled,
              onClick: () => handleSetTableConfig({ headerRow: !headerRowEnabled }),
            },
            {
              icon: "1st",
              label: tableConfig.headerColumn ? "Header column on" : "Header column off",
              active: tableConfig.headerColumn === true,
              onClick: () => handleSetTableConfig({ headerColumn: !tableConfig.headerColumn }),
            },
            {
              icon: "#",
              label: bordersEnabled ? "Borders on" : "Borders off",
              active: bordersEnabled,
              onClick: () => handleSetTableConfig({ showBorders: !bordersEnabled }),
            },
            {
              icon: "Alt",
              label: tableConfig.stripedRows ? "Striped rows on" : "Striped rows off",
              active: tableConfig.stripedRows === true,
              onClick: () => handleSetTableConfig({ stripedRows: !tableConfig.stripedRows }),
            },
            {
              icon: "↔",
              label: "Reset column widths",
              onClick: () => handleSetTableConfig({ columnWidths: [], layoutMode: "auto" }),
            },
          ],
        },
      ],
    },
  ];
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
  const colorProfiles = useBlockColorProfileStore((state) => state.profiles);

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

  const handleSetTableConfig = useCallback(
    (updates: TableConfigUpdate) => {
      if (!contextMenu) return;

      const updateTree = (blocks: Block[]): Block[] =>
        blocks.map((block) => ({
          ...block,
          ...(block.id === contextMenu.blockId && block.type === "table_block"
            ? {
                tableConfig: {
                  ...resolveBlockTableConfig(block),
                  ...updates,
                },
              }
            : {}),
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

    const insertSection: BlockContextMenuSection = {
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
    };

    const moveItems: BlockContextMenuSection["items"] = [
      ...(blockLocation.index > 0
        ? [
            {
              icon: <ArrowUp size={15} />,
              label: "Move up",
              onClick: () => handleMove("up"),
            },
          ]
        : []),
      ...(blockLocation.index < blockLocation.siblings.length - 1
        ? [
            {
              icon: <ArrowDown size={15} />,
              label: "Move down",
              onClick: () => handleMove("down"),
            },
          ]
        : []),
    ];
    const moveSections: BlockContextMenuSection[] = moveItems.length > 0
      ? [{ label: "Move", items: moveItems }]
      : [];

    const transformSection: BlockContextMenuSection = {
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
              icon: <span className="font-semibold text-[var(--osio-block-tint-red-fg)]">A</span>,
              label: "Red text",
              shortcut: "Ctrl+⇧+H",
              active: blockLocation.block.textColor === "var(--osio-block-tint-red-fg)",
              onClick: () => handleSetBlockStyle({ textColor: "var(--osio-block-tint-red-fg)" }),
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
              icon: <span style={{ backgroundColor: option.background }} className="h-4 w-4 rounded border border-[var(--osio-border-default)]" />,
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
            {
              icon: <Plus size={14} />,
              label: "Create color profile",
              onClick: () => undefined,
            },
            ...(colorProfiles.length > 0
              ? [
                  {
                    icon: "Profiles",
                    label: "Saved profiles",
                    disabled: true,
                    onClick: handleUnavailable,
                  },
                  ...colorProfiles.map((profile) => ({
                    icon: (
                      <span
                        className="h-4 w-4 rounded border border-[var(--osio-border-default)]"
                        style={{ backgroundColor: profile.backgroundColor }}
                      />
                    ),
                    label: profile.name,
                    active:
                      blockLocation.block.textColor === profile.textColor &&
                      blockLocation.block.backgroundColor === profile.backgroundColor,
                    onClick: () =>
                      handleSetBlockStyle({
                        textColor: ensureReadableTextColor(profile.backgroundColor, profile.textColor),
                        backgroundColor: profile.backgroundColor,
                      }),
                  })),
                ]
              : []),
          ],
        },
      ],
    };

    const tableSections = createTableContextMenuSections(
      blockLocation.block,
      handleUnavailable,
      handleSetTableConfig,
    );

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
      {
        icon: <Settings2 size={15} />,
        label: "Component settings",
        subItems: [],
        onClick: handleUnavailable,
      },
    ];

    return [
      insertSection,
      ...moveSections,
      transformSection,
      ...tableSections,
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
    colorProfiles,
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
    handleSetTableConfig,
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
