/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   BlockEditor.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/05 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/05 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { EditableContent } from "@src/components/blocks/EditableContent";
import { DatabaseBlock } from "@src/components/DatabaseBlock";
import type { Block } from "@src/types/database";

import { usePageStore } from "../store/usePageStore";
import { CALLOUT_COLORS } from "./PlaygroundPageEditorConstants";
import { TodoBlockEditor } from "./TodoBlockEditor";
import { ToggleBlockEditor } from "./ToggleBlockEditor";

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

interface BlockEditorProps {
  pageId: string;
  block: Block;
  numberedIndex: number;
  onChange: (text: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onDeleteCodeBlock?: () => void;
}

export const BlockEditor: React.FC<BlockEditorProps> = ({
  pageId,
  block,
  numberedIndex,
  onChange,
  onKeyDown,
  onDeleteCodeBlock,
}) => {
  const updateBlock = usePageStore((s) => s.updateBlock);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const langPickerRef = useRef<HTMLDivElement | null>(null);
  const [codeContextMenu, setCodeContextMenu] = useState<{ x: number; y: number } | null>(null);
  const codeContextMenuRef = useRef<HTMLDivElement | null>(null);

  const handleDeleteCodeBlock = () => {
    if (!onDeleteCodeBlock) return;
    if (!block.content.trim()) {
      onDeleteCodeBlock();
      return;
    }
    setShowDeleteConfirm(true);
  };

  const handleLangSelect = useCallback((language: string) => {
    updateBlock(pageId, block.id, { language });
    setShowLangPicker(false);
  }, [updateBlock, pageId, block.id]);

  const handleCodeTextareaKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget;
      const { selectionStart, selectionEnd, value } = ta;
      const indent = "    ";
      const next = value.slice(0, selectionStart) + indent + value.slice(selectionEnd);
      onChange(next);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = selectionStart + indent.length;
      });
      return;
    }

    onKeyDown(e);
  }, [onChange, onKeyDown]);

  const openCodeContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setShowLangPicker(false);
    setCodeContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    if (!showLangPicker) return;

    const handleOutside = (e: MouseEvent) => {
      if (langPickerRef.current && !langPickerRef.current.contains(e.target as Node)) {
        setShowLangPicker(false);
      }
    };

    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [showLangPicker]);

  useEffect(() => {
    if (!codeContextMenu) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (codeContextMenuRef.current && !codeContextMenuRef.current.contains(e.target as Node)) {
        setCodeContextMenu(null);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCodeContextMenu(null);
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [codeContextMenu]);

  switch (block.type) {
    case "heading_1":
      return (
        <EditableContent
          content={block.content}
          className="text-2xl font-bold text-[var(--color-ink)] mt-6 mb-1 leading-tight"
          placeholder="Heading 1"
          onChange={onChange}
          onKeyDown={onKeyDown}
        />
      );
    case "heading_2":
      return (
        <EditableContent
          content={block.content}
          className="text-xl font-semibold text-[var(--color-ink)] mt-5 mb-1 leading-tight"
          placeholder="Heading 2"
          onChange={onChange}
          onKeyDown={onKeyDown}
        />
      );
    case "heading_3":
      return (
        <EditableContent
          content={block.content}
          className="text-lg font-semibold text-[var(--color-ink)] mt-4 mb-0.5 leading-snug"
          placeholder="Heading 3"
          onChange={onChange}
          onKeyDown={onKeyDown}
        />
      );

    case "heading_4":
      return (
        <EditableContent
          content={block.content}
          className="text-base font-semibold text-[var(--color-ink)] mt-3 mb-0.5 leading-snug"
          placeholder="Heading 4"
          onChange={onChange}
          onKeyDown={onKeyDown}
        />
      );

    case "heading_5":
      return (
        <EditableContent
          content={block.content}
          className="text-sm font-semibold text-[var(--color-ink)] mt-2 mb-0.5 leading-snug"
          placeholder="Heading 5"
          onChange={onChange}
          onKeyDown={onKeyDown}
        />
      );

    case "heading_6":
      return (
        <EditableContent
          content={block.content}
          className="text-xs font-semibold text-[var(--color-ink-muted)] mt-2 mb-0.5 leading-snug tracking-wide"
          placeholder="Heading 6"
          onChange={onChange}
          onKeyDown={onKeyDown}
        />
      );

    case "paragraph":
      return (
        <EditableContent
          content={block.content}
          className="text-sm text-[var(--color-ink)] leading-relaxed py-0.5 min-h-[1.5em]"
          placeholder="Type '/' for commands…"
          onChange={onChange}
          onKeyDown={onKeyDown}
        />
      );

    case "bulleted_list":
      return (
        <div className="flex items-start gap-2 pl-1">
          <span className="text-sm leading-relaxed py-0.5 select-none shrink-0 w-5 text-center">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-ink-faint)] mt-[7px]" />
          </span>
          <div className="flex-1">
            <EditableContent
              content={block.content}
              className="text-sm text-[var(--color-ink)] leading-relaxed py-0.5 whitespace-pre-wrap"
              placeholder="List item"
              onChange={onChange}
              onKeyDown={onKeyDown}
            />
          </div>
        </div>
      );

    case "numbered_list":
      return (
        <div className="flex items-start gap-2 pl-1">
          <span className="text-sm leading-relaxed py-0.5 text-[var(--color-ink-muted)] select-none shrink-0 w-5 text-center font-medium">
            {numberedIndex}.
          </span>
          <div className="flex-1">
            <EditableContent
              content={block.content}
              className="text-sm text-[var(--color-ink)] leading-relaxed py-0.5 whitespace-pre-wrap"
              placeholder="List item"
              onChange={onChange}
              onKeyDown={onKeyDown}
            />
          </div>
        </div>
      );

    case "to_do":
      return (
        <TodoBlockEditor
          block={block}
          onChange={onChange}
          onKeyDown={onKeyDown}
        />
      );

    case "toggle":
      return (
        <ToggleBlockEditor
          block={block}
          onChange={onChange}
          onKeyDown={onKeyDown}
        />
      );

    case "code":
      return (
        <div
          className="my-1 rounded-lg overflow-visible border border-[var(--color-line)] relative"
          onContextMenu={openCodeContextMenu}
        >
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
          <div className="p-3 bg-[var(--color-surface-primary)]">
            <textarea
              value={block.content}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleCodeTextareaKeyDown}
              placeholder="Code…"
              spellCheck={false}
              className="w-full min-h-[120px] text-[13px] leading-relaxed font-mono text-[var(--color-ink)] whitespace-pre bg-transparent outline-none resize-y"
            />
          </div>
          {codeContextMenu && createPortal(
            <div
              ref={codeContextMenuRef}
              style={{ top: codeContextMenu.y, left: codeContextMenu.x }}
              className="fixed z-[10000] min-w-[180px] bg-[var(--color-surface-primary)] border border-[var(--color-line)] rounded-lg shadow-lg py-1"
            >
              <button
                type="button"
                onClick={() => {
                  setCodeContextMenu(null);
                  handleDeleteCodeBlock();
                }}
                className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
              >
                Delete code block
              </button>
            </div>,
            document.body,
          )}
          {showDeleteConfirm &&
            createPortal(
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-[9998] appearance-none border-0 bg-black/30 p-0 cursor-default"
                  onClick={() => setShowDeleteConfirm(false)}
                  tabIndex={-1}
                  aria-label="Close"
                />
                <dialog
                  open
                  className="fixed z-[9999] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[360px] max-w-[calc(100vw-24px)] bg-white border border-[var(--color-line)] rounded-xl shadow-2xl overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <div className="p-4">
                    <h3 className="text-sm font-semibold text-[var(--color-ink)]">
                      Delete code block?
                    </h3>
                    <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                      This code snippet has content. Deleting it will
                      permanently remove the text.
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--color-line)] bg-[var(--color-surface-secondary)]">
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-3 py-1.5 text-sm rounded-lg border border-[var(--color-line)] text-[var(--color-ink)] hover:bg-[var(--color-surface-primary)] transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteCodeBlock?.();
                        setShowDeleteConfirm(false);
                      }}
                      className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </dialog>
              </>,
              document.body,
            )}
        </div>
      );

    case "quote":
      return (
        <div className="flex my-0.5">
          <div className="w-1 bg-[var(--color-ink)] rounded-full shrink-0 mr-3" />
          <div className="flex-1">
            <EditableContent
              content={block.content}
              className="text-sm text-[var(--color-ink-muted)] leading-relaxed py-0.5 italic"
              placeholder="Quote…"
              onChange={onChange}
              onKeyDown={onKeyDown}
            />
          </div>
        </div>
      );

    case "callout": {
      const icon = block.color || "💡";
      const colors = CALLOUT_COLORS[icon] || {
        bg: "bg-[var(--color-surface-secondary)]",
        border: "border-[var(--color-line)]",
        text: "text-[var(--color-ink)]",
      };
      return (
        <div
          className={`flex items-start gap-3 p-3 rounded-lg border my-0.5 ${colors.bg} ${colors.border}`}
        >
          <span className={`text-lg shrink-0 ${colors.text}`}>{icon}</span>
          <div className="flex-1">
            <EditableContent
              content={block.content}
              className={`text-sm ${colors.text} leading-relaxed py-0.5`}
              placeholder="Input text…"
              onChange={onChange}
              onKeyDown={onKeyDown}
            />
          </div>
        </div>
      );
    }

    case "divider":
      return (
        <div className="py-2">
          <hr className="border-[var(--color-line)]" />
        </div>
      );

    case "table_block":
      return (
        <TableBlockEditor
          block={block}
          pageId={pageId}
          onDeleteTable={onDeleteCodeBlock}
        />
      );

    case "database_inline":
    case "database_full_page":
      return (
        <DatabaseBlock
          databaseId={block.databaseId}
          initialViewId={block.viewId}
          mode="inline"
        />
      );

    default:
      return (
        <EditableContent
          content={block.content}
          className="text-sm text-[var(--color-ink)] leading-relaxed py-0.5"
          placeholder="Type something…"
          onChange={onChange}
          onKeyDown={onKeyDown}
        />
      );
  }
};

const TableBlockEditor: React.FC<{ block: Block; pageId: string; onDeleteTable?: () => void }> = ({
  block,
  pageId,
  onDeleteTable,
}) => {
  const updateBlock = usePageStore((s) => s.updateBlock);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: number; col: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  const data = useMemo(
    () => block.tableData || [
      ["", "", ""],
      ["", "", ""],
      ["", "", ""],
    ],
    [block.tableData],
  );

  const handleCellChange = useCallback((row: number, col: number, value: string) => {
    const next = data.map((r, ri) => (
      ri === row ? r.map((c, ci) => (ci === col ? value : c)) : [...r]
    ));
    updateBlock(pageId, block.id, { tableData: next });
  }, [data, updateBlock, pageId, block.id]);

  const addRow = useCallback(() => {
    const cols = data[0]?.length || 3;
    updateBlock(pageId, block.id, { tableData: [...data, new Array(cols).fill("")] });
  }, [data, updateBlock, pageId, block.id]);

  const addCol = useCallback(() => {
    updateBlock(pageId, block.id, { tableData: data.map((row) => [...row, ""]) });
  }, [data, updateBlock, pageId, block.id]);

  const removeRow = useCallback((rowIndex: number) => {
    if (data.length <= 1) return;
    updateBlock(pageId, block.id, {
      tableData: data.filter((_, idx) => idx !== rowIndex),
    });
  }, [data, updateBlock, pageId, block.id]);

  const removeCol = useCallback((colIndex: number) => {
    const colCount = data[0]?.length ?? 0;
    if (colCount <= 1) return;
    updateBlock(pageId, block.id, {
      tableData: data.map((row) => row.filter((_, idx) => idx !== colIndex)),
    });
  }, [data, updateBlock, pageId, block.id]);

  const openContextMenu = useCallback((e: React.MouseEvent, row: number, col: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, row, col });
  }, []);

  useEffect(() => {
    if (!contextMenu) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
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
    <div className="my-2 border border-[var(--color-line)] rounded-lg overflow-hidden relative">
      <div className="overflow-auto max-h-[26rem]">
        <table className="w-max min-w-full text-sm">
          <tbody>
            {data.map((row, ri) => (
              <tr key={ri} className={ri === 0 ? "bg-[var(--color-surface-secondary)] font-medium" : ""}>{/* NOSONAR - table rows identified by position */}
                {row.map((cell, ci) => (
                  <td
                    key={ci} // NOSONAR - table cells identified by position
                    className="border-b border-r border-[var(--color-line)] last:border-r-0 px-0 py-0 min-w-[120px] text-[var(--color-ink)]"
                    onContextMenu={(e) => openContextMenu(e, ri, ci)}
                  >
                    <input
                      type="text"
                      value={cell}
                      onChange={(e) => handleCellChange(ri, ci, e.target.value)}
                      className="w-full bg-transparent px-3 py-1.5 outline-none focus:bg-[var(--color-surface-hover)]"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex border-t border-[var(--color-line)]">
        <button
          type="button"
          onClick={addRow}
          className="flex-1 text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-secondary)] py-1.5 transition-colors border-r border-[var(--color-line)]"
        >
          + Row
        </button>
        <button
          type="button"
          onClick={addCol}
          className="flex-1 text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-secondary)] py-1.5 transition-colors"
        >
          + Column
        </button>
      </div>

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
