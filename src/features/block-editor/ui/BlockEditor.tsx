/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   BlockEditor.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/05 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/09 20:57:58 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, Copy, Grid3X3, Plus, SlidersHorizontal } from "lucide-react";
import { AssetRenderer } from "@univers42/ui-collection";
import katex from "katex";
import "katex/dist/katex.min.css";

import { EditableContent } from "@/components/blocks/EditableContent";
import { DatabaseBlock } from "@/widgets/database-view/ui/DatabaseBlock";
import { createViewShowcaseCells } from "@/widgets/database-view/model/databaseViewCatalog";
import {
  getBlockPlaceholder,
  type Block,
} from "@/entities/block";

import { usePageStore } from "@/store/usePageStore";
import { MermaidDiagram, CodeSyntaxHighlight, EmojiPicker } from "@/shared/ui";
import { getNumberedMarker, getBulletMarker } from "@/entities/block/model/listMarkers";
import { MediaBlockEditor } from "./MediaBlockEditor";
import { TodoBlockEditor } from "./TodoBlockEditor";
import { ToggleBlockEditor } from "./ToggleBlockEditor";
import { getBlockSurfaceStyle, getBlockTextStyle } from "../model/blockColors";
import { BlockEditorSurface, type SurfaceBlockEditorProps } from "./BlockEditorSurface";

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



type LayoutMode = "inline" | "full_page";
type LayoutGuideVisibility = "auto" | "always" | "never";
type LayoutCellSizing = "fixed" | "auto-height" | "auto-width" | "auto";
type LayoutCellHorizontalConstraint = "left" | "stretch" | "scale";
type LayoutCellVerticalConstraint = "top" | "stretch" | "hug";
type LayoutCellPadding = "compact" | "comfortable" | "spacious";
type LayoutCellFontSize = "small" | "base" | "large";

interface LayoutConfig {
  columns: number;
  rows: number;
  gap: number;
  rowHeight: number;
  wrap: boolean;
  autoArrange: boolean;
  snapToGrid: boolean;
  guideVisibility: LayoutGuideVisibility;
  preview: boolean;
  theme: "default" | "compact" | "spacious";
}

interface LayoutCell {
  id: string;
  colStart: number;
  colSpan: number;
  rowStart: number;
  rowSpan: number;
  label?: string;
  tint?: string;
  blocks: Block[];
  type?: "text" | "color" | "spacer";
  content?: string;
  blockType?: Block["type"];
  textColor?: string;
  backgroundColor?: string;
  sizing?: LayoutCellSizing;
  horizontalConstraint?: LayoutCellHorizontalConstraint;
  verticalConstraint?: LayoutCellVerticalConstraint;
  wrap?: boolean;
  padding?: LayoutCellPadding;
  fontSize?: LayoutCellFontSize;
}

const LAYOUT_CELL_COLOR_SWATCHES = [
  { label: "Surface", backgroundColor: "var(--osio-bg-surface)", textColor: "var(--osio-fg-default)" },
  { label: "Blue", backgroundColor: "color-mix(in srgb, #2563eb 8%, var(--osio-bg-surface))", textColor: "var(--osio-fg-default)" },
  { label: "Green", backgroundColor: "color-mix(in srgb, #0f766e 10%, var(--osio-bg-surface))", textColor: "var(--osio-fg-default)" },
  { label: "Gold", backgroundColor: "color-mix(in srgb, #b45309 10%, var(--osio-bg-surface))", textColor: "var(--osio-fg-default)" },
  { label: "Rose", backgroundColor: "color-mix(in srgb, #be123c 8%, var(--osio-bg-surface))", textColor: "var(--osio-fg-default)" },
];

const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
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
};
const LAYOUT_CELL_DND_TYPE = "application/x-osionos-layout-cell-id";

const LAYOUT_CONFIG_LIMITS = {
  columns: [1, 24],
  rows: [1, 96],
  gap: [0, 48],
  rowHeight: [96, 320],
} as const;

const CELL_MIN_CONTENT_WIDTH = 280;
const CELL_COMFORTABLE_WIDTH = 480;
const CELL_MIN_ROW_HEIGHT = 96;

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const nextValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(nextValue)) return fallback;
  return Math.max(min, Math.min(max, Math.round(nextValue)));
}

function sanitizeLayoutConfig(config: Partial<LayoutConfig> | undefined): LayoutConfig {
  const legacyConfig = config as (Partial<LayoutConfig> & {
    columnGap?: number;
    rowGap?: number;
    autoReflow?: boolean;
    showGuides?: boolean;
  }) | undefined;
  const merged = legacyConfig
    ? { ...DEFAULT_LAYOUT_CONFIG, ...config }
    : DEFAULT_LAYOUT_CONFIG;
  const legacyGap = legacyConfig?.columnGap ?? legacyConfig?.rowGap;
  const guideVisibility = merged.guideVisibility
    ?? (legacyConfig?.showGuides === false ? "never" : "auto");
  return {
    columns: clampNumber(merged.columns, ...LAYOUT_CONFIG_LIMITS.columns, DEFAULT_LAYOUT_CONFIG.columns),
    rows: clampNumber(merged.rows, ...LAYOUT_CONFIG_LIMITS.rows, DEFAULT_LAYOUT_CONFIG.rows),
    gap: clampNumber(merged.gap ?? legacyGap, ...LAYOUT_CONFIG_LIMITS.gap, DEFAULT_LAYOUT_CONFIG.gap),
    rowHeight: clampNumber(merged.rowHeight, ...LAYOUT_CONFIG_LIMITS.rowHeight, DEFAULT_LAYOUT_CONFIG.rowHeight),
    wrap: Boolean(merged.wrap),
    autoArrange: merged.autoArrange ?? legacyConfig?.autoReflow ?? DEFAULT_LAYOUT_CONFIG.autoArrange,
    snapToGrid: merged.snapToGrid ?? DEFAULT_LAYOUT_CONFIG.snapToGrid,
    guideVisibility: guideVisibility === "always" || guideVisibility === "never" ? guideVisibility : "auto",
    preview: Boolean(merged.preview),
    theme: merged.theme ?? DEFAULT_LAYOUT_CONFIG.theme,
  };
}

function clampLayoutCell(cell: LayoutCell, config: LayoutConfig): LayoutCell {
  const colSpan = clampNumber(cell.colSpan, 1, config.columns, 1);
  return {
    ...cell,
    colSpan,
    rowSpan: clampNumber(cell.rowSpan, Math.max(1, Math.ceil(CELL_MIN_ROW_HEIGHT / config.rowHeight)), config.rows, 1),
    colStart: clampNumber(cell.colStart, 1, Math.max(1, config.columns - colSpan + 1), 1),
    rowStart: clampNumber(cell.rowStart, 1, config.rows, 1),
    type: cell.type ?? "text",
    content: typeof cell.content === "string" ? cell.content : "",
    blocks: getLayoutCellBlocks(cell),
    sizing: cell.sizing ?? "fixed",
    horizontalConstraint: cell.horizontalConstraint ?? "stretch",
    verticalConstraint: cell.verticalConstraint ?? "top",
    wrap: cell.wrap !== false,
    padding: cell.padding ?? "comfortable",
    fontSize: cell.fontSize ?? "base",
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
        blocks: [],
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
  return config.autoArrange ? packLayoutCells(clampedCells, config) : clampedCells;
}

function getLayoutConfig(block: Block): LayoutConfig {
  const storedConfig = block.layoutConfig as Partial<LayoutConfig> | undefined;
  return sanitizeLayoutConfig(storedConfig);
}

function getLayoutMode(block: Block): LayoutMode {
  return block.layoutMode === "full_page" ? "full_page" : "inline";
}

function dataFlag(condition: boolean): "true" | undefined {
  return condition ? "true" : undefined;
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

interface BlockEditorProps {
  pageId: string;
  block: Block;
  numberedIndex: number;
  numberedDepth: number;
  bulletDepth: number;
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
  bulletDepth,
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
  const [copiedCode, setCopiedCode] = useState(false);
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
  const codeCaretColor = editableStyle?.color ?? "var(--osio-fg-default)";

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

  const handleCopyCode = useCallback(() => {
    navigator.clipboard.writeText(block.content).then(() => {
      setCopiedCode(true);
      globalThis.setTimeout(() => setCopiedCode(false), 1200);
    }).catch(() => undefined);
  }, [block.content]);

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
          className="text-2xl font-bold text-[var(--osio-fg-default)] mt-6 mb-1 leading-tight"
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
          className="text-xl font-semibold text-[var(--osio-fg-default)] mt-5 mb-1 leading-tight"
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
          className="text-lg font-semibold text-[var(--osio-fg-default)] mt-4 mb-0.5 leading-snug"
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
          className="text-base font-semibold text-[var(--osio-fg-default)] mt-3 mb-0.5 leading-snug"
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
          className="text-sm font-semibold text-[var(--osio-fg-default)] mt-2 mb-0.5 leading-snug"
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
          className="text-xs font-semibold text-[var(--osio-fg-muted)] mt-2 mb-0.5 leading-snug tracking-wide"
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
          className="text-sm text-[var(--osio-fg-default)] leading-relaxed py-0.5 min-h-[1.5em]"
          style={editableStyle}
          placeholder={getBlockPlaceholder(block, "Type '/' for commands…")}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onRequestSlashMenu={onRequestSlashMenu}
          pageId={pageId}
        />
      );

    case "bulleted_list": {
      const bulletStyle = getBulletMarker(bulletDepth);
      return (
        <div className="flex items-start gap-2 pl-5">
          <span className="text-sm leading-relaxed py-0.5 select-none shrink-0 w-6 text-center">
            {bulletStyle === "disc" && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--osio-fg-subtle)] mt-[7px]" />
            )}
            {bulletStyle === "circle" && (
              <span className="inline-block w-1.5 h-1.5 rounded-full border border-[var(--osio-fg-subtle)] mt-[7px]" />
            )}
            {bulletStyle === "square" && (
              <span className="inline-block w-1.5 h-1.5 bg-[var(--osio-fg-subtle)] mt-[7px]" />
            )}
          </span>
          <div className="flex-1">
            <EditableContent
              content={block.content}
              className="text-sm text-[var(--osio-fg-default)] leading-relaxed py-0.5 whitespace-pre-wrap"
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
    }

    case "numbered_list":
      return (
        <div className="flex items-start gap-2 pl-5">
          <span className="text-sm leading-relaxed py-0.5 text-[var(--osio-fg-muted)] select-none shrink-0 w-6 text-center font-medium">
            {getNumberedMarker(numberedIndex, numberedDepth)}
          </span>
          <div className="flex-1">
            <EditableContent
              content={block.content}
              className="text-sm text-[var(--osio-fg-default)] leading-relaxed py-0.5 whitespace-pre-wrap"
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
        <div className="my-1 rounded-lg border border-dashed border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 py-2">
          {renderChildren?.() ?? (
            <span className="text-xs text-[var(--osio-fg-subtle)]">Columns</span>
          )}
        </div>
      );

    case "column":
      return (
        <div className="min-h-10 rounded-md border border-dashed border-[var(--osio-border-default)] px-2 py-1">
          {renderChildren?.() ?? (
            <span className="text-xs text-[var(--osio-fg-subtle)]">Empty column</span>
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
        <div
          className="my-2 overflow-visible rounded-md border border-[var(--osio-border-default)] shadow-sm"
          style={surfaceStyle}
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--osio-border-default)] bg-black/[0.03] px-3 py-1.5">
            <div ref={langPickerRef} className="relative">
              <button
                type="button"
                onClick={() => setShowLangPicker((v) => !v)}
                className="rounded px-1.5 py-0.5 font-mono text-xs text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
              >
                {block.language || "plaintext"}
              </button>
              {showLangPicker && (
                <div className="absolute top-full left-0 mt-1 bg-[var(--osio-bg-surface)] border border-[var(--osio-border-default)] rounded-lg shadow-lg z-[var(--osio-z-popover)] max-h-48 overflow-y-auto w-40">
                  {LANGUAGES.map((language) => (
                    <button
                      key={language}
                      type="button"
                      onClick={() => handleLangSelect(language)}
                      className={[
                        "w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-[var(--osio-bg-hover)]",
                        language === (block.language || "plaintext")
                          ? "bg-[var(--osio-bg-subtle)] text-[var(--osio-fg-default)]"
                          : "text-[var(--osio-fg-muted)]",
                      ].join(" ")}
                    >
                      {language}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              title="Copy code"
              className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
              onClick={handleCopyCode}
            >
              {copiedCode ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <div className="p-0">
            <div className="relative min-h-[150px] overflow-hidden">
              <CodeSyntaxHighlight
                code={block.content || " "}
                language={block.language}
                className="pointer-events-none min-h-[150px] overflow-hidden p-3"
                codeClassName="block min-h-[150px] whitespace-pre-wrap break-words font-mono text-sm leading-6"
              />
              <textarea
                value={block.content}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleCodeTextareaKeyDown}
                placeholder={getBlockPlaceholder(block, "Code…")}
                spellCheck={false}
                className="absolute inset-0 h-full min-h-[150px] w-full resize-y overflow-auto bg-transparent p-3 font-mono text-sm leading-6 text-transparent outline-none selection:bg-[rgba(35,131,226,0.28)] placeholder:text-[var(--osio-fg-subtle)]"
                style={{
                  tabSize: 2,
                  color: "transparent",
                  caretColor: codeCaretColor,
                  WebkitTextFillColor: "transparent",
                }}
              />
            </div>
            {isMermaidCode && block.content.trim() && (
              <div className="mt-3 pt-3 border-t border-[var(--osio-border-default)]">
                <p className="mb-2 font-mono text-xs text-[var(--osio-fg-muted)]">
                  Mermaid preview
                </p>
                <MermaidDiagram
                  chart={block.content}
                  className="rounded-md border border-[var(--osio-border-default)] p-3 bg-[var(--osio-bg-subtle)] overflow-x-auto"
                />
              </div>
            )}
          </div>
        </div>
      );

    case "quote":
      return (
        <div className="flex my-0.5 rounded-md px-1">
          <div className="w-1 bg-[var(--osio-fg-default)] rounded-full shrink-0 mr-3" style={editableStyle} />
          <div className="flex-1 min-w-0">
            <EditableContent
              content={block.content}
              className="text-sm text-[var(--osio-fg-muted)] leading-relaxed py-0.5 italic"
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
      return (
        <div
          className="my-0.5 flex items-start gap-3 rounded-lg border border-[var(--osio-border-default)] p-3"
          style={surfaceStyle}
        >
          <div className="relative shrink-0">
            <button
              type="button"
              className="inline-flex cursor-pointer items-center justify-center rounded text-[var(--osio-fg-default)]"
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
              className="py-0.5 text-sm leading-relaxed text-[var(--osio-fg-default)]"
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
          className="relative my-2 rounded-lg border border-[var(--osio-border-default)] p-3"
          style={surfaceStyle}
        >
          {shouldEditEquation ? null : (
            <button
              type="button"
              aria-label="Edit equation"
              className="absolute inset-0 z-[var(--osio-z-raised)] cursor-text rounded-lg bg-transparent"
              onClick={openEquationEditor}
            />
          )}
          <div
            className="overflow-x-auto text-[var(--osio-fg-default)]"
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
              className="mt-2 min-h-[56px] w-full resize-y rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-3 py-2 font-mono text-xs text-[var(--osio-fg-default)] outline-none focus:border-[var(--osio-accent)]"
              style={editableStyle}
            />
          ) : null}
        </div>
      );
    }

    case "layout":
      return <LayoutBlockEditor block={block} pageId={pageId} onUpdateBlock={commitBlockUpdate} />;

    case "divider":
      return (
        <button
          type="button"
          className="w-full py-2 rounded outline-none focus:bg-[var(--osio-bg-subtle)]"
          onKeyDown={(e) => {
            onKeyDown(e);
          }}
          aria-label="Divider block"
        >
          <hr className="w-full h-px border-0 bg-[var(--osio-fg-subtle)]" />
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
            style={editableStyle}
            textStyle={editableStyle}
            onDeleteTable={onDeleteCodeBlock}
          />
        </div>
      );

    case "database_inline":
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
            mode="inline"
          />
        </div>
      );

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
          aria-label="Full-page database block"
          className="my-3 min-h-[520px] overflow-hidden rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)]"
        >
          <DatabaseBlock
            databaseId={block.databaseId}
            initialViewId={block.viewId}
            mode="full"
          />
        </div>
      );

    default:
      return (
        <EditableContent
          content={block.content}
          className="text-sm text-[var(--osio-fg-default)] leading-relaxed py-0.5"
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

  const tableContextMenuStyle = useMemo<React.CSSProperties>(() => {
    if (!contextMenu) return {};
    const width = 180;
    const height = 160;
    const viewportWidth = globalThis.innerWidth;
    const viewportHeight = globalThis.innerHeight;
    const left = clampNumber(contextMenu.x, 8, viewportWidth - width - 8, 8);
    const belowTop = contextMenu.y;
    const aboveTop = contextMenu.y - height;
    const top = belowTop + height > viewportHeight - 8 && aboveTop > 8
      ? aboveTop
      : clampNumber(belowTop, 8, viewportHeight - height - 8, 8);
    return { left, top };
  }, [contextMenu]);

  return (
    <div className="group/table my-2 border border-[var(--osio-border-default)] rounded-lg overflow-visible relative" style={style}>
      <div className="overflow-auto max-h-[26rem]">
        <table className="w-max min-w-full text-sm">
          <tbody>
            {data.map((row, ri) => (
              <tr
                key={`row-${ri}`} // NOSONAR - positional keys are correct for table grid cells
                className={
                  ri === 0
                    ? "bg-[var(--osio-bg-subtle)] font-medium"
                    : ""
                }
              >
                {row.map((cell, ci) => (
                  <td
                    key={`cell-${ri}-${ci}`} // NOSONAR - positional keys are correct for table grid cells
                    className="border-b border-r border-[var(--osio-border-default)] last:border-r-0 px-0 py-0 min-w-[120px] text-[var(--osio-fg-default)]"
                    style={textStyle}
                    onContextMenu={(e) => openContextMenu(e, ri, ci)}
                  >
                    <input
                      type="text"
                      value={cell}
                      onChange={(e) => handleCellChange(ri, ci, e.target.value)}
                      className="w-full bg-transparent px-3 py-1.5 outline-none focus:bg-[var(--osio-bg-hover)]"
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
        className="absolute -right-3 top-1/2 z-[var(--osio-z-raised)] flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] text-sm text-[var(--osio-fg-muted)] opacity-0 shadow-sm transition-opacity hover:bg-[var(--osio-bg-subtle)] hover:text-[var(--osio-fg-default)] group-hover/table:opacity-100"
      >
        +
      </button>
      <button
        type="button"
        onClick={addRow}
        aria-label="Add row"
        className="absolute -bottom-3 left-1/2 z-[var(--osio-z-raised)] flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] text-sm text-[var(--osio-fg-muted)] opacity-0 shadow-sm transition-opacity hover:bg-[var(--osio-bg-subtle)] hover:text-[var(--osio-fg-default)] group-hover/table:opacity-100"
      >
        +
      </button>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-[var(--osio-z-popover)] min-w-[180px] rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] shadow-lg py-1"
          style={tableContextMenuStyle}
        >
          <button
            type="button"
            onClick={() => {
              removeRow(contextMenu.row);
              setContextMenu(null);
            }}
            disabled={data.length <= 1}
            className="w-full px-3 py-1.5 text-left text-sm text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-subtle)] disabled:opacity-40 disabled:cursor-not-allowed"
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
            className="w-full px-3 py-1.5 text-left text-sm text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-subtle)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Delete column
          </button>
          <div className="my-1 border-t border-[var(--osio-border-default)]" />
          <button
            type="button"
            onClick={() => {
              onDeleteTable?.();
              setContextMenu(null);
            }}
            disabled={!onDeleteTable}
            className="w-full px-3 py-1.5 text-left text-sm text-[var(--osio-danger)] hover:bg-[var(--osio-bg-subtle)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Delete table
          </button>
        </div>
      )}
    </div>
  );
};

const LayoutBlockEditor: React.FC<{
  block: Block;
  pageId: string;
  onUpdateBlock?: (blockId: string, updates: Partial<Block>) => void;
}> = ({ block, pageId, onUpdateBlock }) => {
  const updateBlock = usePageStore((s) => s.updateBlock);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resizingCell, setResizingCell] = useState<{ id: string; colSpan: number; rowSpan: number } | null>(null);
  const [draggingCellId, setDraggingCellId] = useState<string | null>(null);
  const [cellDropTargetId, setCellDropTargetId] = useState<string | null>(null);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const config = getLayoutConfig(block);
  const layoutMode = getLayoutMode(block);
  const cells = useMemo(() => normalizeLayoutCells(getLayoutCells(block), config), [block, config]);
  const selectedCell = useMemo(
    () => cells.find((cell) => cell.id === selectedCellId) ?? null,
    [cells, selectedCellId],
  );
  const renderBlockEditor = useCallback((props: SurfaceBlockEditorProps) => <BlockEditor {...props} />, []);

  const updateLayout = useCallback(
    (updates: Partial<Pick<Block, "layoutConfig" | "layoutCells" | "layoutMode">>) => {
      if (onUpdateBlock) {
        onUpdateBlock(block.id, updates);
        return;
      }
      updateBlock(pageId, block.id, updates);
    },
    [block.id, onUpdateBlock, pageId, updateBlock],
  );

  const updateConfig = useCallback(
    (patch: Partial<LayoutConfig>) => {
      const nextConfig = sanitizeLayoutConfig({ ...config, ...patch });
      updateLayout({ layoutConfig: nextConfig, layoutCells: normalizeLayoutCells(cells, nextConfig) });
    },
    [cells, config, updateLayout],
  );

  const updateCells = useCallback((nextCells: LayoutCell[]) => {
    updateLayout({ layoutCells: normalizeLayoutCells(nextCells, config) });
  }, [config, updateLayout]);

  const addCell = useCallback((template?: Partial<LayoutCell>) => {
    const grid = document.querySelector<HTMLElement>(`[data-layout-grid="${block.id}"]`);
    const columnWidth = Math.max(1, (grid?.getBoundingClientRect().width ?? 960) / config.columns);
    const comfortableSpan = Math.max(1, Math.ceil(CELL_COMFORTABLE_WIDTH / columnWidth));
    const colSpan = Math.min(config.columns, Math.max(template?.colSpan ?? comfortableSpan, Math.ceil(CELL_MIN_CONTENT_WIDTH / columnWidth)));
    const rowSpan = Math.max(1, template?.rowSpan ?? 2);
    const placement = findLayoutPlacement(cells, config, colSpan, rowSpan);
    const nextCell: LayoutCell = {
      id: crypto.randomUUID(),
      colStart: template?.colStart ?? placement.colStart,
      colSpan,
      rowStart: template?.rowStart ?? placement.rowStart,
      rowSpan,
      label: template?.label,
      tint: template?.tint,
      textColor: template?.textColor,
      backgroundColor: template?.backgroundColor,
      sizing: template?.sizing ?? "fixed",
      horizontalConstraint: template?.horizontalConstraint ?? "stretch",
      verticalConstraint: template?.verticalConstraint ?? "top",
      wrap: template?.wrap !== false,
      padding: template?.padding ?? "comfortable",
      fontSize: template?.fontSize ?? "base",
      type: "text",
      content: "",
      blocks: template?.blocks ?? [{ id: crypto.randomUUID(), type: "paragraph", content: "" }],
    };
    updateCells(config.autoArrange ? packLayoutCells([...cells, nextCell], config) : [...cells, nextCell]);
  }, [block.id, cells, config, updateCells]);

  const applyTemplate = useCallback((kind: "dashboard" | "tracker" | "notes" | "kanban") => {
    const createCell = (partial: Omit<LayoutCell, "id" | "type" | "content">): LayoutCell => ({
      id: crypto.randomUUID(),
      type: "text",
      content: "",
      ...partial,
    });
    const heading = (text: string): Block[] => [{ id: crypto.randomUUID(), type: "heading_3", content: text }];
    const templates: Record<typeof kind, LayoutCell[]> = {
      dashboard: createViewShowcaseCells(),
      tracker: [
        createCell({ colStart: 1, colSpan: 4, rowStart: 1, rowSpan: 5, label: "Sidebar", blocks: heading("Tracker") }),
        createCell({ colStart: 5, colSpan: 8, rowStart: 1, rowSpan: 2, label: "Now", blocks: heading("Now") }),
        createCell({ colStart: 5, colSpan: 4, rowStart: 3, rowSpan: 2, label: "Status", blocks: heading("Status") }),
        createCell({ colStart: 9, colSpan: 4, rowStart: 3, rowSpan: 2, label: "Risks", blocks: heading("Risks") }),
      ],
      notes: [
        createCell({ colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 4, label: "Left", blocks: heading("Notes") }),
        createCell({ colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 4, label: "Right", blocks: heading("References") }),
      ],
      kanban: ["Backlog", "Doing", "Review", "Done"].map((label, index) => createCell({
        colStart: index * 3 + 1,
        colSpan: 3,
        rowStart: 1,
        rowSpan: 4,
        label,
        blocks: heading(label),
      })),
    };
    updateCells(templates[kind]);
  }, [updateCells]);

  const updateCell = useCallback((cellId: string, patch: Partial<LayoutCell>) => {
    updateCells(cells.map((cell) => (cell.id === cellId ? { ...cell, ...patch } : cell)));
  }, [cells, updateCells]);

  const removeCell = useCallback((cellId: string) => updateCells(cells.filter((cell) => cell.id !== cellId)), [cells, updateCells]);

  const updateSelectedCell = useCallback((patch: Partial<LayoutCell>) => {
    if (!selectedCellId) return;
    updateCell(selectedCellId, patch);
  }, [selectedCellId, updateCell]);

  const duplicateCell = useCallback((cell: LayoutCell) => {
    addCell({
      label: cell.label ? `${cell.label} copy` : undefined,
      colSpan: cell.colSpan,
      rowSpan: cell.rowSpan,
      tint: cell.tint,
      textColor: cell.textColor,
      backgroundColor: cell.backgroundColor,
      sizing: cell.sizing,
      horizontalConstraint: cell.horizontalConstraint,
      verticalConstraint: cell.verticalConstraint,
      wrap: cell.wrap,
      padding: cell.padding,
      fontSize: cell.fontSize,
      blocks: structuredClone(cell.blocks).map((nestedBlock) => ({ ...nestedBlock, id: crypto.randomUUID() })),
    });
  }, [addCell]);

  const reorderCellByDrop = useCallback((draggedCellId: string, targetCellId: string) => {
    if (draggedCellId === targetCellId) return;
    const draggedCell = cells.find((cell) => cell.id === draggedCellId);
    const targetCell = cells.find((cell) => cell.id === targetCellId);
    if (!draggedCell || !targetCell) return;
    updateCells(cells.map((cell) => {
      if (cell.id === draggedCellId) {
        return {
          ...cell,
          colStart: targetCell.colStart,
          colSpan: targetCell.colSpan,
          rowStart: targetCell.rowStart,
          rowSpan: targetCell.rowSpan,
        };
      }
      if (cell.id === targetCellId) {
        return {
          ...cell,
          colStart: draggedCell.colStart,
          colSpan: draggedCell.colSpan,
          rowStart: draggedCell.rowStart,
          rowSpan: draggedCell.rowSpan,
        };
      }
      return cell;
    }));
  }, [cells, updateCells]);

  const startResize = useCallback((event: React.PointerEvent<HTMLDivElement>, cell: LayoutCell, axis: "x" | "y" | "both") => {
    event.preventDefault();
    event.stopPropagation();
    const container = event.currentTarget.closest<HTMLElement>("[data-layout-grid]");
    const rect = container?.getBoundingClientRect();
    if (!rect) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const columnWidth = Math.max(1, rect.width / config.columns);
    const rowHeight = Math.max(CELL_MIN_ROW_HEIGHT, config.rowHeight);
    const minColSpan = Math.max(1, Math.ceil(CELL_MIN_CONTENT_WIDTH / columnWidth));
    const minRowSpan = Math.max(1, Math.ceil(CELL_MIN_ROW_HEIGHT / rowHeight));

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const colDelta = Math.round((moveEvent.clientX - startX) / columnWidth);
      const rowDelta = Math.round((moveEvent.clientY - startY) / rowHeight);
      let nextColSpan = cell.colSpan;
      let nextRowSpan = cell.rowSpan;
      if (axis === "x" || axis === "both") {
        nextColSpan = Math.max(minColSpan, Math.min(config.columns - cell.colStart + 1, cell.colSpan + colDelta));
      }
      if (axis === "y" || axis === "both") {
        nextRowSpan = Math.max(minRowSpan, cell.rowSpan + rowDelta);
      }
      setResizingCell({ id: cell.id, colSpan: nextColSpan, rowSpan: nextRowSpan });
      updateCell(cell.id, { colSpan: nextColSpan, rowSpan: nextRowSpan });
    };

    const handlePointerUp = () => {
      globalThis.removeEventListener("pointermove", handlePointerMove);
      globalThis.removeEventListener("pointerup", handlePointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setResizingCell(null);
    };

    let cursor = "nwse-resize";
    if (axis === "x") cursor = "ew-resize";
    if (axis === "y") cursor = "ns-resize";
    document.body.style.cursor = cursor;
    document.body.style.userSelect = "none";
    globalThis.addEventListener("pointermove", handlePointerMove);
    globalThis.addEventListener("pointerup", handlePointerUp, { once: true });
  }, [config.columns, config.rowHeight, updateCell]);

  const shouldShowGuides = !config.preview && config.guideVisibility !== "never";
  const modeClass = layoutMode === "full_page" ? "osionos-layout-block--full-page" : "osionos-layout-block--inline";

  return (
    <section className={`osionos-layout-block ${modeClass}`} data-layout-mode={layoutMode}>
      <div className="osionos-layout-shell">
        <button
          type="button"
          aria-label="Layout settings"
          title="Layout settings"
          className="osionos-layout-settings-tab"
          onClick={() => setSettingsOpen((value) => !value)}
        >
          ⚙
        </button>

        <div className="osionos-layout-toolbar" aria-label="Layout tools">
          <button type="button" onClick={() => addCell()}>
            <Plus size={14} aria-hidden />
            <span>Add cell</span>
          </button>
          <button type="button" onClick={() => applyTemplate("dashboard")}>
            <Grid3X3 size={14} aria-hidden />
            <span>Dashboard</span>
          </button>
          <button type="button" onClick={() => setSelectedCellId((current) => current ?? cells[0]?.id ?? null)}>
            <SlidersHorizontal size={14} aria-hidden />
            <span>Inspector</span>
          </button>
          <button type="button" onClick={() => updateConfig({ guideVisibility: config.guideVisibility === "never" ? "auto" : "never" })}>
            <Grid3X3 size={14} aria-hidden />
            <span>{config.guideVisibility === "never" ? "Show grid" : "Hide grid"}</span>
          </button>
        </div>

        {settingsOpen ? (
          <aside className="osionos-layout-settings-panel" aria-label="Layout settings">
            <LayoutNumberControl label="Columns" value={config.columns} min={1} max={24} onChange={(columns) => updateConfig({ columns })} />
            <LayoutNumberControl label="Row height" value={config.rowHeight} min={96} max={320} suffix="px" onChange={(rowHeight) => updateConfig({ rowHeight })} />
            <LayoutNumberControl label="Gap" value={config.gap} min={0} max={48} suffix="px" onChange={(gap) => updateConfig({ gap })} />
            <LayoutToggle label="Wrap" checked={config.wrap} onChange={(wrap) => updateConfig({ wrap })} />
            <LayoutToggle label="Auto-arrange" checked={config.autoArrange} onChange={(autoArrange) => updateConfig({ autoArrange })} />
            <LayoutToggle label="Snap to grid" checked={config.snapToGrid} onChange={(snapToGrid) => updateConfig({ snapToGrid })} />
            <LayoutSegmented
              label="Guides"
              value={config.guideVisibility}
              options={["auto", "always", "never"]}
              onChange={(guideVisibility) => updateConfig({ guideVisibility })}
            />
            <LayoutSegmented
              label="Mode"
              value={config.preview ? "view" : "edit"}
              options={["edit", "view"]}
              onChange={(mode) => updateConfig({ preview: mode === "view" })}
            />
            <LayoutSegmented
              label="Canvas"
              value={layoutMode === "full_page" ? "full" : "inline"}
              options={["inline", "full"]}
              onChange={(mode) => updateLayout({ layoutMode: mode === "full" ? "full_page" : "inline" })}
            />
          </aside>
        ) : null}

        {selectedCell && !config.preview ? (
          <LayoutCellInspector
            cell={selectedCell}
            onUpdate={updateSelectedCell}
            onClose={() => setSelectedCellId(null)}
          />
        ) : null}

        <div className={config.wrap ? "overflow-x-hidden" : "overflow-x-auto pb-2"}>
          <div
            data-layout-grid={block.id}
            className="osionos-layout-grid"
            style={{
              width: config.wrap ? "100%" : `${Math.max(960, config.columns * CELL_MIN_CONTENT_WIDTH)}px`,
              gridTemplateColumns: `repeat(${config.columns}, minmax(0, 1fr))`,
              gridAutoRows: `minmax(${config.rowHeight}px, auto)`,
              gap: `${config.gap}px`,
              backgroundImage: shouldShowGuides
                ? "linear-gradient(color-mix(in srgb, var(--osio-accent) 22%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--osio-accent) 22%, transparent) 1px, transparent 1px)"
                : undefined,
              backgroundSize: shouldShowGuides
                ? `calc((100% - ${(config.columns - 1) * config.gap}px) / ${config.columns} + ${config.gap}px) ${config.rowHeight + config.gap}px`
                : undefined,
            }}
          >
            {cells.length === 0 ? (
              <LayoutEmptyState onAdd={() => addCell()} onTemplate={applyTemplate} />
            ) : null}

            {cells.map((cell) => {
              const cellMinHeight = cell.rowSpan * config.rowHeight + Math.max(0, cell.rowSpan - 1) * config.gap;
              const cellStyle = {
                gridColumn: `${cell.colStart} / span ${cell.colSpan}`,
                gridRow: `${cell.rowStart} / span ${cell.rowSpan}`,
                color: cell.textColor,
                backgroundColor: cell.backgroundColor,
                "--osionos-layout-cell-min-height": `${cellMinHeight}px`,
              } as React.CSSProperties;

              return (
              <section
                key={cell.id}
                aria-label={cell.label || "Layout cell"}
                className="osionos-layout-cell group/cell"
                data-layout-cell-id={cell.id}
                data-layout-cell-selected={dataFlag(selectedCellId === cell.id)}
                data-layout-cell-dragging={dataFlag(draggingCellId === cell.id)}
                data-layout-cell-drop-target={dataFlag(cellDropTargetId === cell.id)}
                data-layout-sizing={cell.sizing ?? "fixed"}
                data-layout-wrap={cell.wrap === false ? "false" : "true"}
                data-layout-padding={cell.padding ?? "comfortable"}
                data-layout-font-size={cell.fontSize ?? "base"}
                style={cellStyle}
                onFocusCapture={() => setSelectedCellId(cell.id)}
                onDragOver={(event) => {
                  if (!event.dataTransfer.types.includes(LAYOUT_CELL_DND_TYPE)) return;
                  event.preventDefault();
                  event.stopPropagation();
                  event.dataTransfer.dropEffect = "move";
                  setCellDropTargetId(cell.id);
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node)) setCellDropTargetId(null);
                }}
                onDrop={(event) => {
                  const draggedCellId = event.dataTransfer.getData(LAYOUT_CELL_DND_TYPE);
                  if (!draggedCellId) return;
                  event.preventDefault();
                  event.stopPropagation();
                  reorderCellByDrop(draggedCellId, cell.id);
                  setDraggingCellId(null);
                  setCellDropTargetId(null);
                }}
              >
                {config.preview ? null : (
                  <LayoutCellHandleBar
                    cell={cell}
                    liveSize={resizingCell?.id === cell.id ? resizingCell : null}
                    onDragStart={() => setDraggingCellId(cell.id)}
                    onDragEnd={() => { setDraggingCellId(null); setCellDropTargetId(null); }}
                    onRename={(label) => updateCell(cell.id, { label })}
                    onAddCell={() => addCell()}
                    onInspect={() => setSelectedCellId(cell.id)}
                    onDuplicate={() => duplicateCell(cell)}
                    onDelete={() => removeCell(cell.id)}
                  />
                )}
                <div className="osionos-layout-cell-editor">
                  <BlockEditorSurface
                    pageId={pageId}
                    source={{ kind: "cell", pageId, layoutBlockId: block.id, cellId: cell.id }}
                    locked={config.preview || cell.type === "spacer"}
                    compact
                    emptyPlaceholder="Type / for blocks, [[ for pages…"
                    renderBlockEditor={renderBlockEditor}
                  />
                </div>
                {config.preview ? null : (
                  <>
                    <div onPointerDown={(event) => startResize(event, cell, "x")} className="osionos-layout-resize-handle osionos-layout-resize-handle--x" />
                    <div onPointerDown={(event) => startResize(event, cell, "y")} className="osionos-layout-resize-handle osionos-layout-resize-handle--y" />
                    <div onPointerDown={(event) => startResize(event, cell, "both")} className="osionos-layout-resize-handle osionos-layout-resize-handle--both" />
                  </>
                )}
              </section>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

const LayoutNumberControl: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, suffix, onChange }) => (
  <label className="osionos-layout-control-row">
    <span>{label}</span>
    <span className="osionos-layout-number-input">
      <input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      {suffix ? <span>{suffix}</span> : null}
    </span>
  </label>
);

const LayoutToggle: React.FC<{ label: string; checked: boolean; onChange: (checked: boolean) => void }> = ({ label, checked, onChange }) => (
  <label className="osionos-layout-control-row">
    <span>{label}</span>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
  </label>
);

const LayoutSegmented = <T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) => (
  <div className="osionos-layout-control-row osionos-layout-control-row--stacked">
    <span>{label}</span>
    <div className="osionos-layout-segmented">
      {options.map((option) => (
        <button key={option} type="button" data-active={option === value ? "true" : undefined} onClick={() => onChange(option)}>
          {option}
        </button>
      ))}
    </div>
  </div>
);

const LayoutEmptyState: React.FC<{
  onAdd: () => void;
  onTemplate: (template: "dashboard" | "tracker" | "notes" | "kanban") => void;
}> = ({ onAdd, onTemplate }) => (
  <div className="osionos-layout-empty-state">
    <div className="text-3xl" aria-hidden>▦</div>
    <p className="text-sm font-medium text-[var(--osio-fg-default)]">Add cells to your layout</p>
    <div className="flex flex-wrap justify-center gap-2">
      <button type="button" onClick={onAdd}>+ Cell</button>
      <button type="button" onClick={() => onTemplate("dashboard")}>Use dashboard</button>
    </div>
    <div className="flex flex-wrap justify-center gap-1 text-xs text-[var(--osio-fg-subtle)]">
      <button type="button" onClick={() => onTemplate("kanban")}>Kanban</button>
      <span>·</span>
      <button type="button" onClick={() => onTemplate("tracker")}>Tracker</button>
      <span>·</span>
      <button type="button" onClick={() => onTemplate("notes")}>Two-column notes</button>
    </div>
  </div>
);

const LayoutCellInspector: React.FC<{
  cell: LayoutCell;
  onUpdate: (patch: Partial<LayoutCell>) => void;
  onClose: () => void;
}> = ({ cell, onUpdate, onClose }) => (
  <aside className="osionos-layout-cell-inspector" aria-label="Cell inspector">
    <div className="osionos-layout-inspector-header">
      <div>
        <p>Cell inspector</p>
        <span>{cell.label || "Untitled cell"}</span>
      </div>
      <button type="button" onClick={onClose} aria-label="Close cell inspector">×</button>
    </div>

    <LayoutSegmented<LayoutCellSizing>
      label="Auto-layout"
      value={cell.sizing ?? "fixed"}
      options={["fixed", "auto-height", "auto-width", "auto"]}
      onChange={(sizing) => onUpdate({ sizing })}
    />
    <LayoutSegmented<LayoutCellHorizontalConstraint>
      label="Width constraint"
      value={cell.horizontalConstraint ?? "stretch"}
      options={["left", "stretch", "scale"]}
      onChange={(horizontalConstraint) => onUpdate({ horizontalConstraint })}
    />
    <LayoutSegmented<LayoutCellVerticalConstraint>
      label="Height constraint"
      value={cell.verticalConstraint ?? "top"}
      options={["top", "stretch", "hug"]}
      onChange={(verticalConstraint) => onUpdate({ verticalConstraint })}
    />
    <LayoutToggle label="Wrap content" checked={cell.wrap !== false} onChange={(wrap) => onUpdate({ wrap })} />
    <LayoutSegmented<LayoutCellPadding>
      label="Padding"
      value={cell.padding ?? "comfortable"}
      options={["compact", "comfortable", "spacious"]}
      onChange={(padding) => onUpdate({ padding })}
    />
    <LayoutSegmented<LayoutCellFontSize>
      label="Text size"
      value={cell.fontSize ?? "base"}
      options={["small", "base", "large"]}
      onChange={(fontSize) => onUpdate({ fontSize })}
    />
    <LayoutNumberControl label="Column span" value={cell.colSpan} min={1} max={12} onChange={(colSpan) => onUpdate({ colSpan })} />
    <LayoutNumberControl label="Row span" value={cell.rowSpan} min={1} max={24} onChange={(rowSpan) => onUpdate({ rowSpan })} />

    <div className="osionos-layout-control-row osionos-layout-control-row--stacked">
      <span>Color</span>
      <div className="osionos-layout-swatches">
        {LAYOUT_CELL_COLOR_SWATCHES.map((swatch) => (
          <button
            key={swatch.label}
            type="button"
            aria-label={`${swatch.label} cell color`}
            title={swatch.label}
            className="osionos-layout-swatch"
            style={{ backgroundColor: swatch.backgroundColor }}
            onClick={() => onUpdate({ backgroundColor: swatch.backgroundColor, textColor: swatch.textColor })}
          />
        ))}
      </div>
    </div>
  </aside>
);

const LayoutCellHandleBar: React.FC<{
  cell: LayoutCell;
  liveSize: { colSpan: number; rowSpan: number } | null;
  onDragStart: () => void;
  onDragEnd: () => void;
  onRename: (label: string) => void;
  onAddCell: () => void;
  onInspect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}> = ({ cell, liveSize, onDragStart, onDragEnd, onRename, onAddCell, onInspect, onDuplicate, onDelete }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [labelDraft, setLabelDraft] = useState(cell.label ?? "");
  const size = liveSize ?? cell;

  return (
    <div className="osionos-layout-cell-handle" data-layout-cell-handle>
      <button
        type="button"
        draggable
        className="osionos-layout-cell-drag"
        title="Drag cell"
        aria-label="Drag cell"
        onDragStart={(event) => {
          event.dataTransfer.setData(LAYOUT_CELL_DND_TYPE, cell.id);
          event.dataTransfer.effectAllowed = "move";
          onDragStart();
        }}
        onDragEnd={onDragEnd}
      >⋮⋮</button>
      <input
        value={labelDraft}
        onChange={(event) => setLabelDraft(event.target.value)}
        onBlur={() => onRename(labelDraft.trim())}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
            event.currentTarget.closest<HTMLElement>("[data-layout-cell-id]")?.querySelector<HTMLElement>('[contenteditable="true"], textarea')?.focus();
          }
        }}
        placeholder="Untitled cell"
        aria-label="Cell title"
      />
      <span className="osionos-layout-size-badge">⤢ {size.colSpan}×{size.rowSpan}</span>
      <div className="relative">
        <button type="button" onClick={() => setMenuOpen((value) => !value)} aria-label="Cell menu" title="Cell menu">⋯</button>
        {menuOpen ? (
          <div className="osionos-layout-cell-menu">
            <button type="button" onClick={() => { onAddCell(); setMenuOpen(false); }}>Add cell</button>
            <button type="button" onClick={() => { onInspect(); setMenuOpen(false); }}>Inspect</button>
            <button type="button" onClick={() => { onDuplicate(); setMenuOpen(false); }}>Duplicate</button>
            <button type="button" onClick={() => { onDelete(); setMenuOpen(false); }}>Delete</button>
          </div>
        ) : null}
      </div>
    </div>
  );
};
