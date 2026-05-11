/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   BlockEditor.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/05 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/11 16:05:14 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, Copy } from "lucide-react";
import { AssetRenderer } from "@univers42/ui-collection";
import katex from "katex";
import "katex/dist/katex.min.css";

import { EditableContent } from "@/components/blocks/EditableContent";
import { DatabaseBlock } from "@/widgets/database-view/ui/DatabaseBlock";
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
import type { SurfaceBlockEditorProps } from "./BlockEditorSurface";
import { LayoutBlockEditor } from "./canvas";

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

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const nextValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(nextValue)) return fallback;
  return Math.max(min, Math.min(max, Math.round(nextValue)));
}

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
  const renderSurfaceBlockEditor = useCallback((props: SurfaceBlockEditorProps) => <BlockEditor {...props} />, []);

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
      return (
        <LayoutBlockEditor
          block={block}
          pageId={pageId}
          onUpdateBlock={commitBlockUpdate}
          renderBlockEditor={renderSurfaceBlockEditor}
        />
      );

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
          <div className="osio-block-scroll-x">
            <TableBlockEditor
              block={block}
              pageId={pageId}
              style={editableStyle}
              textStyle={editableStyle}
              onDeleteTable={onDeleteCodeBlock}
            />
          </div>
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
          <div className="osio-block-scroll-x">
            <DatabaseBlock
              databaseId={block.databaseId}
              initialViewId={block.viewId}
              mode="inline"
            />
          </div>
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
          <div className="osio-block-scroll-x h-full">
            <DatabaseBlock
              databaseId={block.databaseId}
              initialViewId={block.viewId}
              mode="full"
            />
          </div>
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
