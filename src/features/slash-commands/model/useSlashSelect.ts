/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useSlashSelect.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 19:04:14 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/09 20:57:59 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback } from "react";

import {
  createLinkBlock,
  createMediaBlock,
  isLinkBlockType,
  type Block,
  type BlockType,
  type LayoutMode,
  type LinkBlockType,
  type MediaBlockType,
  findBlockInTree,
} from "@/entities/block";
import { createDefaultTableBlock } from "@/entities/block/model/tableBlocks";
import { stripSlashQuery as stripSlashQueryText } from "./slashQueryText";
import type { SlashMenuState } from "@/features/block-editor/model/playgroundBlockEditor.helpers";
import { createViewShowcaseLayoutContent } from "@/widgets/database-view/model/databaseViewShowcase";
import { createProfileHeaderContent, PROFILE_HEADER_COVER } from "./profileHeaderPreset";

interface UseSlashSelectOptions {
  pageId: string;
  slashMenu: SlashMenuState | null;
  setSlashMenu: (menu: SlashMenuState | null) => void;
  updateBlock: (
    pageId: string,
    blockId: string,
    updates: Partial<Block>,
  ) => void;
  changeBlockType: (
    pageId: string,
    blockId: string,
    newType: BlockType,
  ) => void;
  insertBlock: (pageId: string, afterBlockId: string, block: Block) => void;
  createInlineDatabase: (
    name?: string,
  ) => { databaseId: string; viewId: string } | null;
  createPageInPrivateWorkspace: (
    title?: string,
    options?: { icon?: string; content?: Block[]; open?: boolean; cover?: string },
  ) => Promise<{ id: string } | null>;
  createDatabasePageInPrivateWorkspace: () => Promise<{ id: string } | null>;
  focusBlock: (blockId: string, end?: boolean) => void;
}

export function stripSlashQuery(content: string, anchor?: number): string {
  return stripSlashQueryText(content, anchor);
}

function appendInternalPageLink(content: string, pageId: string): string {
  const trimmed = content.trimEnd();
  const separator = trimmed.length > 0 ? " " : "";
  return `${trimmed}${separator}[[page:${pageId}]] `;
}

function appendInlineText(content: string, insertText: string, anchor?: number): string {
  const cleanContent = stripSlashQuery(content, anchor);
  const separator = cleanContent.length > 0 && cleanContent === cleanContent.trimEnd() ? " " : "";
  return `${cleanContent}${separator}${insertText}`;
}

export function useSlashSelect({
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
}: UseSlashSelectOptions) {
  const applyBlockSelection = useCallback(
    (
      selectedType: BlockType,
      content: Block[],
      options?: {
        calloutIcon?: string;
        placeholderText?: string;
        layoutMode?: LayoutMode;
        layoutPreset?: "profile_header";
      },
    ) => {
      if (!slashMenu) return;
      const { blockId } = slashMenu;

      setSlashMenu(null);

      const block = findBlockInTree(content, blockId);
      const cleanContent = stripSlashQuery(block?.content ?? "", slashMenu.anchor);
      if (block) {
        updateBlock(pageId, blockId, {
          content: cleanContent,
          placeholderText: options?.placeholderText,
        });
      }

      if (selectedType === "database_inline") {
        const result = createInlineDatabase();
        if (result) {
          const newBlock: Block = {
            id: crypto.randomUUID(),
            type: "database_inline",
            content: "",
            databaseId: result.databaseId,
            viewId: result.viewId,
          };
          insertBlock(pageId, blockId, newBlock);
          focusBlock(newBlock.id);
        }
        return;
      }

      if (selectedType === "database_full_page") {
        void (async () => {
          const createdPage = await createDatabasePageInPrivateWorkspace();
          const nextContent = createdPage
            ? appendInternalPageLink(cleanContent, createdPage.id)
            : cleanContent;

          updateBlock(pageId, blockId, {
            content: nextContent,
            placeholderText: undefined,
          });
          if (!createdPage) {
            focusBlock(blockId, true);
          }
        })();
        return;
      }

      if (selectedType === "table_block") {
        const newBlock = createDefaultTableBlock();
        insertBlock(pageId, blockId, newBlock);
        return;
      }

      if (selectedType === "column_list") {
        const newBlock: Block = {
          id: crypto.randomUUID(),
          type: "column_list",
          content: "",
          children: [
            {
              id: crypto.randomUUID(),
              type: "column",
              content: "",
              widthRatio: 0.5,
              children: [{ id: crypto.randomUUID(), type: "paragraph", content: "" }],
            },
            {
              id: crypto.randomUUID(),
              type: "column",
              content: "",
              widthRatio: 0.5,
              children: [{ id: crypto.randomUUID(), type: "paragraph", content: "" }],
            },
          ],
        };
        insertBlock(pageId, blockId, newBlock);
        focusBlock(newBlock.children?.[0]?.children?.[0]?.id ?? newBlock.id);
        return;
      }

      if (selectedType === "layout") {
        if (options?.layoutPreset === "profile_header") {
          void (async () => {
            const createdPage = await createPageInPrivateWorkspace("Profile header", {
              icon: "icon:id-card",
              cover: PROFILE_HEADER_COVER,
              content: createProfileHeaderContent(),
              open: true,
            });
            const nextContent = createdPage
              ? appendInternalPageLink(cleanContent, createdPage.id)
              : cleanContent;

            updateBlock(pageId, blockId, {
              content: nextContent,
              placeholderText: undefined,
            });
            if (!createdPage) focusBlock(blockId, true);
          })();
          return;
        }
        if (options?.layoutMode === "full_page") {
          void (async () => {
            const createdPage = await createPageInPrivateWorkspace("Layout dashboard", {
              icon: "icon:layout-dashboard",
              content: createViewShowcaseLayoutContent("full_page"),
              open: true,
            });
            const nextContent = createdPage
              ? appendInternalPageLink(cleanContent, createdPage.id)
              : cleanContent;

            updateBlock(pageId, blockId, {
              content: nextContent,
              placeholderText: undefined,
            });
            if (!createdPage) focusBlock(blockId, true);
          })();
          return;
        }

        changeBlockType(pageId, blockId, selectedType);
        updateBlock(pageId, blockId, {
          content: "",
          layoutMode: options?.layoutMode ?? "inline",
          layoutConfig: {
            columns: 12,
            rows: 6,
            gap: 16,
            rowHeight: 120,
            wrap: true,
            autoArrange: false,
            snapToGrid: true,
            guideVisibility: "auto",
            preview: false,
            theme: "default",
          },
          layoutCells: [],
          placeholderText: undefined,
        });
        focusBlock(blockId);
        return;
      }

      changeBlockType(pageId, blockId, selectedType);

      if (selectedType === "callout") {
        updateBlock(pageId, blockId, { color: options?.calloutIcon || "💡" });
      }

      if (selectedType === "code") {
        updateBlock(pageId, blockId, { language: "typescript" });
      }

      if (selectedType === "equation") {
        updateBlock(pageId, blockId, { content: cleanContent || "E = mc^2" });
      }

      // A new type re-mounts the editable (a list marker, a toggle wrapper): refocus it on the
      // next frame, at the START: placing it at the end left "/quote" in the converted block's
      // DOM (blockCreation.spec "pressing Enter on /quote" failed that way on 2026-10-13).
      focusBlock(blockId);
    },
    [
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
    ],
  );

  const handleSlashBlockSelect = useCallback(
    (selectedType: BlockType, content: Block[], calloutIcon?: string, layoutMode?: LayoutMode, layoutPreset?: "profile_header") => {
      applyBlockSelection(selectedType, content, { calloutIcon, layoutMode, layoutPreset });
    },
    [applyBlockSelection],
  );

  const handleSlashTurnIntoSelect = useCallback(
    (
      selectedType: BlockType,
      content: Block[],
      options?: {
        calloutIcon?: string;
        placeholderText?: string;
        layoutMode?: LayoutMode;
      },
    ) => {
      applyBlockSelection(selectedType, content, options);
    },
    [applyBlockSelection],
  );

  const handleSlashMediaSelect = useCallback(
    (mediaType: MediaBlockType | LinkBlockType, asset: string, content: Block[], onTarget?: (blockId: string) => void) => {
      if (!slashMenu) return;
      const { blockId } = slashMenu;

      setSlashMenu(null);

      const block = findBlockInTree(content, blockId);
      const cleanContent = stripSlashQuery(block?.content ?? "", slashMenu.anchor);

      if (block) {
        updateBlock(pageId, blockId, {
          content: cleanContent,
          placeholderText: undefined,
        });
      }

      if (!block || cleanContent.trim().length > 0) {
        const newBlock = isLinkBlockType(mediaType) ? createLinkBlock(mediaType, asset) : createMediaBlock(mediaType, asset);
        insertBlock(pageId, blockId, newBlock);
        onTarget?.(newBlock.id);
        focusBlock(newBlock.id);
        return;
      }

      changeBlockType(pageId, blockId, mediaType);
      updateBlock(pageId, blockId, isLinkBlockType(mediaType)
        ? { content: asset, placeholderText: undefined }
        : { content: "", asset, placeholderText: undefined });
      onTarget?.(blockId);
      focusBlock(blockId);
    },
    [
      pageId,
      slashMenu,
      setSlashMenu,
      updateBlock,
      changeBlockType,
      insertBlock,
      focusBlock,
    ],
  );

  const handleSlashDatabaseViewSelect = useCallback(
    (databaseId: string, viewId: string, content: Block[]) => {
      if (!slashMenu) return;
      const { blockId } = slashMenu;

      setSlashMenu(null);

      const block = findBlockInTree(content, blockId);
      const cleanContent = stripSlashQuery(block?.content ?? "", slashMenu.anchor);

      if (!block || cleanContent.trim().length > 0) {
        if (block) {
          updateBlock(pageId, blockId, {
            content: cleanContent,
            placeholderText: undefined,
          });
        }
        const newBlock: Block = {
          id: crypto.randomUUID(),
          type: "database_inline",
          content: "",
          databaseId,
          viewId,
        };
        insertBlock(pageId, blockId, newBlock);
        focusBlock(newBlock.id);
        return;
      }

      changeBlockType(pageId, blockId, "database_inline");
      updateBlock(pageId, blockId, {
        content: "",
        databaseId,
        viewId,
        placeholderText: undefined,
      });
      focusBlock(blockId);
    },
    [
      pageId,
      slashMenu,
      setSlashMenu,
      updateBlock,
      changeBlockType,
      insertBlock,
      focusBlock,
    ],
  );

  const handleSlashCreatePageSelect = useCallback(
    async (content: Block[]) => {
      if (!slashMenu) return;
      const { blockId } = slashMenu;

      setSlashMenu(null);

      const block = findBlockInTree(content, blockId);
      if (!block) return;

      const cleanContent = stripSlashQuery(block.content ?? "", slashMenu.anchor);
      const createdPage = await createPageInPrivateWorkspace();
      const nextContent = createdPage
        ? appendInternalPageLink(cleanContent, createdPage.id)
        : cleanContent;

      updateBlock(pageId, blockId, {
        content: nextContent,
        placeholderText: undefined,
      });
      focusBlock(blockId, true);
    },
    [
      slashMenu,
      setSlashMenu,
      createPageInPrivateWorkspace,
      updateBlock,
      pageId,
      focusBlock,
    ],
  );

  const handleSlashInlineSelect = useCallback(
    (insertText: string, content: Block[]) => {
      if (!slashMenu) return;
      const { blockId } = slashMenu;
      setSlashMenu(null);

      const block = findBlockInTree(content, blockId);
      if (!block) return;

      const nextContent = appendInlineText(block.content ?? "", insertText, slashMenu.anchor);
      updateBlock(pageId, blockId, {
        content: nextContent,
        placeholderText: undefined,
      });
      focusBlock(blockId, true);
    },
    [pageId, setSlashMenu, slashMenu, updateBlock, focusBlock],
  );

  return {
    handleSlashBlockSelect,
    handleSlashTurnIntoSelect,
    handleSlashMediaSelect,
    handleSlashDatabaseViewSelect,
    handleSlashCreatePageSelect,
    handleSlashInlineSelect,
  };
}
