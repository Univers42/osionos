/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePlaygroundBlockEditor.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/08 19:04:59 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState, useRef, useCallback } from "react";
import { usePageStore } from "@/store/usePageStore";
import {
  detectBlockType,
  getCalloutIconForKind,
  parseMarkdownToBlocks,
} from "@/shared/lib/markengine";
import { useSlashSelect, repositionCursor } from "@/features/slash-commands";
import {
  isHeadingType,
  isEffectivelyEmpty,
  isTodoType,
} from "@/entities/block";
import { useDatabaseStore } from "@/store/useDatabaseStore";
import type { Block } from "@/entities/block";
import {
  handleArrowUp,
  handleArrowDown,
  handleEnterKey,
  handleBackspaceKey,
} from "./playgroundBlockEditor.helpers";
import type { SlashMenuState } from "./playgroundBlockEditor.helpers";

const HEADING_SHORTCUT_RE = /^#{1,6}$/;
const NUMBERED_SHORTCUT_RE = /^\d+\.$/;

function parsePipeTable(text: string): string[][] | null {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) return null;

  const parseRow = (line: string): string[] | null => {
    if (!line.includes("|")) return null;
    const core = line.replace(/^\|/, "").replace(/\|$/, "");
    const cells = core.split("|").map((cell) => cell.trim());
    return cells.length >= 2 ? cells : null;
  };

  const header = parseRow(lines[0]);
  const separator = parseRow(lines[1]);
  if (!header || !separator || header?.length !== separator?.length)
    return null;

  const isSeparator = separator.every((cell) => /^:?-{3,}:?$/.test(cell));
  if (!isSeparator) return null;

  const bodyRows = lines
    .slice(2)
    .map(parseRow)
    .filter(
      (row): row is string[] =>
        Array.isArray(row) && row.length === header.length,
    );

  const table = [header, ...bodyRows];
  return table.length ? table : null;
}

function isListType(
  type: Block["type"],
): type is "bulleted_list" | "numbered_list" | "to_do" {
  return (
    type === "bulleted_list" || type === "numbered_list" || type === "to_do"
  );
}

function toBlockUpdates(block: Block): Partial<Block> {
  return {
    content: block.content,
    children: block.children,
    checked: block.checked,
    language: block.language,
    color: block.color,
    collapsed: block.collapsed,
    tableData: block.tableData,
    databaseId: block.databaseId,
    viewId: block.viewId,
  };
}

/** Manages block editing, slash commands, and keyboard navigation for playground pages. */
export function usePlaygroundBlockEditor(pageId: string) {
  const {
    updatePageContent,
    insertBlock,
    deleteBlock,
    changeBlockType,
    updateBlock,
    indentBlock,
    outdentBlock,
  } = usePageStore.getState();

  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  const blockRefs = useRef<Map<string, HTMLElement>>(new Map());

  /** Focus a block element after a short delay. */
  const focusBlock = useCallback((blockId: string, cursorEnd = false) => {
    setTimeout(() => {
      const el =
        blockRefs.current.get(blockId) ??
        (document.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement);
      if (!el) return;
      const editable =
        (el.querySelector("[contenteditable]") as HTMLElement) ?? el;
      editable.focus();
      if (cursorEnd && editable.childNodes.length) {
        const sel = globalThis.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editable);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }, 30);
  }, []);

  /** Get the bounding rect of the caret. */
  const getCaretRect = useCallback((): { x: number; y: number } => {
    const sel = globalThis.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.x !== 0 || rect.y !== 0) return { x: rect.x, y: rect.bottom };
    }
    return { x: 100, y: 300 };
  }, []);

  /** Handle content change — detects '/' trigger and markdown shortcuts. */
  const handleBlockChange = useCallback(
    (blockId: string, text: string, _content: Block[]) => {
      // Always persist the content first
      updateBlock(pageId, blockId, { content: text });

      const fencedCodeMatch = /^```\s*([A-Za-z0-9_+-]+)?\s*$/.exec(text);
      if (fencedCodeMatch) {
        changeBlockType(pageId, blockId, "code");
        updateBlock(pageId, blockId, {
          content: "",
          language: fencedCodeMatch[1]?.toLowerCase() || "plaintext",
        });
        repositionCursor(blockId, "");
        return;
      }

      const parsedTable = parsePipeTable(text);
      if (parsedTable) {
        changeBlockType(pageId, blockId, "table_block");
        updateBlock(pageId, blockId, { content: "", tableData: parsedTable });
        return;
      }

      // Slash menu trigger: opened when '/' is typed
      if (text.endsWith("/") && !slashMenu) {
        const pos = getCaretRect();
        setSlashMenu({ blockId, position: pos, filter: "" });
        return;
      }

      // Slash menu is open: update filter based on text after last '/'
      if (slashMenu?.blockId === blockId) {
        const slashIdx = text.lastIndexOf("/");
        if (slashIdx >= 0) {
          setSlashMenu((prev) =>
            prev ? { ...prev, filter: text.slice(slashIdx + 1) } : null,
          );
        } else {
          // User deleted the slash — close the menu
          setSlashMenu(null);
        }
        return;
      }

      // Markdown shortcut detection (only triggers when space is typed after prefix)
      if (text.endsWith(" ") || text === "---" || text === "```") {
        const detection = detectBlockType(text);
        if (detection) {
          changeBlockType(pageId, blockId, detection.type);
          updateBlock(pageId, blockId, {
            content: detection.remainingContent,
            ...(detection.type === "callout"
              ? { color: getCalloutIconForKind(detection.kind ?? "note") }
              : {}),
          });
          repositionCursor(blockId, detection.remainingContent);
        }
      }
    },
    [pageId, slashMenu, changeBlockType, updateBlock, getCaretRect],
  );

  const handleParagraphSpaceShortcut = useCallback(
    (e: React.KeyboardEvent, blockId: string, block: Block): boolean => {
      if (e.key !== " " || block.type !== "paragraph") return false;

      if (block.content === "-") {
        e.preventDefault();
        changeBlockType(pageId, blockId, "bulleted_list");
        updateBlock(pageId, blockId, { content: "" });
        focusBlock(blockId);
        return true;
      }

      if (HEADING_SHORTCUT_RE.test(block.content)) {
        e.preventDefault();
        const level = block.content.length;
        changeBlockType(pageId, blockId, `heading_${level}` as Block["type"]);
        updateBlock(pageId, blockId, { content: "" });
        focusBlock(blockId);
        return true;
      }

      if (NUMBERED_SHORTCUT_RE.test(block.content)) {
        e.preventDefault();
        changeBlockType(pageId, blockId, "numbered_list");
        updateBlock(pageId, blockId, { content: "" });
        focusBlock(blockId);
        return true;
      }

      return false;
    },
    [pageId, changeBlockType, updateBlock, focusBlock],
  );

  const handleListIndentation = useCallback(
    (e: React.KeyboardEvent, blockId: string, block: Block): boolean => {
      if (e.key !== "Tab" || !isListType(block.type)) return false;

      e.preventDefault();

      if (e.shiftKey) {
        outdentBlock(pageId, blockId);
      } else {
        indentBlock(pageId, blockId);
      }

      repositionCursor(blockId, block.content);

      return true;
    },
    [pageId, indentBlock, outdentBlock],
  );

  const handleEmptyListEnter = useCallback(
    (
      e: React.KeyboardEvent,
      blockId: string,
      block: Block,
      blockIdx: number,
      content: Block[],
      isEmpty: boolean,
    ): boolean => {
      if (
        e.key !== "Enter" ||
        e.shiftKey ||
        !isListType(block.type) ||
        !isEmpty
      ) {
        return false;
      }

      e.preventDefault();

      changeBlockType(pageId, blockId, "paragraph");
      updateBlock(pageId, blockId, { content: "" });
      focusBlock(blockId);
      repositionCursor(blockId, "");

      return true;
    },
    [pageId, changeBlockType, updateBlock, focusBlock],
  );

  const handleEmptyTodoEnter = useCallback(
    (
      e: React.KeyboardEvent,
      blockId: string,
      block: Block,
      isEmpty: boolean,
    ): boolean => {
      if (
        e.key !== "Enter" ||
        e.shiftKey ||
        !isTodoType(block.type) ||
        !isEmpty
      ) {
        return false;
      }

      e.preventDefault();
      changeBlockType(pageId, blockId, "paragraph");
      updateBlock(pageId, blockId, { content: "", checked: false });
      focusBlock(blockId);
      repositionCursor(blockId, "");

      return true;
    },
    [pageId, changeBlockType, updateBlock, focusBlock],
  );

  const handleEmptyListDelete = useCallback(
    (
      e: React.KeyboardEvent,
      blockId: string,
      block: Block,
      blockIdx: number,
      content: Block[],
      isEmpty: boolean,
    ): boolean => {
      if (e.key !== "Delete" || !isListType(block.type) || !isEmpty) {
        return false;
      }

      e.preventDefault();

      const nextBlockId =
        blockIdx < content.length - 1 ? content[blockIdx + 1].id : null;
      const prevBlockId = blockIdx > 0 ? content[blockIdx - 1].id : null;

      deleteBlock(pageId, blockId);
      if (nextBlockId) {
        focusBlock(nextBlockId);
      } else if (prevBlockId) {
        focusBlock(prevBlockId, true);
      }

      return true;
    },
    [pageId, deleteBlock, focusBlock],
  );

  const handleDividerDelete = useCallback(
    (
      e: React.KeyboardEvent,
      blockId: string,
      block: Block,
      blockIdx: number,
      content: Block[],
    ): boolean => {
      if (
        (e.key !== "Backspace" && e.key !== "Delete") ||
        block.type !== "divider"
      ) {
        return false;
      }

      e.preventDefault();
      const nextBlockId =
        blockIdx < content.length - 1 ? content[blockIdx + 1].id : null;
      const prevBlockId = blockIdx > 0 ? content[blockIdx - 1].id : null;

      deleteBlock(pageId, blockId);
      if (nextBlockId) {
        focusBlock(nextBlockId);
      } else if (prevBlockId) {
        focusBlock(prevBlockId, true);
      }
      return true;
    },
    [pageId, deleteBlock, focusBlock],
  );

  const handleEmptyBackspace = useCallback(
    (
      e: React.KeyboardEvent,
      blockId: string,
      block: Block,
      blockIdx: number,
      content: Block[],
      isEmpty: boolean,
    ): boolean => {
      if ((e.key !== "Backspace" && e.key !== "Delete") || !isEmpty)
        return false;

      if (isHeadingType(block.type)) {
        e.preventDefault();
        changeBlockType(pageId, blockId, "paragraph");
        updateBlock(pageId, blockId, { content: "" });
        focusBlock(blockId);
        return true;
      }

      if (isListType(block.type)) {
        e.preventDefault();
        const prevBlockId = blockIdx > 0 ? content[blockIdx - 1].id : null;
        const nextBlockId =
          blockIdx < content.length - 1 ? content[blockIdx + 1].id : null;
        deleteBlock(pageId, blockId);
        if (nextBlockId) {
          focusBlock(nextBlockId);
        } else if (prevBlockId) {
          focusBlock(prevBlockId, true);
        }
        return true;
      }

      if (content.length >= 1) {
        handleBackspaceKey(
          e,
          blockId,
          content,
          pageId,
          deleteBlock,
          focusBlock,
        );
        return true;
      }

      return false;
    },
    [pageId, deleteBlock, changeBlockType, updateBlock, focusBlock],
  );

  const handleArrowNavigation = useCallback(
    (e: React.KeyboardEvent, blockId: string, content: Block[]): boolean => {
      if (e.key === "ArrowUp") {
        if (handleArrowUp(blockId, content, focusBlock)) e.preventDefault();
        return true;
      }

      if (e.key === "ArrowDown") {
        if (
          handleArrowDown(blockId, content, e.target as HTMLElement, focusBlock)
        )
          e.preventDefault();
        return true;
      }

      return false;
    },
    [focusBlock],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent, blockId: string, _content: Block[]) => {
      const raw = e.clipboardData.getData("text/plain");
      const markdown = raw.replaceAll("\r\n", "\n").trim();
      if (!markdown) return;

      const parsed = parseMarkdownToBlocks(markdown);
      if (parsed.length === 0) return;

      const shouldTransformSingleBlock =
        parsed.length === 1 &&
        (parsed[0].type !== "paragraph" ||
          markdown.includes("```") ||
          markdown.includes("~~~"));

      if (parsed.length === 1 && !shouldTransformSingleBlock) return;

      e.preventDefault();

      const [first, ...rest] = parsed;
      changeBlockType(pageId, blockId, first.type);
      updateBlock(pageId, blockId, toBlockUpdates(first));

      let afterBlockId = blockId;
      for (const nextBlock of rest) {
        insertBlock(pageId, afterBlockId, nextBlock);
        afterBlockId = nextBlock.id;
      }

      focusBlock(afterBlockId, true);
    },
    [pageId, changeBlockType, updateBlock, insertBlock, focusBlock],
  );

  /** Handle key presses — Enter, Backspace, Arrow navigation. */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, blockId: string, content: Block[]) => {
      const block = content.find((b) => b.id === blockId);
      if (!block) return;
      const blockIdx = content.findIndex((b) => b.id === blockId);
      const liveText =
        (e.currentTarget as HTMLElement | null)?.textContent ?? block.content;
      const isEmpty = isEffectivelyEmpty(liveText);

      if (handleListIndentation(e, blockId, block)) {
        return;
      }

      if (handleParagraphSpaceShortcut(e, blockId, block)) {
        return;
      }

      if (handleEmptyListEnter(e, blockId, block, blockIdx, content, isEmpty)) {
        return;
      }

      if (handleEmptyTodoEnter(e, blockId, block, isEmpty)) {
        return;
      }

      if (
        handleEmptyListDelete(e, blockId, block, blockIdx, content, isEmpty)
      ) {
        return;
      }

      if (handleDividerDelete(e, blockId, block, blockIdx, content)) {
        return;
      }

      if (e.key === "Enter" && block.type === "code") {
        return;
      }

      if (e.key === "Enter" && !e.shiftKey) {
        handleEnterKey(
          e,
          blockId,
          block.type,
          slashMenu,
          pageId,
          insertBlock,
          focusBlock,
        );
        return;
      }

      if (handleEmptyBackspace(e, blockId, block, blockIdx, content, isEmpty)) {
        return;
      }

      if (handleArrowNavigation(e, blockId, content)) {
        return;
      }

      if (e.key === "Escape" && slashMenu) {
        setSlashMenu(null);
      }
    },
    [
      pageId,
      slashMenu,
      insertBlock,
      focusBlock,
      handleListIndentation,
      handleParagraphSpaceShortcut,
      handleEmptyListEnter,
      handleEmptyTodoEnter,
      handleEmptyListDelete,
      handleDividerDelete,
      handleEmptyBackspace,
      handleArrowNavigation,
    ],
  );

  /** Create a real inline database + default view in the shared DBMS store. */
  const createInlineDatabase = useCallback((name?: string) => {
    return useDatabaseStore.getState().createInlineDatabase(name);
  }, []);

  /** Handle slash-command selection. */
  const handleSlashSelect = useSlashSelect({
    pageId,
    slashMenu,
    setSlashMenu,
    updateBlock,
    changeBlockType,
    insertBlock,
    createInlineDatabase,
    focusBlock,
  });

  /** Add a new blank paragraph at the end. */
  const handleAddBlock = useCallback(
    (content: Block[]) => {
      const lastId = content.length > 0 ? content.at(-1)!.id : null; // NOSONAR
      const newBlock: Block = {
        id: crypto.randomUUID(),
        type: "paragraph",
        content: "",
      };
      if (lastId) {
        insertBlock(pageId, lastId, newBlock);
      } else {
        updatePageContent(pageId, [newBlock]);
      }
      focusBlock(newBlock.id);
    },
    [pageId, insertBlock, updatePageContent, focusBlock],
  );

  /** Initialize the first block when focusing the empty area. */
  const handleInitBlock = useCallback(
    (content: Block[]) => {
      if (content.length === 0) {
        const newBlock: Block = {
          id: crypto.randomUUID(),
          type: "paragraph",
          content: "",
        };
        updatePageContent(pageId, [newBlock]);
        focusBlock(newBlock.id);
      }
    },
    [pageId, updatePageContent, focusBlock],
  );

  /** Register or unregister a block ref. */
  const registerBlockRef = useCallback(
    (blockId: string, el: HTMLElement | null) => {
      if (el) blockRefs.current.set(blockId, el);
      else blockRefs.current.delete(blockId);
    },
    [],
  );

  return {
    slashMenu,
    setSlashMenu,
    handleBlockChange,
    handleKeyDown,
    handlePaste,
    handleSlashSelect,
    handleAddBlock,
    handleInitBlock,
    registerBlockRef,
    focusBlock,
  };
}
