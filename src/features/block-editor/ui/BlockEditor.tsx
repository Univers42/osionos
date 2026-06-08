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
import { Check, Code, Copy, Eye, Hash, Moon, Sun } from "lucide-react";
import { EquationView } from "@/shared/ui/EquationView";

import { EditableContent } from "@/components/blocks/EditableContent";
import { DatabaseBlock } from "@/widgets/database-view/ui/DatabaseBlock";
import {
  getBlockPlaceholder,
  calloutAccent,
  calloutDisplayIcon,
  calloutSurface,
  resolveCalloutType,
  type Block,
} from "@/entities/block";

import { usePageStore } from "@/store/usePageStore";
import { MermaidDiagram, CodeSyntaxHighlight, IconValueView } from "@/shared/ui";
import { getNumberedMarker, getBulletMarker } from "@/entities/block/model/listMarkers";
import { MediaBlockEditor } from "./MediaBlockEditor";
import { TodoBlockEditor } from "./TodoBlockEditor";
import { ToggleBlockEditor } from "./ToggleBlockEditor";
import { BlockCollapseToggle } from "./BlockCollapseToggle";
import { CalloutTypePicker } from "./CalloutTypePicker";
import { BlockListCollapse } from "./BlockListCollapse";
import { CodeGutter } from "@/entities/block/ui/CodeGutter";
import { getToggleHeadingClass } from "@/entities/block/model/toggleHeading";
import { getBlockSurfaceStyle, getBlockTextStyle } from "../model/blockColors";
import type { SurfaceBlockEditorProps } from "./BlockEditorSurface";
import { LayoutBlockEditor } from "./canvas";
import { TableBlockEditor } from "./table/TableBlockEditor";

const LANGUAGES = [
  "plaintext", "mermaid",
  "javascript", "typescript", "python", "java", "c", "cpp", "csharp", "go",
  "rust", "ruby", "php", "swift", "kotlin", "scala", "dart", "lua", "perl",
  "r", "julia", "haskell", "elixir", "erlang", "clojure", "scheme", "lisp",
  "ocaml", "fsharp", "bash", "powershell", "dos", "sql", "graphql", "yaml",
  "json", "html", "xml", "css", "scss", "less", "markdown", "dockerfile",
  "makefile", "toml", "nginx", "apache", "diff", "http", "protobuf", "groovy",
  "objectivec", "matlab", "vbnet",
];

const RENDERABLE_LANGUAGES = new Set(["mermaid"]);


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
  const [langQuery, setLangQuery] = useState("");
  const [showCalloutIconPicker, setShowCalloutIconPicker] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [dragHeightLines, setDragHeightLines] = useState<number | null>(null);
  const [isEquationEditing, setIsEquationEditing] = useState(false);
  const equationTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const langPickerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const codeHighlightRef = useRef<HTMLDivElement | null>(null);
  const codeGutterRef = useRef<HTMLDivElement | null>(null);
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
  const codeCaretColor = "var(--osio-code-caret)";
  const codeShowLineNumbers = Boolean(block.lineNumbers);
  const codeLineCount = Math.max(1, (block.content || "").split("\n").length);
  const codeLnDigits = String(codeLineCount).length;
  // Gutter column width and the matching left offset for the code + textarea so
  // their text starts just past the gutter (ch units keep both perfectly aligned).
  const codeGutterWidth = `calc(${codeLnDigits}ch + 2.5rem)`;
  const codeTextLeft = codeShowLineNumbers ? `calc(${codeLnDigits}ch + 3.25rem)` : "1rem";
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
      setLangQuery("");
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
    const sync = () => {
      const code = hl.querySelector("code");
      if (code) (code as HTMLElement).scrollLeft = ta.scrollLeft;
      hl.scrollTop = ta.scrollTop;
      // Keep the (pinned) line-number gutter aligned with vertical scroll.
      const gutter = codeGutterRef.current;
      if (gutter) gutter.style.transform = `translateY(${-ta.scrollTop}px)`;
    };
    ta.addEventListener("scroll", sync, { passive: true });
    return () => ta.removeEventListener("scroll", sync);
  // block.heightLines: re-register after committed resize so the listener is
  // guaranteed present when hl first becomes scrollable, regardless of what
  // mount/unmount sequences occurred before the drag completed.
  }, [codeView, block.heightLines, block.lineNumbers]);

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

  const codeBlockHeader = useMemo(
    () => (
      <div className="flex items-center gap-2 rounded-t-xl border-b border-[var(--osio-code-border)] bg-[var(--osio-code-header-bg)] px-3 py-2">
        <div className="flex shrink-0 items-center gap-2.5">
          <span aria-hidden className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          </span>
          <div ref={langPickerRef} className="relative">
            <button
              type="button"
              onClick={() => setShowLangPicker((v) => !v)}
              className="rounded-md border border-[var(--osio-code-border)] bg-[var(--osio-code-chip-bg)] px-2 py-0.5 font-mono text-[11px] font-medium tracking-wide text-[var(--osio-code-fg-muted)] transition-colors hover:bg-[var(--osio-code-btn-hover)] hover:text-[var(--osio-code-fg)]"
            >
              {block.language || "plaintext"}
            </button>
            {showLangPicker && (
              <div className="absolute top-full left-0 mt-1.5 w-48 overflow-hidden rounded-lg border border-[var(--osio-code-border)] bg-[var(--osio-code-bg)] shadow-xl z-[var(--osio-z-popover)] osio-code-card">
                <input
                  autoFocus
                  value={langQuery}
                  onChange={(e) => setLangQuery(e.target.value)}
                  placeholder="Search language…"
                  aria-label="Search code language"
                  name="code-language-search"
                  autoComplete="off"
                  className="w-full border-b border-[var(--osio-code-border)] bg-transparent px-3 py-2 font-mono text-xs text-[var(--osio-code-fg)] outline-none placeholder:text-[var(--osio-code-fg-muted)]"
                />
                <div className="max-h-48 overflow-y-auto py-1">
                  {LANGUAGES.filter((language) => language.includes(langQuery.trim().toLowerCase())).map((language) => (
                    <button
                      key={language}
                      type="button"
                      onClick={() => handleLangSelect(language)}
                      className={[
                        "flex w-full items-center justify-between px-3 py-1.5 text-left font-mono text-xs transition-colors hover:bg-[var(--osio-code-btn-hover)]",
                        language === (block.language || "plaintext")
                          ? "text-[var(--osio-code-fg)]"
                          : "text-[var(--osio-code-fg-muted)]",
                      ].join(" ")}
                    >
                      {language}
                      {language === (block.language || "plaintext") && <Check size={12} className="text-[#3fb950]" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <input
          value={block.fileName ?? ""}
          onChange={(event) => commitBlockUpdate(block.id, { fileName: event.target.value })}
          placeholder="Untitled"
          aria-label="Code file name"
          name="code-file-name"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-[var(--osio-code-fg)] outline-none placeholder:text-[var(--osio-code-fg-muted)]"
        />
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            title="Toggle line numbers"
            aria-pressed={codeShowLineNumbers}
            className={[
              "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--osio-code-btn-hover)]",
              codeShowLineNumbers
                ? "bg-[var(--osio-code-btn-active)] text-[var(--osio-code-fg)]"
                : "text-[var(--osio-code-fg-muted)] hover:text-[var(--osio-code-fg)]",
            ].join(" ")}
            onClick={() => commitBlockUpdate(block.id, { lineNumbers: !codeShowLineNumbers })}
          >
            <Hash size={13} />
          </button>
          <button
            type="button"
            title={block.codeTheme === "light" ? "Switch to dark" : "Switch to light"}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--osio-code-fg-muted)] transition-colors hover:bg-[var(--osio-code-btn-hover)] hover:text-[var(--osio-code-fg)]"
            onClick={() => commitBlockUpdate(block.id, { codeTheme: block.codeTheme === "light" ? "dark" : "light" })}
          >
            {block.codeTheme === "light" ? <Moon size={13} /> : <Sun size={13} />}
          </button>
          {isRenderable && (
            <button
              type="button"
              title={codeView === "preview" ? "Show source" : "Show preview"}
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-[var(--osio-code-fg-muted)] transition-colors hover:bg-[var(--osio-code-btn-hover)] hover:text-[var(--osio-code-fg)]"
              onClick={() =>
                commitBlockUpdate(block.id, {
                  codeView: codeView === "preview" ? "source" : "preview",
                })
              }
            >
              {codeView === "preview" ? <><Code size={13} /> Source</> : <><Eye size={13} /> Preview</>}
            </button>
          )}
          <button
            type="button"
            title="Copy code"
            className={[
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-colors hover:bg-[var(--osio-code-btn-hover)]",
              copiedCode ? "text-[#3fb950]" : "text-[var(--osio-code-fg-muted)] hover:text-[var(--osio-code-fg)]",
            ].join(" ")}
            onClick={handleCopyCode}
          >
            {copiedCode ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
          </button>
        </div>
      </div>
    ),
    [block.language, block.id, block.fileName, block.codeTheme, codeShowLineNumbers, showLangPicker, langQuery, isRenderable, codeView, copiedCode, handleLangSelect, commitBlockUpdate, handleCopyCode, langPickerRef],
  );

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
        <div className="group relative flex items-start gap-2 pl-5">
          {block.children?.length ? (
            <BlockListCollapse
              collapsed={block.collapsed}
              onToggle={() => commitBlockUpdate(block.id, { collapsed: !block.collapsed })}
            />
          ) : null}
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
        <div className="group relative flex items-start gap-2 pl-5">
          {block.children?.length ? (
            <BlockListCollapse
              collapsed={block.collapsed}
              onToggle={() => commitBlockUpdate(block.id, { collapsed: !block.collapsed })}
            />
          ) : null}
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
      // Borderless like Notion: the flex row + resize handles (in renderChildren)
      // carry the structure. No outer box, so columns don't nest borders/offset.
      return (
        <div className="my-1">
          {renderChildren?.() ?? (
            <span className="text-xs text-[var(--osio-fg-subtle)]">Columns</span>
          )}
        </div>
      );

    case "column":
      return (
        <div className="min-h-10">
          {renderChildren?.() ?? (
            <span className="text-xs text-[var(--osio-fg-subtle)] italic">Empty column</span>
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
          data-code-theme={block.codeTheme ?? "dark"}
          className="osio-code-card group/code relative my-3 rounded-xl border border-[var(--osio-code-border)] bg-[var(--osio-code-bg)] shadow-[var(--osio-code-shadow)] ring-1 ring-inset ring-[var(--osio-code-ring)]"
        >
          {codeBlockHeader}
          <div ref={codeBodyRef} className="overflow-hidden rounded-b-xl">
            {isRenderable && codeView === "preview" ? (
              <div style={codeHeightPx ? { height: codeHeightPx, overflow: "auto" } : undefined}>
                <MermaidDiagram
                  chart={block.content}
                  className="overflow-x-auto bg-white p-4"
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
                  className="overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  style={codeHeightPx ? { height: codeHeightPx } : undefined}
                >
                  <CodeSyntaxHighlight
                    code={block.content || " "}
                    language={block.language}
                    className="pointer-events-none py-4 pr-4"
                    style={{ paddingLeft: codeTextLeft }}
                    codeClassName="block whitespace-pre font-mono text-sm leading-6 [tab-size:2]"
                  />
                </div>
                <textarea
                  ref={textareaRef}
                  value={block.content}
                  onChange={(e) => onChange(e.target.value)}
                  onKeyDown={handleCodeTextareaKeyDown}
                  placeholder={getBlockPlaceholder(block, "Code…")}
                  aria-label="Code editor"
                  name="code-editor"
                  autoComplete="off"
                  spellCheck={false}
                  className="absolute inset-0 h-full w-full overflow-auto bg-transparent py-4 pr-4 font-mono text-sm leading-6 text-transparent outline-none selection:bg-[var(--osio-code-selection)] placeholder:text-[var(--osio-code-fg-muted)]"
                  style={{
                    tabSize: 2,
                    color: "transparent",
                    caretColor: codeCaretColor,
                    WebkitTextFillColor: "transparent",
                    whiteSpace: "pre",
                    paddingLeft: codeTextLeft,
                  }}
                />
                {codeShowLineNumbers && (
                  <div
                    className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden border-r border-[var(--osio-code-border)] bg-[var(--osio-code-bg)]"
                    style={{ width: codeGutterWidth }}
                  >
                    <CodeGutter ref={codeGutterRef} lineCount={codeLineCount} className="will-change-transform" />
                  </div>
                )}
              </div>
            )}
          </div>
          <div
            className="absolute bottom-1 right-1 h-3.5 w-3.5 cursor-ns-resize rounded-sm opacity-0 transition-opacity group-hover/code:opacity-100 z-[1] bg-[linear-gradient(135deg,transparent_50%,var(--osio-code-fg-muted)_50%,var(--osio-code-fg-muted)_60%,transparent_60%,transparent_72%,var(--osio-code-fg-muted)_72%,var(--osio-code-fg-muted)_82%,transparent_82%)]"
            onPointerDown={handleResizePointerDown}
          />
        </div>
      );

    case "quote":
      return (
        <div className="flex my-0.5 rounded-md px-1">
          {block.children?.length ? (
            <BlockCollapseToggle collapsed={block.collapsed} onToggle={() => commitBlockUpdate(block.id, { collapsed: !block.collapsed })} />
          ) : null}
          <div className="w-1 bg-[var(--osio-fg-default)] rounded-full shrink-0 mr-3" style={editableStyle} />
          <div className="flex-1 min-w-0">
            <EditableContent
              content={block.content}
              className={`${getToggleHeadingClass(block.headingLevel)} text-[var(--osio-fg-muted)] leading-relaxed py-0.5 italic`}
              style={editableStyle}
              placeholder="Quote… end a line with “— Source” to add a citation"
              onChange={onChange}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onRequestSlashMenu={onRequestSlashMenu}
            />
            {!block.collapsed && renderChildren?.()}
          </div>
        </div>
      );

    case "callout": {
      // WYSIWYG: tint the surface + border + icon from the resolved semantic type while
      // editing (read-only used to be the only place colour appeared). Body text stays default.
      const calloutType = resolveCalloutType(block.color);
      const accent = calloutAccent(calloutType);
      const hasChildren = Boolean(block.children?.length);
      return (
        <div
          role="note"
          aria-label={`${calloutType.label} callout`}
          className="group/callout relative my-0.5 flex items-start gap-2 rounded-lg border p-3"
          style={{ ...calloutSurface(calloutType), ...surfaceStyle }}
        >
          <span
            className="pointer-events-none absolute right-2 top-1.5 select-none rounded px-1 text-[10px] font-semibold uppercase tracking-wide opacity-0 transition-opacity group-hover/callout:opacity-60"
            style={{ color: accent }}
            aria-hidden="true"
          >
            {calloutType.label}
          </span>
          {hasChildren ? (
            <BlockCollapseToggle collapsed={block.collapsed} onToggle={() => commitBlockUpdate(block.id, { collapsed: !block.collapsed })} />
          ) : null}
          <div className="relative shrink-0">
            <button
              type="button"
              className="inline-flex cursor-pointer items-center justify-center rounded"
              style={{ color: accent }}
              aria-label="Change callout type"
              title="Change callout type"
              onClick={() => setShowCalloutIconPicker((prev) => !prev)}
            >
              <IconValueView value={calloutDisplayIcon(block.color)} size={20} />
            </button>
            {showCalloutIconPicker && (
              <CalloutTypePicker
                current={block.color}
                onSelect={(value) => commitBlockUpdate(block.id, { color: value })}
                onClose={() => setShowCalloutIconPicker(false)}
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <EditableContent
              content={block.content}
              className={`py-0.5 leading-relaxed text-[var(--osio-fg-default)] ${getToggleHeadingClass(block.headingLevel)}`}
              style={editableStyle}
              placeholder={getBlockPlaceholder(block, "Type… '/' for commands · Enter to add blocks inside")}
              onChange={onChange}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onRequestSlashMenu={onRequestSlashMenu}
            />
            {!hasChildren ? (
              <p className="mt-0.5 select-none text-xs italic text-[var(--osio-fg-subtle)] opacity-0 transition-opacity group-hover/callout:opacity-100">
                Press Enter, or Tab a block in, to nest anything here — text, lists, code, even another callout.
              </p>
            ) : null}
            {!block.collapsed && hasChildren ? (
              <div className="mt-1 border-l-2 pl-3" style={{ borderColor: accent }}>
                {renderChildren?.()}
              </div>
            ) : null}
          </div>
        </div>
      );
    }
    case "equation": {
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
          <EquationView
            source={block.content.trim()}
            className="overflow-x-auto text-[var(--osio-fg-default)]"
            style={editableStyle}
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

