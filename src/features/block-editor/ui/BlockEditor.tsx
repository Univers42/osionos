/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   BlockEditor.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/05 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 22:27:01 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AssetRenderer } from "@univers42/ui-collection";
import katex from "katex";
import "katex/dist/katex.min.css";

import { EditableContent } from "@/components/blocks/EditableContent";
import { DatabaseBlock } from "@/widgets/database-view";
import {
  continuesSameType,
  getBlockPlaceholder,
  isListBlock,
  selfRendersChildren,
  type Block,
} from "@/entities/block";
import { SlashCommandMenu } from "@/features/slash-commands";
import type { SlashCommand } from "@/features/slash-commands/model/types";

import { usePageStore } from "@/store/usePageStore";
import {
  detectBlockType,
  getCalloutIconForKind,
  parseMarkdownToBlocks,
} from "@/shared/lib/markengine";
import { MermaidDiagram, CodeSyntaxHighlight, EmojiPicker } from "@/shared/ui";
import { MediaBlockEditor } from "./MediaBlockEditor";
import { TodoBlockEditor } from "./TodoBlockEditor";
import { ToggleBlockEditor } from "./ToggleBlockEditor";
import { getBlockSurfaceStyle, getBlockTextStyle } from "../model/blockColors";

const LANGUAGES = [
  "plaintext",
  "javascript",
  "typescript",
  "python",
  "rust",
  "cpp",
  "c",
  "java",
  "go",
  "html",
  "css",
  "json",
  "yaml",
  "markdown",
  "bash",
  "sql",
  "ruby",
  "php",
  "swift",
  "kotlin",
  "lua",
  "toml",
  "mermaid",
];

function renderEquationToHtml(source: string): string {
  try {
    return katex.renderToString(source || "E = mc^2", {
      displayMode: true,
      throwOnError: false,
      strict: "ignore",
    });
  } catch {
    return katex.renderToString(String.raw`\text{Invalid equation}`, {
      displayMode: true,
      throwOnError: false,
    });
  }
}

function toAlphabetic(index: number): string {
  let value = Math.max(1, index);
  let output = "";
  while (value > 0) {
    value -= 1;
    output = String.fromCodePoint(97 + (value % 26)) + output;
    value = Math.floor(value / 26);
  }
  return output;
}

function toRoman(index: number): string {
  const numerals: Array<[number, string]> = [
    [1000, "m"],
    [900, "cm"],
    [500, "d"],
    [400, "cd"],
    [100, "c"],
    [90, "xc"],
    [50, "l"],
    [40, "xl"],
    [10, "x"],
    [9, "ix"],
    [5, "v"],
    [4, "iv"],
    [1, "i"],
  ];
  let value = Math.max(1, Math.min(index, 3999));
  let output = "";
  for (const [amount, numeral] of numerals) {
    while (value >= amount) {
      output += numeral;
      value -= amount;
    }
  }
  return output;
}

function getNumberedMarker(index: number, depth: number): string {
  const shapes = ["◆", "◇", "●", "○", "■", "□"];
  switch (depth % 6) {
    case 0:
      return `${index}.`;
    case 1:
      return `${toAlphabetic(index)}.`;
    case 2:
      return `${toRoman(index)}.`;
    case 3:
      return `${toAlphabetic(index).toUpperCase()}.`;
    case 4:
      return `${toRoman(index).toUpperCase()}.`;
    default:
      return shapes[(index - 1) % shapes.length];
  }
}

interface LayoutConfig {
  columns: number;
  rows: number;
  columnGap: number;
  rowGap: number;
  rowHeight: number;
  wrap: boolean;
  autoReflow: boolean;
  showGuides: boolean;
  preview: boolean;
}

interface LayoutCell {
  id: string;
  colStart: number;
  colSpan: number;
  rowStart: number;
  rowSpan: number;
  type: "text" | "color" | "spacer";
  content: string;
  blocks?: Block[];
  blockType?: Block["type"];
  textColor?: string;
  backgroundColor?: string;
}

const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  columns: 12,
  rows: 6,
  columnGap: 16,
  rowGap: 16,
  rowHeight: 120,
  wrap: true,
  autoReflow: true,
  showGuides: true,
  preview: false,
};

const LAYOUT_CONFIG_LIMITS = {
  columns: [1, 24],
  rows: [1, 96],
  columnGap: [0, 48],
  rowGap: [0, 48],
  rowHeight: [48, 320],
} as const;

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const nextValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(nextValue)) return fallback;
  return Math.max(min, Math.min(max, Math.round(nextValue)));
}

function sanitizeLayoutConfig(config: Partial<LayoutConfig> | undefined): LayoutConfig {
  const merged = config
    ? { ...DEFAULT_LAYOUT_CONFIG, ...config }
    : DEFAULT_LAYOUT_CONFIG;
  return {
    columns: clampNumber(merged.columns, ...LAYOUT_CONFIG_LIMITS.columns, DEFAULT_LAYOUT_CONFIG.columns),
    rows: clampNumber(merged.rows, ...LAYOUT_CONFIG_LIMITS.rows, DEFAULT_LAYOUT_CONFIG.rows),
    columnGap: clampNumber(merged.columnGap, ...LAYOUT_CONFIG_LIMITS.columnGap, DEFAULT_LAYOUT_CONFIG.columnGap),
    rowGap: clampNumber(merged.rowGap, ...LAYOUT_CONFIG_LIMITS.rowGap, DEFAULT_LAYOUT_CONFIG.rowGap),
    rowHeight: clampNumber(merged.rowHeight, ...LAYOUT_CONFIG_LIMITS.rowHeight, DEFAULT_LAYOUT_CONFIG.rowHeight),
    wrap: Boolean(merged.wrap),
    autoReflow: merged.autoReflow !== false,
    showGuides: Boolean(merged.showGuides),
    preview: Boolean(merged.preview),
  };
}

function clampLayoutCell(cell: LayoutCell, config: LayoutConfig): LayoutCell {
  const colSpan = clampNumber(cell.colSpan, 1, config.columns, 1);
  return {
    ...cell,
    colSpan,
    rowSpan: clampNumber(cell.rowSpan, 1, config.rows, 1),
    colStart: clampNumber(cell.colStart, 1, Math.max(1, config.columns - colSpan + 1), 1),
    rowStart: clampNumber(cell.rowStart, 1, config.rows, 1),
    type: cell.type ?? "text",
    content: typeof cell.content === "string" ? cell.content : "",
    blocks: getLayoutCellBlocks(cell),
  };
}

function cellsOverlap(left: LayoutCell, right: LayoutCell): boolean {
  return !(
    left.colStart + left.colSpan <= right.colStart ||
    right.colStart + right.colSpan <= left.colStart ||
    left.rowStart + left.rowSpan <= right.rowStart ||
    right.rowStart + right.rowSpan <= left.rowStart
  );
}

function findLayoutPlacement(
  placedCells: LayoutCell[],
  config: LayoutConfig,
  colSpan: number,
  rowSpan: number,
): Pick<LayoutCell, "colStart" | "rowStart"> {
  const safeColSpan = Math.min(config.columns, Math.max(1, colSpan));
  const safeRowSpan = Math.max(1, rowSpan);
  const maxRowsToScan = Math.max(config.rows + placedCells.length * safeRowSpan + 12, 24);

  for (let rowStart = 1; rowStart <= maxRowsToScan; rowStart += 1) {
    for (let colStart = 1; colStart <= config.columns - safeColSpan + 1; colStart += 1) {
      const candidate: LayoutCell = {
        id: "candidate",
        colStart,
        colSpan: safeColSpan,
        rowStart,
        rowSpan: safeRowSpan,
        type: "text",
        content: "",
      };
      if (placedCells.every((cell) => !cellsOverlap(candidate, cell))) {
        return { colStart, rowStart };
      }
    }
  }

  return { colStart: 1, rowStart: maxRowsToScan + 1 };
}

function packLayoutCells(cells: LayoutCell[], config: LayoutConfig): LayoutCell[] {
  const placedCells: LayoutCell[] = [];
  for (const cell of cells) {
    const clampedCell = clampLayoutCell(cell, config);
    const placement = findLayoutPlacement(
      placedCells,
      config,
      clampedCell.colSpan,
      clampedCell.rowSpan,
    );
    placedCells.push({ ...clampedCell, ...placement });
  }
  return placedCells;
}

function normalizeLayoutCells(cells: LayoutCell[], config: LayoutConfig): LayoutCell[] {
  const clampedCells = cells.map((cell) => clampLayoutCell(cell, config));
  return config.autoReflow ? packLayoutCells(clampedCells, config) : clampedCells;
}

function stripSlashQuery(content: string): string {
  const slashIndex = content.lastIndexOf("/");
  return slashIndex >= 0 ? content.slice(0, slashIndex) : content;
}

function appendInlineText(content: string, insertText: string): string {
  const cleanContent = stripSlashQuery(content);
  const separator = cleanContent.length > 0 && !/\s$/.test(cleanContent) ? " " : "";
  return `${cleanContent}${separator}${insertText}`;
}

function getCaretRectFallback(): { x: number; y: number } {
  const selection = globalThis.getSelection?.();
  if (selection?.rangeCount) {
    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(false);
    const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
    if (rect) {
      return { x: rect.left, y: rect.bottom };
    }
  }
  return { x: 24, y: 24 };
}

function getLayoutConfig(block: Block): LayoutConfig {
  const storedConfig = block.layoutConfig as Partial<LayoutConfig> | undefined;
  return sanitizeLayoutConfig(storedConfig);
}

function getLayoutCells(block: Block): LayoutCell[] {
  const cells = block.layoutCells;
  return Array.isArray(cells) ? (cells as LayoutCell[]) : [];
}

function isLayoutCellBlock(value: unknown): value is Block {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as Block).id === "string" &&
      typeof (value as Block).type === "string" &&
      typeof (value as Block).content === "string",
  );
}

function createLayoutCellBlock(cell: Pick<LayoutCell, "id" | "content" | "blockType">): Block {
  return {
    id: `${cell.id}-content`,
    type: cell.blockType ?? "paragraph",
    content: cell.content ?? "",
  };
}

function getLayoutCellBlocks(cell: LayoutCell): Block[] {
  if (Array.isArray(cell.blocks)) {
    const blocks = cell.blocks.filter(isLayoutCellBlock);
    if (blocks.length > 0) return blocks;
  }

  return [createLayoutCellBlock(cell)];
}

function summarizeLayoutCellContent(blocks: Block[]): string {
  return blocks.map((nestedBlock) => nestedBlock.content).join("\n");
}

function updateBlockInTree(
  blocks: Block[],
  blockId: string,
  updater: (block: Block) => Block,
): Block[] {
  return blocks.map((nestedBlock) => {
    if (nestedBlock.id === blockId) return updater(nestedBlock);
    if (!nestedBlock.children?.length) return nestedBlock;
    return {
      ...nestedBlock,
      children: updateBlockInTree(nestedBlock.children, blockId, updater),
    };
  });
}

function insertBlockAfterInTree(
  blocks: Block[],
  blockId: string,
  newBlock: Block,
): Block[] {
  const nextBlocks: Block[] = [];

  for (const nestedBlock of blocks) {
    nextBlocks.push(nestedBlock);
    if (nestedBlock.id === blockId) {
      nextBlocks.push(newBlock);
      continue;
    }

    if (nestedBlock.children?.length) {
      nextBlocks[nextBlocks.length - 1] = {
        ...nestedBlock,
        children: insertBlockAfterInTree(nestedBlock.children, blockId, newBlock),
      };
    }
  }

  return nextBlocks;
}

function deleteBlockFromTree(blocks: Block[], blockId: string): Block[] {
  return blocks
    .filter((nestedBlock) => nestedBlock.id !== blockId)
    .map((nestedBlock) =>
      nestedBlock.children?.length
        ? {
            ...nestedBlock,
            children: deleteBlockFromTree(nestedBlock.children, blockId),
          }
        : nestedBlock,
    );
}

function flattenBlockIds(blocks: Block[]): string[] {
  return blocks.flatMap((nestedBlock) => [
    nestedBlock.id,
    ...flattenBlockIds(nestedBlock.children ?? []),
  ]);
}

function shouldRenderLayoutCellChildren(block: Block): boolean {
  if (!block.children?.length) return false;
  if (selfRendersChildren(block.type)) return false;
  if (block.type === "toggle" && block.collapsed) return false;
  return true;
}

function focusLayoutCellBlock(blockId: string, cursorEnd = false) {
  requestAnimationFrame(() => {
    const root = document.querySelector<HTMLElement>(`[data-layout-cell-block-id="${blockId}"]`);
    const editable = root?.querySelector<HTMLElement>('[contenteditable="true"], textarea, button');
    editable?.focus();

    if (!cursorEnd || editable?.getAttribute("contenteditable") !== "true") {
      return;
    }

    const selection = globalThis.getSelection?.();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  });
}

interface BlockEditorProps {
  pageId: string;
  block: Block;
  numberedIndex: number;
  numberedDepth: number;
  isSelected?: boolean;
  onChange: (text: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onPaste?: (e: React.ClipboardEvent) => void;
  onDeleteCodeBlock?: () => void;
  onUpdateBlock?: (blockId: string, updates: Partial<Block>) => void;
  onRequestSlashMenu?: (position: { x: number; y: number }) => void;
  renderChildren?: () => React.ReactNode;
  focusBlock: (blockId: string, cursorEnd?: boolean) => void;
}

export const BlockEditor: React.FC<BlockEditorProps> = ({
  pageId,
  block,
  numberedIndex,
  numberedDepth,
  isSelected = false,
  onChange,
  onKeyDown,
  onPaste,
  onDeleteCodeBlock,
  onUpdateBlock,
  focusBlock,
  onRequestSlashMenu,
  renderChildren,
}) => {
  const updateBlock = usePageStore((s) => s.updateBlock);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showCalloutIconPicker, setShowCalloutIconPicker] = useState(false);
  const [isEquationEditing, setIsEquationEditing] = useState(false);
  const equationTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const langPickerRef = useRef<HTMLDivElement | null>(null);
  const editableStyle = useMemo(
    () => getBlockTextStyle(block),
    [block],
  );
  const surfaceStyle = useMemo(
    () => getBlockSurfaceStyle(block),
    [block],
  );
  const isMermaidCode =
    block.type === "code" &&
    (block.language || "plaintext").trim().toLowerCase() === "mermaid";
  const isSyntaxPreviewCode =
    block.type === "code" &&
    !isMermaidCode &&
    (block.language || "plaintext").trim().toLowerCase() !== "plaintext";

  const commitBlockUpdate = useCallback(
    (blockId: string, updates: Partial<Block>) => {
      if (onUpdateBlock) {
        onUpdateBlock(blockId, updates);
        return;
      }

      updateBlock(pageId, blockId, updates);
    },
    [onUpdateBlock, pageId, updateBlock],
  );

  const handleLangSelect = useCallback(
    (language: string) => {
      commitBlockUpdate(block.id, { language });
      setShowLangPicker(false);
    },
    [commitBlockUpdate, block.id],
  );

  const handleCodeTextareaKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const ta = e.currentTarget;
        const { selectionStart, selectionEnd, value } = ta;
        const indent = "    ";
        const next =
          value.slice(0, selectionStart) + indent + value.slice(selectionEnd);
        onChange(next);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = selectionStart + indent.length;
        });
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        const ta = e.currentTarget;
        const { selectionStart, selectionEnd, value } = ta;
        const next =
          value.slice(0, selectionStart) + "\n" + value.slice(selectionEnd);
        onChange(next);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = selectionStart + 1;
        });
        return;
      }

      onKeyDown(e);
    },
    [onChange, onKeyDown],
  );

  const openEquationEditor = useCallback(() => {
    setIsEquationEditing(true);
    requestAnimationFrame(() => equationTextareaRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!showLangPicker) return;

    const handleOutside = (e: MouseEvent) => {
      if (
        langPickerRef.current &&
        !langPickerRef.current.contains(e.target as Node)
      ) {
        setShowLangPicker(false);
      }
    };

    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [showLangPicker]);

  switch (block.type) {
    case "heading_1":
      return (
        <EditableContent
          content={block.content}
          className="text-2xl font-bold text-[var(--color-ink)] mt-6 mb-1 leading-tight"
          style={editableStyle}
          placeholder={getBlockPlaceholder(block, "Heading 1")}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onRequestSlashMenu={onRequestSlashMenu}
          pageId={pageId}
        />
      );
    case "heading_2":
      return (
        <EditableContent
          content={block.content}
          className="text-xl font-semibold text-[var(--color-ink)] mt-5 mb-1 leading-tight"
          style={editableStyle}
          placeholder={getBlockPlaceholder(block, "Heading 2")}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onRequestSlashMenu={onRequestSlashMenu}
          pageId={pageId}
        />
      );
    case "heading_3":
      return (
        <EditableContent
          content={block.content}
          className="text-lg font-semibold text-[var(--color-ink)] mt-4 mb-0.5 leading-snug"
          style={editableStyle}
          placeholder={getBlockPlaceholder(block, "Heading 3")}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onRequestSlashMenu={onRequestSlashMenu}
          pageId={pageId}
        />
      );

    case "heading_4":
      return (
        <EditableContent
          content={block.content}
          className="text-base font-semibold text-[var(--color-ink)] mt-3 mb-0.5 leading-snug"
          style={editableStyle}
          placeholder={getBlockPlaceholder(block, "Heading 4")}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onRequestSlashMenu={onRequestSlashMenu}
          pageId={pageId}
        />
      );

    case "heading_5":
      return (
        <EditableContent
          content={block.content}
          className="text-sm font-semibold text-[var(--color-ink)] mt-2 mb-0.5 leading-snug"
          style={editableStyle}
          placeholder={getBlockPlaceholder(block, "Heading 5")}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onRequestSlashMenu={onRequestSlashMenu}
          pageId={pageId}
        />
      );

    case "heading_6":
      return (
        <EditableContent
          content={block.content}
          className="text-xs font-semibold text-[var(--color-ink-muted)] mt-2 mb-0.5 leading-snug tracking-wide"
          style={editableStyle}
          placeholder={getBlockPlaceholder(block, "Heading 6")}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onRequestSlashMenu={onRequestSlashMenu}
          pageId={pageId}
        />
      );

    case "paragraph":
      return (
        <EditableContent
          content={block.content}
          className="text-sm text-[var(--color-ink)] leading-relaxed py-0.5 min-h-[1.5em]"
          style={editableStyle}
          placeholder={getBlockPlaceholder(block, "Type '/' for commands…")}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onRequestSlashMenu={onRequestSlashMenu}
          pageId={pageId}
        />
      );

    case "bulleted_list":
      return (
        <div className="flex items-start gap-2 pl-5">
          <span className="text-sm leading-relaxed py-0.5 select-none shrink-0 w-6 text-center">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-ink-faint)] mt-[7px]" />
          </span>
          <div className="flex-1">
            <EditableContent
              content={block.content}
              className="text-sm text-[var(--color-ink)] leading-relaxed py-0.5 whitespace-pre-wrap"
              style={editableStyle}
              placeholder={getBlockPlaceholder(block, "List item")}
              onChange={onChange}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onRequestSlashMenu={onRequestSlashMenu}
              pageId={pageId}
            />
          </div>
        </div>
      );

    case "numbered_list":
      return (
        <div className="flex items-start gap-2 pl-5">
          <span className="text-sm leading-relaxed py-0.5 text-[var(--color-ink-muted)] select-none shrink-0 w-6 text-center font-medium">
            {getNumberedMarker(numberedIndex, numberedDepth)}
          </span>
          <div className="flex-1">
            <EditableContent
              content={block.content}
              className="text-sm text-[var(--color-ink)] leading-relaxed py-0.5 whitespace-pre-wrap"
              style={editableStyle}
              placeholder={getBlockPlaceholder(block, "List item")}
              onChange={onChange}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onRequestSlashMenu={onRequestSlashMenu}
              pageId={pageId}
            />
          </div>
        </div>
      );

    case "to_do":
      return (
        <TodoBlockEditor
          block={block}
          pageId={pageId}
          style={editableStyle}
          onUpdateBlock={commitBlockUpdate}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onRequestSlashMenu={onRequestSlashMenu}
        />
      );

    case "toggle":
      return (
        <ToggleBlockEditor
          block={block}
          pageId={pageId}
          style={editableStyle}
          onUpdateBlock={commitBlockUpdate}
          onChange={onChange}
          onKeyDown={onKeyDown}
          focusBlock={focusBlock}
          onRequestSlashMenu={onRequestSlashMenu}
        />
      );

    case "column_list":
      return (
        <div className="my-1 rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-surface-secondary)] px-2 py-2" style={surfaceStyle}>
          {renderChildren?.() ?? (
            <span className="text-xs text-[var(--color-ink-faint)]">Columns</span>
          )}
        </div>
      );

    case "column":
      return (
        <div className="min-h-10 rounded-md border border-dashed border-[var(--color-line)] px-2 py-1" style={surfaceStyle}>
          {renderChildren?.() ?? (
            <span className="text-xs text-[var(--color-ink-faint)]">Empty column</span>
          )}
        </div>
      );

    case "image":
    case "video":
    case "audio":
    case "file":
      return (
        <MediaBlockEditor
          pageId={pageId}
          block={block}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />
      );

    case "code":
      return (
        <div className="my-1 rounded-lg overflow-visible border border-[var(--color-line)] relative" style={surfaceStyle}>
          <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--color-surface-secondary)] border-b border-[var(--color-line)]">
            <div ref={langPickerRef} className="relative">
              <button
                type="button"
                onClick={() => setShowLangPicker((v) => !v)}
                className="text-[11px] font-mono text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] px-1.5 py-0.5 rounded hover:bg-[var(--color-surface-hover)] transition-colors"
              >
                {block.language || "plaintext"}
              </button>
              {showLangPicker && (
                <div className="absolute top-full left-0 mt-1 bg-[var(--color-surface-primary)] border border-[var(--color-line)] rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto w-40">
                  {LANGUAGES.map((language) => (
                    <button
                      key={language}
                      type="button"
                      onClick={() => handleLangSelect(language)}
                      className={[
                        "w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-[var(--color-surface-hover)]",
                        language === (block.language || "plaintext")
                          ? "bg-[var(--color-surface-secondary)] text-[var(--color-ink)]"
                          : "text-[var(--color-ink-muted)]",
                      ].join(" ")}
                    >
                      {language}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="p-3 bg-[var(--color-surface-primary)]" style={surfaceStyle}>
            <textarea
              value={block.content}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleCodeTextareaKeyDown}
              placeholder={getBlockPlaceholder(block, "Code…")}
              spellCheck={false}
              className="w-full min-h-[120px] text-[13px] leading-relaxed font-mono text-[var(--color-ink)] whitespace-pre bg-transparent outline-none resize-y"
              style={editableStyle}
            />
            {isMermaidCode && block.content.trim() && (
              <div className="mt-3 pt-3 border-t border-[var(--color-line)]">
                <p className="text-[11px] font-mono text-[var(--color-ink-muted)] mb-2">
                  Mermaid preview
                </p>
                <MermaidDiagram
                  chart={block.content}
                  className="rounded-md border border-[var(--color-line)] p-3 bg-[var(--color-surface-secondary)] overflow-x-auto"
                />
              </div>
            )}
            {isSyntaxPreviewCode && block.content.trim() && (
              <div className="mt-3 pt-3 border-t border-[var(--color-line)]">
                <p className="text-[11px] font-mono text-[var(--color-ink-muted)] mb-2">
                  Syntax preview
                </p>
                <CodeSyntaxHighlight
                  code={block.content}
                  language={block.language}
                  className="rounded-md border border-[var(--color-line)] p-3 bg-[var(--color-surface-secondary)] overflow-x-auto"
                  codeClassName="text-[13px] leading-relaxed font-mono whitespace-pre"
                />
              </div>
            )}
          </div>
        </div>
      );

    case "quote":
      return (
        <div className="flex my-0.5 rounded-md px-1" style={surfaceStyle}>
          <div className="w-1 bg-[var(--color-ink)] rounded-full shrink-0 mr-3" style={editableStyle} />
          <div className="flex-1 min-w-0">
            <EditableContent
              content={block.content}
              className="text-sm text-[var(--color-ink-muted)] leading-relaxed py-0.5 italic"
              style={editableStyle}
              placeholder="Quote…"
              onChange={onChange}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onRequestSlashMenu={onRequestSlashMenu}
            />
            {renderChildren?.()}
          </div>
        </div>
      );

    case "callout": {
      const icon = block.color || "💡";
      const colors = {
        bg: "bg-[var(--color-surface-primary)]",
        border: "border-[var(--color-line)]",
        text: "text-[var(--color-ink)]",
      };
      return (
        <div
          className={`flex items-start gap-3 p-3 rounded-lg border my-0.5 ${colors.bg} ${colors.border}`}
          style={surfaceStyle}
        >
          <div className="relative shrink-0">
            <button
              type="button"
              className={`inline-flex cursor-pointer items-center justify-center rounded ${colors.text}`}
              aria-label="Change callout icon"
              title="Change callout icon"
              onClick={() => setShowCalloutIconPicker((prev) => !prev)}
            >
              <AssetRenderer value={icon} size={20} />
            </button>
            {showCalloutIconPicker && (
              <EmojiPicker
                current={icon}
                onSelect={(nextIcon) => {
                  commitBlockUpdate(block.id, { color: nextIcon });
                }}
                onRemove={() => {
                  commitBlockUpdate(block.id, { color: "💡" });
                }}
                onClose={() => setShowCalloutIconPicker(false)}
              />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <EditableContent
              content={block.content}
              className={`text-sm ${colors.text} leading-relaxed py-0.5`}
              style={editableStyle}
              placeholder={getBlockPlaceholder(block, "Type '/' for commands…")}
              onChange={onChange}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onRequestSlashMenu={onRequestSlashMenu}
            />
            {renderChildren?.()}
          </div>
        </div>
      );
    }
    case "equation": {
      const equationHtml = renderEquationToHtml(block.content.trim());
      const shouldEditEquation = isSelected || isEquationEditing;

      return (
        <div
          className="relative my-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-secondary)] p-3"
          style={surfaceStyle}
        >
          {shouldEditEquation ? null : (
            <button
              type="button"
              aria-label="Edit equation"
              className="absolute inset-0 z-10 cursor-text rounded-lg bg-transparent"
              onClick={openEquationEditor}
            />
          )}
          <div
            className="overflow-x-auto text-[var(--color-ink)]"
            style={editableStyle}
            dangerouslySetInnerHTML={{ __html: equationHtml }}
          />
          {shouldEditEquation ? (
            <textarea
              ref={equationTextareaRef}
              value={block.content}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onFocus={() => setIsEquationEditing(true)}
              onBlur={() => setIsEquationEditing(false)}
              placeholder="Write LaTeX, e.g. E = mc^2"
              className="mt-2 min-h-[56px] w-full resize-y rounded-md border border-[var(--color-line)] bg-[var(--color-surface-primary)] px-3 py-2 font-mono text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
              style={editableStyle}
            />
          ) : null}
        </div>
      );
    }

    case "layout":
      return <LayoutBlockEditor block={block} pageId={pageId} />;

    case "divider":
      return (
        <button
          type="button"
          className="w-full py-2 rounded outline-none focus:bg-[var(--color-surface-secondary)]"
          onKeyDown={(e) => {
            onKeyDown(e);
          }}
          aria-label="Divider block"
        >
          <hr className="w-full h-px border-0 bg-[var(--color-ink-faint)]" />
        </button>
      );

    case "table_block":
      return (
        <div // NOSONAR - keyboard navigation wrapper for non-editable block
          onKeyDown={(e) => {
            if (
              e.key === "ArrowUp" ||
              e.key === "ArrowDown" ||
              e.key === "Backspace" ||
              e.key === "Delete" ||
              e.key === "Enter" ||
              e.key === "Escape"
            ) {
              onKeyDown(e);
            }
          }}
          tabIndex={-1}
          aria-label="Table block"
        >
          <TableBlockEditor
            block={block}
            pageId={pageId}
            style={surfaceStyle}
            textStyle={editableStyle}
            onDeleteTable={onDeleteCodeBlock}
          />
        </div>
      );

    case "database_inline":
    case "database_full_page":
      return (
        <div // NOSONAR - keyboard navigation wrapper for non-editable block
          onKeyDown={(e) => {
            if (
              e.key === "ArrowUp" ||
              e.key === "ArrowDown" ||
              e.key === "Backspace" ||
              e.key === "Delete" ||
              e.key === "Enter" ||
              e.key === "Escape"
            ) {
              onKeyDown(e);
            }
          }}
          tabIndex={-1}
          aria-label="Database block"
        >
          <DatabaseBlock
            databaseId={block.databaseId}
            initialViewId={block.viewId}
            mode={block.type === "database_full_page" ? "full" : "inline"}
          />
        </div>
      );

    default:
      return (
        <EditableContent
          content={block.content}
          className="text-sm text-[var(--color-ink)] leading-relaxed py-0.5"
          style={editableStyle}
          placeholder={getBlockPlaceholder(block, "Type something…")}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onRequestSlashMenu={onRequestSlashMenu}
          pageId={pageId}
        />
      );
  }
};

const TableBlockEditor: React.FC<{
  block: Block;
  pageId: string;
  style?: React.CSSProperties;
  textStyle?: React.CSSProperties;
  onDeleteTable?: () => void;
}> = ({ block, pageId, style, textStyle, onDeleteTable }) => {
  const updateBlock = usePageStore((s) => s.updateBlock);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    row: number;
    col: number;
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  const data = useMemo(
    () =>
      block.tableData || [
        ["", "", ""],
        ["", "", ""],
        ["", "", ""],
      ],
    [block.tableData],
  );

  const handleCellChange = useCallback(
    (row: number, col: number, value: string) => {
      const next = data.map((r, ri) =>
        ri === row ? r.map((c, ci) => (ci === col ? value : c)) : [...r],
      );
      updateBlock(pageId, block.id, { tableData: next });
    },
    [data, updateBlock, pageId, block.id],
  );

  const addRow = useCallback(() => {
    const cols = data[0]?.length || 3;
    updateBlock(pageId, block.id, {
      tableData: [...data, new Array(cols).fill("")],
    });
  }, [data, updateBlock, pageId, block.id]);

  const addCol = useCallback(() => {
    updateBlock(pageId, block.id, {
      tableData: data.map((row) => [...row, ""]),
    });
  }, [data, updateBlock, pageId, block.id]);

  const removeRow = useCallback(
    (rowIndex: number) => {
      if (data.length <= 1) return;
      updateBlock(pageId, block.id, {
        tableData: data.filter((_, idx) => idx !== rowIndex),
      });
    },
    [data, updateBlock, pageId, block.id],
  );

  const removeCol = useCallback(
    (colIndex: number) => {
      const colCount = data[0]?.length ?? 0;
      if (colCount <= 1) return;
      updateBlock(pageId, block.id, {
        tableData: data.map((row) => row.filter((_, idx) => idx !== colIndex)),
      });
    },
    [data, updateBlock, pageId, block.id],
  );

  const openContextMenu = useCallback(
    (e: React.MouseEvent, row: number, col: number) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, row, col });
    },
    [],
  );

  useEffect(() => {
    if (!contextMenu) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenu]);

  return (
    <div className="group/table my-2 border border-[var(--color-line)] rounded-lg overflow-visible relative" style={style}>
      <div className="overflow-auto max-h-[26rem]">
        <table className="w-max min-w-full text-sm">
          <tbody>
            {data.map((row, ri) => (
              <tr
                key={`row-${ri}`} // NOSONAR - positional keys are correct for table grid cells
                className={
                  ri === 0
                    ? "bg-[var(--color-surface-secondary)] font-medium"
                    : ""
                }
              >
                {row.map((cell, ci) => (
                  <td
                    key={`cell-${ri}-${ci}`} // NOSONAR - positional keys are correct for table grid cells
                    className="border-b border-r border-[var(--color-line)] last:border-r-0 px-0 py-0 min-w-[120px] text-[var(--color-ink)]"
                    style={textStyle}
                    onContextMenu={(e) => openContextMenu(e, ri, ci)}
                  >
                    <input
                      type="text"
                      value={cell}
                      onChange={(e) => handleCellChange(ri, ci, e.target.value)}
                      className="w-full bg-transparent px-3 py-1.5 outline-none focus:bg-[var(--color-surface-hover)]"
                      style={textStyle}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={addCol}
        aria-label="Add column"
        className="absolute -right-3 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface-primary)] text-sm text-[var(--color-ink-muted)] opacity-0 shadow-sm transition-opacity hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-ink)] group-hover/table:opacity-100"
      >
        +
      </button>
      <button
        type="button"
        onClick={addRow}
        aria-label="Add row"
        className="absolute -bottom-3 left-1/2 z-10 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface-primary)] text-sm text-[var(--color-ink-muted)] opacity-0 shadow-sm transition-opacity hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-ink)] group-hover/table:opacity-100"
      >
        +
      </button>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-[10000] min-w-[180px] rounded-md border border-[var(--color-line)] bg-[var(--color-surface-primary)] shadow-lg py-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            onClick={() => {
              removeRow(contextMenu.row);
              setContextMenu(null);
            }}
            disabled={data.length <= 1}
            className="w-full px-3 py-1.5 text-left text-sm text-[var(--color-ink)] hover:bg-[var(--color-surface-secondary)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Delete row
          </button>
          <button
            type="button"
            onClick={() => {
              removeCol(contextMenu.col);
              setContextMenu(null);
            }}
            disabled={(data[0]?.length ?? 0) <= 1}
            className="w-full px-3 py-1.5 text-left text-sm text-[var(--color-ink)] hover:bg-[var(--color-surface-secondary)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Delete column
          </button>
          <div className="my-1 border-t border-[var(--color-line)]" />
          <button
            type="button"
            onClick={() => {
              onDeleteTable?.();
              setContextMenu(null);
            }}
            disabled={!onDeleteTable}
            className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Delete table
          </button>
        </div>
      )}
    </div>
  );
};

const LayoutBlockEditor: React.FC<{ block: Block; pageId: string }> = ({
  block,
  pageId,
}) => {
  const updateBlock = usePageStore((s) => s.updateBlock);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cellSlashMenu, setCellSlashMenu] = useState<{
    cellId: string;
    blockId: string;
    position: { x: number; y: number };
    filter: string;
  } | null>(null);
  const config = getLayoutConfig(block);
  const cells = useMemo(
    () => normalizeLayoutCells(getLayoutCells(block), config),
    [block, config],
  );

  const updateLayout = useCallback(
    (updates: Partial<Pick<Block, "layoutConfig" | "layoutCells">>) => {
      updateBlock(pageId, block.id, updates);
    },
    [block.id, pageId, updateBlock],
  );

  const updateConfig = useCallback(
    (patch: Partial<LayoutConfig>) => {
      const nextConfig = sanitizeLayoutConfig({ ...config, ...patch });
      updateLayout({
        layoutConfig: nextConfig,
        layoutCells: normalizeLayoutCells(cells, nextConfig),
      });
    },
    [cells, config, updateLayout],
  );

  const updateCells = useCallback(
    (nextCells: LayoutCell[]) => updateLayout({ layoutCells: nextCells }),
    [updateLayout],
  );

  const addCell = useCallback(() => {
    const colSpan = Math.min(4, config.columns);
    const placement = findLayoutPlacement(cells, config, colSpan, 1);
    const nextCell: LayoutCell = {
      id: crypto.randomUUID(),
      colStart: placement.colStart,
      colSpan,
      rowStart: placement.rowStart,
      rowSpan: 1,
      type: "text",
      content: "",
      blocks: [{ id: crypto.randomUUID(), type: "paragraph", content: "" }],
    };
    const nextCells: LayoutCell[] = [
      ...cells,
      nextCell,
    ];
    updateCells(config.autoReflow ? packLayoutCells(nextCells, config) : nextCells);
  }, [cells, config, updateCells]);

  const updateCell = useCallback(
    (cellId: string, patch: Partial<LayoutCell>) => {
      const nextCells = cells.map((cell) => (cell.id === cellId ? { ...cell, ...patch } : cell));
      updateCells(config.autoReflow ? packLayoutCells(nextCells, config) : normalizeLayoutCells(nextCells, config));
    },
    [cells, config, updateCells],
  );

  const removeCell = useCallback(
    (cellId: string) => updateCells(cells.filter((cell) => cell.id !== cellId)),
    [cells, updateCells],
  );

  const startResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, cell: LayoutCell, axis: "x" | "y" | "both") => {
      event.preventDefault();
      event.stopPropagation();
      const container = event.currentTarget.closest<HTMLElement>("[data-layout-grid]");
      const rect = container?.getBoundingClientRect();
      if (!rect) return;

      const startX = event.clientX;
      const startY = event.clientY;
      const cellWidth = rect.width / config.columns;
      const rowHeight = Math.max(24, config.rowHeight);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const colDelta = Math.round((moveEvent.clientX - startX) / Math.max(cellWidth, 1));
        const rowDelta = Math.round((moveEvent.clientY - startY) / rowHeight);
        const resizedCell = {
          colSpan: axis === "x" || axis === "both"
            ? Math.max(1, Math.min(config.columns - cell.colStart + 1, cell.colSpan + colDelta))
            : cell.colSpan,
          rowSpan: axis === "y" || axis === "both"
            ? Math.max(1, cell.rowSpan + rowDelta)
            : cell.rowSpan,
        };
        updateCell(cell.id, resizedCell);
      };

      const handlePointerUp = () => {
        globalThis.removeEventListener("pointermove", handlePointerMove);
        globalThis.removeEventListener("pointerup", handlePointerUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      let cursor = "nwse-resize";
      if (axis === "x") cursor = "ew-resize";
      if (axis === "y") cursor = "ns-resize";
      document.body.style.cursor = cursor;
      document.body.style.userSelect = "none";
      globalThis.addEventListener("pointermove", handlePointerMove);
      globalThis.addEventListener("pointerup", handlePointerUp, { once: true });
    },
    [config.columns, config.rowHeight, updateCell],
  );

  const updateCellBlocks = useCallback(
    (cellId: string, nextBlocks: Block[]) => {
      updateCell(cellId, {
        blocks: nextBlocks,
        content: summarizeLayoutCellContent(nextBlocks),
      });
    },
    [updateCell],
  );

  const handleCellBlockChange = useCallback(
    (cell: LayoutCell, blockId: string, nextContent: string) => {
      let nextBlocks = updateBlockInTree(cell.blocks ?? getLayoutCellBlocks(cell), blockId, (nestedBlock) => ({
        ...nestedBlock,
        content: nextContent,
      }));

      if (nextContent.endsWith(" ") || nextContent === "---" || nextContent === "```" || nextContent === "$$") {
        const detection = detectBlockType(nextContent);
        if (detection) {
          nextBlocks = updateBlockInTree(nextBlocks, blockId, (nestedBlock) => ({
            ...nestedBlock,
            type: detection.type,
            content: detection.remainingContent,
            checked: detection.type === "to_do" ? Boolean(detection.checked) : nestedBlock.checked,
            color: detection.type === "callout"
              ? getCalloutIconForKind(detection.kind ?? "note")
              : nestedBlock.color,
            headingLevel: detection.headingLevel as Block["headingLevel"],
          }));
          focusLayoutCellBlock(blockId);
        }
      }

      updateCellBlocks(cell.id, nextBlocks);

      const slashIndex = nextContent.lastIndexOf("/");
      setCellSlashMenu((current) => {
        const isActiveCellMenu = current?.cellId === cell.id && current.blockId === blockId;
        if (slashIndex >= 0 && (nextContent.endsWith("/") || isActiveCellMenu)) {
          return {
            cellId: cell.id,
            blockId,
            position: isActiveCellMenu ? current.position : getCaretRectFallback(),
            filter: nextContent.slice(slashIndex + 1),
          };
        }

        return isActiveCellMenu ? null : current;
      });
    },
    [updateCellBlocks],
  );

  const handleCellBlockKeyDown = useCallback(
    (event: React.KeyboardEvent, cell: LayoutCell, nestedBlock: Block) => {
      const cellBlocks = cell.blocks ?? getLayoutCellBlocks(cell);

      if (event.key === "Escape") {
        setCellSlashMenu(null);
        return;
      }

      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();

        if (isListBlock(nestedBlock.type) && nestedBlock.content.trim().length === 0) {
          const nextBlocks = updateBlockInTree(cellBlocks, nestedBlock.id, (blockToUpdate) => ({
            ...blockToUpdate,
            type: "paragraph",
            content: "",
            checked: false,
          }));
          updateCellBlocks(cell.id, nextBlocks);
          focusLayoutCellBlock(nestedBlock.id);
          return;
        }

        const nextBlock: Block = {
          id: crypto.randomUUID(),
          type: continuesSameType(nestedBlock.type) ? nestedBlock.type : "paragraph",
          content: "",
        };
        const nextBlocks = insertBlockAfterInTree(cellBlocks, nestedBlock.id, nextBlock);
        updateCellBlocks(cell.id, nextBlocks);
        focusLayoutCellBlock(nextBlock.id);
        return;
      }

      if (
        (event.key === "Backspace" || event.key === "Delete") &&
        nestedBlock.content.trim().length === 0 &&
        flattenBlockIds(cellBlocks).length > 1
      ) {
        event.preventDefault();
        const ids = flattenBlockIds(cellBlocks);
        const currentIndex = ids.indexOf(nestedBlock.id);
        const focusTarget = ids[event.key === "Delete" ? currentIndex + 1 : currentIndex - 1]
          ?? ids[currentIndex - 1]
          ?? ids[currentIndex + 1];
        updateCellBlocks(cell.id, deleteBlockFromTree(cellBlocks, nestedBlock.id));
        if (focusTarget) focusLayoutCellBlock(focusTarget, event.key !== "Delete");
      }
    },
    [updateCellBlocks],
  );

  const handleCellBlockPaste = useCallback(
    (event: React.ClipboardEvent, cell: LayoutCell, blockId: string) => {
      const markdown = event.clipboardData.getData("text/plain").replaceAll("\r\n", "\n").trim();
      if (!markdown) return;

      const parsedBlocks = parseMarkdownToBlocks(markdown);
      if (parsedBlocks.length <= 1 && parsedBlocks[0]?.type === "paragraph") return;

      event.preventDefault();
      const [firstBlock, ...restBlocks] = parsedBlocks;
      let nextBlocks = updateBlockInTree(cell.blocks ?? getLayoutCellBlocks(cell), blockId, (nestedBlock) => ({
        ...nestedBlock,
        ...firstBlock,
        id: nestedBlock.id,
      }));
      let afterBlockId = blockId;
      for (const parsedBlock of restBlocks) {
        nextBlocks = insertBlockAfterInTree(nextBlocks, afterBlockId, parsedBlock);
        afterBlockId = parsedBlock.id;
      }
      updateCellBlocks(cell.id, nextBlocks);
      focusLayoutCellBlock(restBlocks.at(-1)?.id ?? blockId, true);
    },
    [updateCellBlocks],
  );

  const applyCellSlashCommand = useCallback(
    (command: Exclude<SlashCommand, { kind: "media-picker" }>) => {
      if (!cellSlashMenu) return;
      const targetCell = cells.find((cell) => cell.id === cellSlashMenu.cellId);
      if (!targetCell) return;
      const targetBlocks = targetCell.blocks ?? getLayoutCellBlocks(targetCell);

      setCellSlashMenu(null);

      if (command.kind === "inline") {
        updateCellBlocks(targetCell.id, updateBlockInTree(targetBlocks, cellSlashMenu.blockId, (nestedBlock) => ({
          ...nestedBlock,
          content: appendInlineText(nestedBlock.content, command.insertText),
        })));
        return;
      }

      if (command.kind === "create-page") {
        updateCellBlocks(targetCell.id, updateBlockInTree(targetBlocks, cellSlashMenu.blockId, (nestedBlock) => ({
          ...nestedBlock,
          content: stripSlashQuery(nestedBlock.content),
        })));
        return;
      }

      const blockType = command.blockType;
      updateCellBlocks(targetCell.id, updateBlockInTree(targetBlocks, cellSlashMenu.blockId, (nestedBlock) => ({
        ...nestedBlock,
        type: blockType,
        content: blockType === "equation"
          ? "E = mc^2"
          : stripSlashQuery(nestedBlock.content),
        color: command.kind === "turn-into" ? command.calloutIcon : nestedBlock.color,
        placeholderText: command.kind === "turn-into" ? command.placeholderText : nestedBlock.placeholderText,
      })));
      focusLayoutCellBlock(cellSlashMenu.blockId);
    },
    [cellSlashMenu, cells, updateCellBlocks],
  );

  return (
    <section className="my-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-secondary)] p-2">
      <div className="mb-2 flex flex-wrap items-center gap-1 text-xs">
        <button type="button" onClick={() => setSettingsOpen((value) => !value)} className="rounded-md px-2 py-1 text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)]">⚙️ Grid</button>
        <button type="button" onClick={addCell} className="rounded-md px-2 py-1 text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)]">+ Cell</button>
        <button type="button" onClick={() => updateConfig({ showGuides: !config.showGuides })} className="rounded-md px-2 py-1 text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)]">📐 Guides</button>
        <button type="button" onClick={() => updateConfig({ preview: !config.preview })} className="rounded-md px-2 py-1 text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)]">👁 Preview</button>
        <button type="button" onClick={() => updateConfig({ wrap: !config.wrap })} className="rounded-md px-2 py-1 text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)]">↔ {config.wrap ? "Wrap" : "No-wrap"}</button>
        <button type="button" onClick={() => updateConfig({ autoReflow: !config.autoReflow })} className="rounded-md px-2 py-1 text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)]">⇄ {config.autoReflow ? "Auto" : "Manual"}</button>
      </div>

      {settingsOpen ? (
        <div className="mb-2 grid grid-cols-2 gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-primary)] p-2 text-xs md:grid-cols-5">
          {([
            ["columns", "Columns", 1, 24],
            ["rows", "Rows", 1, 48],
            ["columnGap", "Column gap", 0, 48],
            ["rowGap", "Row gap", 0, 48],
            ["rowHeight", "Row height", 48, 320],
          ] as const).map(([key, label, min, max]) => (
            <label key={key} className="flex flex-col gap-1 text-[var(--color-ink-muted)]">
              {label}
              <input
                type="number"
                min={min}
                max={max}
                value={config[key]}
                onChange={(event) => updateConfig({ [key]: Number(event.target.value) } as Partial<LayoutConfig>)}
                className="rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1 text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
              />
            </label>
          ))}
        </div>
      ) : null}

      <div className={config.wrap ? "overflow-x-hidden" : "overflow-x-auto pb-2"}>
        <div
          data-layout-grid
          className="relative grid min-h-[360px] rounded-lg bg-[var(--color-surface-primary)] p-2"
          style={{
            width: config.wrap ? "100%" : `${Math.max(960, config.columns * 88)}px`,
            gridTemplateColumns: `repeat(${config.columns}, minmax(0, 1fr))`,
            gridAutoRows: `${config.rowHeight}px`,
            gap: `${config.rowGap}px ${config.columnGap}px`,
            backgroundImage: config.showGuides && !config.preview
              ? "linear-gradient(var(--color-line) 1px, transparent 1px), linear-gradient(90deg, var(--color-line) 1px, transparent 1px)"
              : undefined,
            backgroundSize: config.showGuides && !config.preview
              ? `calc((100% - ${(config.columns - 1) * config.columnGap}px) / ${config.columns} + ${config.columnGap}px) ${config.rowHeight + config.rowGap}px`
              : undefined,
          }}
        >
          {cells.length === 0 ? (
            <button
              type="button"
              onClick={addCell}
              className="col-span-full row-span-2 rounded-lg border border-dashed border-[var(--color-line)] text-sm text-[var(--color-ink-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-ink)]"
            >
              + Create first layout cell
            </button>
          ) : null}

          {cells.map((cell) => (
            <section
              key={cell.id}
              aria-label="Layout cell"
              className="group/cell relative rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-secondary)] p-2 shadow-sm"
              style={{
                gridColumn: `${cell.colStart} / span ${cell.colSpan}`,
                gridRow: `${cell.rowStart} / span ${cell.rowSpan}`,
                color: cell.textColor,
                backgroundColor: cell.backgroundColor,
              }}
            >
              {config.preview ? null : (
                <button
                  type="button"
                  onClick={() => removeCell(cell.id)}
                  aria-label="Delete layout cell"
                  className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded text-[var(--color-ink-faint)] opacity-0 hover:bg-[var(--color-surface-hover)] hover:text-red-600 group-hover/cell:opacity-100"
                >
                  ×
                </button>
              )}
              <LayoutCellBlockTree
                blocks={cell.blocks ?? getLayoutCellBlocks(cell)}
                pageId={pageId}
                cell={cell}
                isPreview={config.preview || cell.type === "spacer"}
                onChange={handleCellBlockChange}
                onKeyDown={handleCellBlockKeyDown}
                onPaste={handleCellBlockPaste}
                onUpdateBlock={(blockIdToUpdate, updates) => {
                  const nextBlocks = updateBlockInTree(cell.blocks ?? getLayoutCellBlocks(cell), blockIdToUpdate, (nestedBlock) => ({
                    ...nestedBlock,
                    ...updates,
                  }));
                  updateCellBlocks(cell.id, nextBlocks);
                }}
                onRequestSlashMenu={(nestedBlockId, position) =>
                  setCellSlashMenu({ cellId: cell.id, blockId: nestedBlockId, position, filter: "" })
                }
              />
              {config.preview ? null : (
                <>
                  <div onPointerDown={(event) => startResize(event, cell, "x")} className="absolute bottom-3 right-0 top-3 w-2 cursor-ew-resize opacity-0 group-hover/cell:opacity-100" />
                  <div onPointerDown={(event) => startResize(event, cell, "y")} className="absolute bottom-0 left-3 right-3 h-2 cursor-ns-resize opacity-0 group-hover/cell:opacity-100" />
                  <div onPointerDown={(event) => startResize(event, cell, "both")} className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize rounded-tl border-l border-t border-[var(--color-line)] bg-[var(--color-surface-primary)] opacity-0 group-hover/cell:opacity-100" />
                </>
              )}
            </section>
          ))}
        </div>
      </div>

      {cellSlashMenu ? (
        <SlashCommandMenu
          key={`${cellSlashMenu.cellId}:${cellSlashMenu.filter}`}
          position={cellSlashMenu.position}
          filter={cellSlashMenu.filter}
          onSelect={applyCellSlashCommand}
          onMediaSelect={() => setCellSlashMenu(null)}
          onClose={() => setCellSlashMenu(null)}
        />
      ) : null}
    </section>
  );
};

interface LayoutCellBlockTreeProps {
  blocks: Block[];
  pageId: string;
  cell: LayoutCell;
  isPreview: boolean;
  parentBlockType?: Block["type"] | null;
  numberedDepth?: number;
  onChange: (cell: LayoutCell, blockId: string, text: string) => void;
  onKeyDown: (event: React.KeyboardEvent, cell: LayoutCell, block: Block) => void;
  onPaste: (event: React.ClipboardEvent, cell: LayoutCell, blockId: string) => void;
  onUpdateBlock: (blockId: string, updates: Partial<Block>) => void;
  onRequestSlashMenu: (blockId: string, position: { x: number; y: number }) => void;
}

const LayoutCellBlockTree: React.FC<LayoutCellBlockTreeProps> = ({
  blocks,
  pageId,
  cell,
  isPreview,
  parentBlockType = null,
  numberedDepth = 0,
  onChange,
  onKeyDown,
  onPaste,
  onUpdateBlock,
  onRequestSlashMenu,
}) => {
  let numberedCounter = 0;

  return (
    <div className={`min-h-full pr-5 ${isPreview ? "pointer-events-none" : ""}`}>
      {blocks.map((nestedBlock) => {
        const numberedIndex = nestedBlock.type === "numbered_list" ? ++numberedCounter : 0;
        if (nestedBlock.type !== "numbered_list") numberedCounter = 0;
        const nextNumberedDepth = nestedBlock.type === "numbered_list" ? numberedDepth + 1 : numberedDepth;
        const renderChildren = () => {
          if (!nestedBlock.children?.length) return null;
          return (
            <div className={parentBlockType === "column" ? "mt-0.5" : "ml-6 mt-0.5"}>
              <LayoutCellBlockTree
                blocks={nestedBlock.children}
                pageId={pageId}
                cell={cell}
                isPreview={isPreview}
                parentBlockType={nestedBlock.type}
                numberedDepth={nextNumberedDepth}
                onChange={onChange}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                onUpdateBlock={onUpdateBlock}
                onRequestSlashMenu={onRequestSlashMenu}
              />
            </div>
          );
        };

        return (
          <div
            key={nestedBlock.id}
            data-layout-cell-block-id={nestedBlock.id}
            data-block-id={nestedBlock.id}
            data-block-type={nestedBlock.type}
            className="rounded-md px-1 hover:bg-[var(--color-surface-primary)] focus-within:bg-[var(--color-surface-primary)]"
            style={getBlockSurfaceStyle(nestedBlock)}
          >
            <BlockEditor
              pageId={pageId}
              block={nestedBlock}
              numberedIndex={numberedIndex}
              numberedDepth={numberedDepth}
              onChange={(text) => onChange(cell, nestedBlock.id, text)}
              onKeyDown={(event) => onKeyDown(event, cell, nestedBlock)}
              onPaste={(event) => onPaste(event, cell, nestedBlock.id)}
              onUpdateBlock={onUpdateBlock}
              onDeleteCodeBlock={() => onUpdateBlock(nestedBlock.id, { type: "paragraph", content: "" })}
              focusBlock={focusLayoutCellBlock}
              onRequestSlashMenu={(position) => onRequestSlashMenu(nestedBlock.id, position)}
              renderChildren={renderChildren}
            />
            {shouldRenderLayoutCellChildren(nestedBlock) ? renderChildren() : null}
          </div>
        );
      })}
    </div>
  );
};
