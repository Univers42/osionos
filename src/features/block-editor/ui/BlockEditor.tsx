/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   BlockEditor.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/05 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/12 18:59:04 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, Code, Copy, Eye } from "lucide-react";
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
import { TableBlockEditor } from "./table/TableBlockEditor";

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

const RENDERABLE_LANGUAGES = new Set(["mermaid"]);

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

const CODE_LINE_HEIGHT = 24;
const CODE_MIN_LINES = 3;

function startCodeDrag(move: (e: PointerEvent) => void, up: () => void, cancel: () => void) {
  document.body.style.cursor = "ns-resize";
  document.body.style.userSelect = "none";
  globalThis.addEventListener("pointermove", move);
  globalThis.addEventListener("pointerup", up, { once: true });
  globalThis.addEventListener("pointercancel", cancel, { once: true });
}
function stopCodeDrag(move: (e: PointerEvent) => void, up: () => void, cancel: () => void) {
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
  globalThis.removeEventListener("pointermove", move);
  globalThis.removeEventListener("pointerup", up);
  globalThis.removeEventListener("pointercancel", cancel);
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
  onBeforeStructuralEdit?: () => void;
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
  onBeforeStructuralEdit,
  focusBlock,
  onRequestSlashMenu,
  renderChildren,
}) => {
  const updateBlock = usePageStore((s) => s.updateBlock);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showCalloutIconPicker, setShowCalloutIconPicker] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [dragHeightLines, setDragHeightLines] = useState<number | null>(null);
  const [isEquationEditing, setIsEquationEditing] = useState(false);
  const equationTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const langPickerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const codeHighlightRef = useRef<HTMLDivElement | null>(null);
  const codeBodyRef = useRef<HTMLDivElement | null>(null);
  const activeDragRef = useRef<{ move: (e: PointerEvent) => void; up: () => void; cancel: () => void } | null>(null);
  const editableStyle = useMemo(
    () => getBlockTextStyle(block),
    [block],
  );
  const surfaceStyle = useMemo(
    () => getBlockSurfaceStyle(block),
    [block],
  );
  const codeView = (block.codeView ?? "preview") as "preview" | "source";
  const isRenderable = RENDERABLE_LANGUAGES.has(block.language ?? "");
  const codeCaretColor = editableStyle?.color ?? "var(--osio-fg-default)";
  const activeHeightLines = dragHeightLines ?? (block.heightLines as number | undefined);
  const codeHeightPx = activeHeightLines
    ? activeHeightLines * CODE_LINE_HEIGHT + CODE_LINE_HEIGHT
    : undefined;
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

  const handleResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startHeightPx = codeBodyRef.current?.offsetHeight ?? 150;
    let latestLines = Math.max(CODE_MIN_LINES, Math.round((startHeightPx - CODE_LINE_HEIGHT) / CODE_LINE_HEIGHT));
    let move: (ev: PointerEvent) => void;
    let up: () => void;
    let cancel: () => void;
    move = (ev: PointerEvent) => {
      const newPx = startHeightPx + ev.clientY - startY;
      latestLines = Math.max(CODE_MIN_LINES, Math.round((newPx - CODE_LINE_HEIGHT) / CODE_LINE_HEIGHT));
      setDragHeightLines(latestLines);
    };
    up = () => {
      stopCodeDrag(move, up, cancel);
      activeDragRef.current = null;
      commitBlockUpdate(block.id, { heightLines: latestLines });
    };
    cancel = () => {
      stopCodeDrag(move, up, cancel);
      activeDragRef.current = null;
      setDragHeightLines(null);
    };
    activeDragRef.current = { move, up, cancel };
    startCodeDrag(move, up, cancel);
  }, [block.id, commitBlockUpdate]);

  useEffect(() => {
    const ta = textareaRef.current;
    const hl = codeHighlightRef.current;
    if (!ta || !hl) return;
    const sync = () => { hl.scrollLeft = ta.scrollLeft; hl.scrollTop = ta.scrollTop; };
    ta.addEventListener("scroll", sync, { passive: true });
    return () => ta.removeEventListener("scroll", sync);
  }, [codeView]);

  useEffect(() => {
    setDragHeightLines(null);
  }, [block.heightLines]);

  useEffect(() => {
    return () => {
      const d = activeDragRef.current;
      if (d) stopCodeDrag(d.move, d.up, d.cancel);
    };
  }, []);

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
        e.target instanceof Node &&
        !langPickerRef.current.contains(e.target)
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
          className="text-2xl font-bold text-[var(--osio-fg-default)] leading-tight"
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
          className="text-xl font-semibold text-[var(--osio-fg-default)] leading-tight"
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
          className="text-lg font-semibold text-[var(--osio-fg-default)] leading-snug"
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
          className="text-base font-semibold text-[var(--osio-fg-default)] leading-snug"
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
          className="text-sm font-semibold text-[var(--osio-fg-default)] leading-snug"
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
          className="text-xs font-semibold text-[var(--osio-fg-muted)] leading-snug tracking-wide"
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
        <div className="my-1 rounded-lg border border-dashed border-[var(--osio-border-default)] px-2 py-2">
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
          className="my-2 overflow-visible rounded-md border border-[var(--osio-border-default)] shadow-sm relative"
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
            <div className="flex items-center gap-1">
              {isRenderable && (
                <button
                  type="button"
                  title={codeView === "preview" ? "Show source" : "Show preview"}
                  className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
                  onClick={() =>
                    commitBlockUpdate(block.id, {
                      codeView: codeView === "preview" ? "source" : "preview",
                    })
                  }
                >
                  {codeView === "preview" ? <Code size={14} /> : <Eye size={14} />}
                </button>
              )}
              <button
                type="button"
                title="Copy code"
                className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
                onClick={handleCopyCode}
              >
                {copiedCode ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>
          <div ref={codeBodyRef} className="p-0">
            {isRenderable && codeView === "preview" ? (
              <div style={codeHeightPx ? { height: codeHeightPx, overflow: "auto" } : undefined}>
                <MermaidDiagram
                  chart={block.content}
                  className="rounded-b-md p-4 overflow-x-auto"
                />
              </div>
            ) : (
              <div
                className="relative"
                style={codeHeightPx
                  ? { height: codeHeightPx, overflow: "hidden" }
                  : { minHeight: 150 }}
              >
                <div
                  ref={codeHighlightRef}
                  className="overflow-x-auto"
                  style={codeHeightPx ? { overflowY: "hidden" } : undefined}
                >
                  <CodeSyntaxHighlight
                    code={block.content || " "}
                    language={block.language}
                    className="pointer-events-none p-3"
                    codeClassName="block whitespace-pre font-mono text-sm leading-6"
                  />
                </div>
                <textarea
                  ref={textareaRef}
                  value={block.content}
                  onChange={(e) => onChange(e.target.value)}
                  onKeyDown={handleCodeTextareaKeyDown}
                  placeholder={getBlockPlaceholder(block, "Code…")}
                  spellCheck={false}
                  className="absolute inset-0 h-full w-full overflow-auto bg-transparent p-3 font-mono text-sm leading-6 text-transparent outline-none selection:bg-[rgba(35,131,226,0.28)] placeholder:text-[var(--osio-fg-subtle)]"
                  style={{
                    tabSize: 2,
                    color: "transparent",
                    caretColor: codeCaretColor,
                    WebkitTextFillColor: "transparent",
                    whiteSpace: "pre",
                  }}
                />
              </div>
            )}
          </div>
          <div
            className="absolute bottom-0 right-0 h-4 w-4 cursor-ns-resize"
            onPointerDown={handleResizePointerDown}
          />
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
          data-table-block-shell
          aria-label="Table block"
        >
          <div className="osio-block-scroll-x">
            <TableBlockEditor
              block={block}
              pageId={pageId}
              style={editableStyle}
              textStyle={editableStyle}
              onDeleteTable={onDeleteCodeBlock}
              onBeforeStructuralEdit={onBeforeStructuralEdit}
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

