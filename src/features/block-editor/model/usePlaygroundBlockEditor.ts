/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePlaygroundBlockEditor.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: vjan-nie <vjan-nie@student.42madrid.com    +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/20 10:19:11 by vjan-nie         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
} from "react";
import { usePageStore } from "@/store/usePageStore";
import {
  detectBlockType,
  getCalloutIconForKind,
  parseMarkdownToBlocks,
} from "@/shared/lib/markengine";
import { useSlashSelect, repositionCursor } from "@/features/slash-commands";
import {
  isIndentable,
  isParentable,
  isHeadingBlock,
  isListBlock,
  isEffectivelyEmpty,
  enterCreatesChild,
} from "@/entities/block";
import { useDatabaseStore } from "@/store/useDatabaseStore";
import type { Block } from "@/entities/block";
import {
  handleArrowUp,
  handleArrowDown,
  handleEnterKey,
  handleBackspaceKey,
  getAdjacentRenderedBlockId,
} from "./playgroundBlockEditor.helpers";
import type { SlashMenuState } from "./playgroundBlockEditor.helpers";
import { useBlockContextMenu } from "./useBlockContextMenu";

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

function isEffectivelyEmptyForDeletion(text: string): boolean {
  return text.replaceAll("\u200B", "").trim().length === 0;
}

function toBlockUpdates(block: Block): Partial<Block> {
  return {
    content: block.content,
    children: block.children,
    checked: block.checked,
    language: block.language,
    color: block.color,
    collapsed: block.collapsed,
    asset: block.asset,
    tableData: block.tableData,
    databaseId: block.databaseId,
    viewId: block.viewId,
  };
}

function findChildrenForParent(
  blocks: Block[],
  parentBlockId: string,
): Block[] | null {
  for (const block of blocks) {
    if (block.id === parentBlockId) {
      return block.children ?? [];
    }

    if (!block.children) {
      continue;
    }

    const nestedChildren = findChildrenForParent(block.children, parentBlockId);
    if (nestedChildren) {
      return nestedChildren;
    }
  }

  return null;
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
  const contentRef = useRef<Block[]>([]);

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

  /** Persist block content edits in the page store. */
  const persistBlockText = useCallback(
    (blockId: string, text: string) => {
      updateBlock(pageId, blockId, {
        content: text,
        ...(text.trim().length > 0 ? { placeholderText: undefined } : {}),
      });
    },
    [pageId, updateBlock],
  );

  const tryHandleCodeOrTable = useCallback(
    (blockId: string, text: string): boolean => {
      const fencedCodeMatch = /^```\s*([A-Za-z0-9_+-]+)?\s*$/.exec(text);
      if (fencedCodeMatch) {
        changeBlockType(pageId, blockId, "code");
        updateBlock(pageId, blockId, {
          content: "",
          language: fencedCodeMatch[1]?.toLowerCase() || "plaintext",
        });
        repositionCursor(blockId, "");
        return true;
      }

      const parsedTable = parsePipeTable(text);
      if (!parsedTable) return false;

      changeBlockType(pageId, blockId, "table_block");
      updateBlock(pageId, blockId, { content: "", tableData: parsedTable });
      return true;
    },
    [pageId, changeBlockType, updateBlock],
  );

  const tryHandleSlashMenu = useCallback(
    (blockId: string, text: string): boolean => {
      if (text.endsWith("/") && !slashMenu) {
        setSlashMenu({ blockId, position: getCaretRect(), filter: "" });
        return true;
      }

      if (slashMenu?.blockId !== blockId) return false;

      const slashIdx = text.lastIndexOf("/");
      if (slashIdx >= 0) {
        setSlashMenu((prev) =>
          prev ? { ...prev, filter: text.slice(slashIdx + 1) } : null,
        );
      } else {
        setSlashMenu(null);
      }

      return true;
    },
    [slashMenu, getCaretRect],
  );

  const tryHandleMarkdownShortcut = useCallback(
    (blockId: string, text: string): void => {
      if (!(text.endsWith(" ") || text === "---" || text === "```")) return;

      const detection = detectBlockType(text);
      if (!detection) return;

      changeBlockType(pageId, blockId, detection.type);
      updateBlock(pageId, blockId, {
        content: detection.remainingContent,
        ...(detection.type === "to_do"
          ? { checked: Boolean(detection.checked) }
          : {}),
        ...(detection.type === "callout"
          ? { color: getCalloutIconForKind(detection.kind ?? "note") }
          : {}),
      });
      repositionCursor(blockId, detection.remainingContent);
    },
    [pageId, changeBlockType, updateBlock],
  );

  /** Handle content change — detects '/' trigger and markdown shortcuts. */
  const handleBlockChange = useCallback(
    (blockId: string, text: string) => {
      persistBlockText(blockId, text);
      if (tryHandleCodeOrTable(blockId, text)) return;
      if (tryHandleSlashMenu(blockId, text)) return;
      tryHandleMarkdownShortcut(blockId, text);
    },
    [
      persistBlockText,
      tryHandleCodeOrTable,
      tryHandleSlashMenu,
      tryHandleMarkdownShortcut,
    ],
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

  const handleBlockIndentation = useCallback(
    (
      e: React.KeyboardEvent,
      blockId: string,
      block: Block,
      content: Block[],
    ): boolean => {
      if (e.key !== "Tab" || !isIndentable(block.type)) return false;

      const idx = content.findIndex((b) => b.id === blockId);

      if (!e.shiftKey) {
        // Can't indent the first sibling
        if (idx <= 0) return false;
        // Can't indent under a leaf block
        if (!isParentable(content[idx - 1].type)) return false;
      }

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
        !isListBlock(block.type) ||
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
        block.type !== 'to_do' ||
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
      if (e.key !== "Delete" || !isListBlock(block.type) || !isEmpty) {
        return false;
      }

      e.preventDefault();
      const nextRenderedBlockId = getAdjacentRenderedBlockId(blockId, "next");
      const prevRenderedBlockId = getAdjacentRenderedBlockId(blockId, "prev");
      deleteBlock(pageId, blockId);
      if (nextRenderedBlockId) {
        focusBlock(nextRenderedBlockId);
      } else if (prevRenderedBlockId) {
        focusBlock(prevRenderedBlockId, true);
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
      _blockIdx: number,
      _content: Block[],
    ): boolean => {
      if (
        (e.key !== "Backspace" && e.key !== "Delete") ||
        block.type !== "divider"
      ) {
        return false;
      }

      e.preventDefault();
      const nextRenderedBlockId = getAdjacentRenderedBlockId(blockId, "next");
      const prevRenderedBlockId = getAdjacentRenderedBlockId(blockId, "prev");
      deleteBlock(pageId, blockId);
      if (nextRenderedBlockId) {
        focusBlock(nextRenderedBlockId);
      } else if (prevRenderedBlockId) {
        focusBlock(prevRenderedBlockId, true);
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
      parentBlockId: string | null,
      isEmpty: boolean,
    ): boolean => {
      if ((e.key !== "Backspace" && e.key !== "Delete") || !isEmpty)
        return false;

      if (isHeadingBlock(block.type)) {
        e.preventDefault();
        changeBlockType(pageId, blockId, "paragraph");
        updateBlock(pageId, blockId, { content: "" });
        focusBlock(blockId);
        return true;
      }

      if (isListBlock(block.type)) {
        e.preventDefault();
        const nextRenderedBlockId = getAdjacentRenderedBlockId(blockId, "next");
        const prevRenderedBlockId = getAdjacentRenderedBlockId(blockId, "prev");
        deleteBlock(pageId, blockId);
        if (nextRenderedBlockId) {
          focusBlock(nextRenderedBlockId);
        } else if (prevRenderedBlockId) {
          focusBlock(prevRenderedBlockId, true);
        }
        return true;
      }

      if (block.type === "paragraph" && parentBlockId) {
        e.preventDefault();
        outdentBlock(pageId, blockId);
        focusBlock(blockId);
        repositionCursor(blockId, "");
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
    [
      pageId,
      deleteBlock,
      changeBlockType,
      updateBlock,
      focusBlock,
      outdentBlock,
    ],
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
    (e: React.ClipboardEvent, blockId: string) => {
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

  const handleContainerEnter = useCallback(
    (
      e: React.KeyboardEvent,
      blockId: string,
      block: Block,
    ): boolean => {
      if (
        e.key !== "Enter" ||
        e.shiftKey ||
        !enterCreatesChild(block.type) ||
        block.type === "toggle"
      ) {
        return false;
      }

      e.preventDefault();
      const child: Block = { id: crypto.randomUUID(), type: "paragraph", content: "" };
      const existingChildren = block.children ?? [];
      updateBlock(pageId, blockId, { children: [...existingChildren, child] });
      focusBlock(child.id);
      return true;
    },
    [pageId, updateBlock, focusBlock],
  );

  /** Handle key presses — Enter, Backspace, Arrow navigation. */
  const handleKeyDown = useCallback(
  (
    e: React.KeyboardEvent,
    blockId: string,
    content: Block[],
    parentBlockId: string | null = null,
  ) => {
    const block = content.find((b) => b.id === blockId);
    if (!block) return;
    const blockIdx = content.findIndex((b) => b.id === blockId);
    const liveText =
      (e.currentTarget as HTMLElement | null)?.textContent ?? block.content;
    const isEmpty = isEffectivelyEmpty(liveText);
    const isEmptyForDeletion = isEffectivelyEmptyForDeletion(liveText);

    const handled =
      handleBlockIndentation(e, blockId, block, content) ||
      handleParagraphSpaceShortcut(e, blockId, block) ||
      handleEmptyListEnter(e, blockId, block, blockIdx, content, isEmpty) ||
      handleEmptyTodoEnter(e, blockId, block, isEmpty) ||
      handleEmptyListDelete(e, blockId, block, blockIdx, content, isEmpty) ||
      handleDividerDelete(e, blockId, block, blockIdx, content) ||
      (e.key === "Enter" && block.type === "code") ||
      handleContainerEnter(e, blockId, block);

    if (handled) return;

    if (e.key === "Enter" && !e.shiftKey) {
      handleEnterKey(e, blockId, block.type, slashMenu, pageId, insertBlock, focusBlock);
      return;
    }

    if (handleEmptyBackspace(e, blockId, block, blockIdx, content, parentBlockId, isEmptyForDeletion)) {
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
    handleBlockIndentation,
    handleParagraphSpaceShortcut,
    handleEmptyListEnter,
    handleEmptyTodoEnter,
    handleEmptyListDelete,
    handleDividerDelete,
    handleContainerEnter,
    handleEmptyBackspace,
    handleArrowNavigation,
  ],
);

  /** Create a real inline database + default view in the shared DBMS store. */
  const createInlineDatabase = useCallback((name?: string) => {
    return useDatabaseStore.getState().createInlineDatabase(name);
  }, []);

  const page = usePageStore((s) => s.pageById(pageId));
  const content = useMemo(() => page?.content ?? [], [page?.content]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  const {
    contextMenu,
    contextMenuSections,
    openContextMenu,
    closeContextMenu,
  } = useBlockContextMenu({
    pageId,
    content,
    updatePageContent,
    focusBlock,
  });

  /** Handle slash-command selection. */
  const {
    handleSlashBlockSelect,
    handleSlashTurnIntoSelect,
    handleSlashMediaSelect,
  } = useSlashSelect({
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
    contextMenu,
    contextMenuSections,
    openContextMenu,
    closeContextMenu,
    handleBlockChange,
    handleKeyDown,
    handlePaste,
    handleSlashSelect: handleSlashBlockSelect,
    handleSlashTurnIntoSelect,
    handleSlashMediaSelect,
    handleAddBlock,
    handleInitBlock,
    registerBlockRef,
    focusBlock,
  };
}
