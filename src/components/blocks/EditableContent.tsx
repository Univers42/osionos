/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   EditableContent.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 19:04:24 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/16 21:46:25 by rstancu          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ColorPickerBoard } from "@univers42/ui-collection";
import type { PageEntry } from "@/entities/page";
import {
  applyInlineFormatting,
  areInlineEditorSelectionSnapshotsEqual,
  getInlineEditorSelectionOffsets,
  getInlineEditorSelectionSnapshot,
  normalizeInlineLinkHref,
  parseInlineMarkdown,
  readInlineEditorDomState,
  setInlineEditorSelectionOffsets,
  type InlineEditorSelectionSnapshot as SelectionSnapshot,
  type InlineFormattingCommand,
} from "@/shared/lib/markengine";
import {
  getInlineColorOption,
  INLINE_COLOR_OPTIONS,
  type InlineColorOption,
} from "@/shared/lib/markengine/inlineTextStyles";
import { usePageStore } from "@/store/usePageStore";
import { canReadPage, getCurrentPageAccessContext } from "@/shared/lib/auth/pageAccess";

interface EditableContentProps {
  content: string;
  className?: string;
  placeholder?: string;
  pageId?: string;
  onChange: (text: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  onRequestSlashMenu?: (position: { x: number; y: number }) => void;
}

type PaletteKind = "text" | "background" | null;
type LinkPickerMode = "chooser" | "external" | "internal";

const EMPTY_WORKSPACE_PAGES: readonly never[] = [];
const DEFAULT_INLINE_COLOR = INLINE_COLOR_OPTIONS[0]?.id ?? "#0F172A";
const NORMALIZATION_IDLE_DELAY_MS = 120;

interface LinkPickerState {
  mode: LinkPickerMode;
  query: string;
}

const INTERNAL_PAGE_LINK_PREFIX = "page://";

function buildInternalPageHref(pageId: string) {
  return `${INTERNAL_PAGE_LINK_PREFIX}${pageId}`;
}

function getInternalPageIdFromHref(href: string) {
  return href.startsWith(INTERNAL_PAGE_LINK_PREFIX)
    ? href.slice(INTERNAL_PAGE_LINK_PREFIX.length)
    : null;
}

function getSelectablePagesSnapshot(pageId?: string): PageEntry[] {
  if (!pageId) {
    return [];
  }

  const { pageById, pages } = usePageStore.getState();
  const currentPage = pageById(pageId);
  if (!currentPage?.workspaceId) {
    return [];
  }

  const accessContext = getCurrentPageAccessContext();
  return (pages[currentPage.workspaceId] ?? EMPTY_WORKSPACE_PAGES).filter(
    (workspacePage) =>
      !workspacePage.archivedAt && canReadPage(workspacePage, accessContext),
  );
}

const TOOLBAR_BUTTON_BASE =
  "grid h-8 min-w-8 place-items-center rounded-md border border-transparent px-2 text-xs font-semibold text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-ink)]";

const TOOLBAR_ACTIVE_BUTTON =
  "border-[var(--color-line)] bg-[var(--color-surface-secondary)] text-[var(--color-ink)]";

function preserveEditorSelection(event: React.MouseEvent<HTMLDivElement>) {
  event.preventDefault();
}

interface InlineSelectionToolbarProps {
  selection: SelectionSnapshot;
  palette: PaletteKind;
  onTogglePalette: (palette: Exclude<PaletteKind, null>) => void;
  onFormatBold: () => void;
  onFormatItalic: () => void;
  onFormatStrike: () => void;
  onFormatCode: () => void;
  onFormatTextColor: (color: InlineColorOption) => void;
  onFormatBackgroundColor: (color: InlineColorOption) => void;
  onOpenSlashMenu: () => void;
  onOpenLinkPicker: () => void;
}

const InlineSelectionToolbar: React.FC<InlineSelectionToolbarProps> = ({
  selection,
  palette,
  onTogglePalette,
  onFormatBold,
  onFormatItalic,
  onFormatStrike,
  onFormatCode,
  onFormatTextColor,
  onFormatBackgroundColor,
  onOpenSlashMenu,
  onOpenLinkPicker,
}) => (
  <div
    className="fixed z-[10001] -translate-x-1/2"
    style={{
      left: selection.rect.left + selection.rect.width / 2,
      top: Math.max(12, selection.rect.top - 58),
    }}
    onMouseDownCapture={preserveEditorSelection}
  >
    <div className="relative rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-primary)] px-1.5 py-1 shadow-xl">
      <div className="flex items-center gap-1">
        <button
          type="button"
          title="Text color"
          className={[
            TOOLBAR_BUTTON_BASE,
            palette === "text" ? TOOLBAR_ACTIVE_BUTTON : "",
          ].join(" ")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onTogglePalette("text")}
        >
          A
        </button>
        <button
          type="button"
          title="Background color"
          className={[
            TOOLBAR_BUTTON_BASE,
            palette === "background" ? TOOLBAR_ACTIVE_BUTTON : "",
          ].join(" ")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onTogglePalette("background")}
        >
          ▣
        </button>
        <button
          type="button"
          title="Bold"
          className={TOOLBAR_BUTTON_BASE}
          onMouseDown={(e) => {
            e.preventDefault();
            onFormatBold();
          }}
        >
          B
        </button>
        <button
          type="button"
          title="Italic"
          className={TOOLBAR_BUTTON_BASE}
          onMouseDown={(e) => {
            e.preventDefault();
            onFormatItalic();
          }}
        >
          I
        </button>
        <button
          type="button"
          title="Strikethrough"
          className={TOOLBAR_BUTTON_BASE}
          onMouseDown={(e) => {
            e.preventDefault();
            onFormatStrike();
          }}
        >
          S
        </button>
        <button
          type="button"
          title="Add link"
          className={TOOLBAR_BUTTON_BASE}
          onMouseDown={(e) => {
            e.preventDefault();
            onOpenLinkPicker();
          }}
        >
          ↗
        </button>
        <button
          type="button"
          title="Inline code"
          className={TOOLBAR_BUTTON_BASE}
          onMouseDown={(e) => {
            e.preventDefault();
            onFormatCode();
          }}
        >
          {"</>"}
        </button>
        <button
          type="button"
          title="Open slash menu"
          className={TOOLBAR_BUTTON_BASE}
          onMouseDown={(e) => {
            e.preventDefault();
            onOpenSlashMenu();
          }}
        >
          /
        </button>
      </div>

      {palette && (
        <div
          className="absolute left-0 top-full mt-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-primary)] p-2 w-45 h-60 shadow-xl"
        >
          <ColorPickerBoard
            defaultValue={DEFAULT_INLINE_COLOR}
            label={palette === "text" ? "Text color" : "Background color"}
            presets={INLINE_COLOR_OPTIONS}
            showInput={false}
            size={158}
            variant="wheel"
            styles={{
              root: {
                fontSize: "13px",
              },
              header: {
                marginBottom: "0px",
              },
              eyebrow: {
                display: "none",
              },
              title: {
                fontSize: "14px",
                lineHeight: 1,
              },
              selectedValue: {
                display: "none",
              },
              presets: {
                gridTemplateColumns: "repeat(4, 14px)",
                justifyContent: "start",
                gap: "4px",
                marginTop: "5px",
                marginBottom: "0px",
                marginLeft: "0px",
                marginRight: "0px",
              },
              presetButton: {
                gap: 0,
                padding: "0px",
                width: "14px",
                minWidth: "14px",
                maxWidth: "14px",
                height: "14px",
                minHeight: "14px",
                maxHeight: "14px",
              },
              presetSwatch: {
                width: "14px",
                height: "14px",
              },
              presetLabel: {
                display: "none",
              },
            }}
            onChangeComplete={(value) => {
              const option = getInlineColorOption(value);
              if (!option) {
                return;
              }

              if (palette === "text") {
                onFormatTextColor(option);
              } else {
                onFormatBackgroundColor(option);
              }
            }}
          />
        </div>
      )}
    </div>
  </div>
);

export const EditableContent: React.FC<EditableContentProps> = ({
  content,
  className = "",
  placeholder = "",
  pageId,
  onChange,
  onKeyDown,
  onPaste,
  onRequestSlashMenu,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const isComposing = useRef(false);
  const isFocused = useRef(false);
  const [hasFocus, setHasFocus] = useState(false);
  const [selectionSnapshot, setSelectionSnapshot] =
    useState<SelectionSnapshot | null>(null);
  const selectionSnapshotRef = useRef<SelectionSnapshot | null>(null);
  const [openPalette, setOpenPalette] = useState<PaletteKind>(null);
  const [linkPicker, setLinkPicker] = useState<LinkPickerState | null>(null);
  const linkPickerRef = useRef<HTMLDivElement | null>(null);
  const canonicalSourceRef = useRef(content);
  const normalizationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renderedContentCache = useRef<{ source: string; html: string }>({
    source: "",
    html: "",
  });

  const selectablePages = useMemo(() => {
    return linkPicker?.mode === "internal"
      ? getSelectablePagesSnapshot(pageId)
      : EMPTY_WORKSPACE_PAGES;
  }, [linkPicker?.mode, pageId]);

  const filteredSelectablePages = useMemo(() => {
    if (linkPicker?.mode !== "internal") {
      return EMPTY_WORKSPACE_PAGES;
    }

    const lower = linkPicker.query.trim().toLowerCase();
    return selectablePages
      .filter((workspacePage) => {
        if (!lower) return true;
        return workspacePage.title.toLowerCase().includes(lower);
      })
      .slice(0, 12);
  }, [linkPicker, selectablePages]);
  const shouldTrackSelection = hasFocus || linkPicker !== null;

  const getRenderedInlineHtml = useCallback((nextContent: string) => {
    if (renderedContentCache.current.source === nextContent) {
      return renderedContentCache.current.html;
    }

    const html = nextContent ? parseInlineMarkdown(nextContent) : "";
    renderedContentCache.current = {
      source: nextContent,
      html,
    };
    return html;
  }, []);

  useEffect(() => {
    canonicalSourceRef.current = content;
  }, [content]);

  const renderContent = useCallback((nextContent: string) => {
    const root = ref.current;
    if (!root) {
      return;
    }

    canonicalSourceRef.current = nextContent;
    const nextHtml = getRenderedInlineHtml(nextContent);
    if (root.innerHTML !== nextHtml) {
      root.innerHTML = nextHtml;
    }
  }, [getRenderedInlineHtml]);

  const clearScheduledNormalization = useCallback(() => {
    if (normalizationTimerRef.current) {
      clearTimeout(normalizationTimerRef.current);
      normalizationTimerRef.current = null;
    }
  }, []);

  const normalizeEditorDom = useCallback((nextContent: string) => {
    const root = ref.current;
    if (!root) {
      return;
    }

    const selectionOffsets = isFocused.current
      ? getInlineEditorSelectionOffsets(root)
      : null;
    renderContent(nextContent);
    if (selectionOffsets && isFocused.current) {
      setInlineEditorSelectionOffsets(root, selectionOffsets);
    }
  }, [renderContent]);

  useEffect(() => {
    const root = ref.current;
    if (!root) {
      return;
    }

    if (content === canonicalSourceRef.current && root.innerHTML !== "") {
      return;
    }

    const { source } = readInlineEditorDomState(root);
    if (source === content) {
      return;
    }

    renderContent(content);
  }, [content, renderContent]);

  const updateSelectionSnapshot = useCallback(() => {
    const root = ref.current;
    if (!root || !isFocused.current) {
      if (!linkPicker) {
        selectionSnapshotRef.current = null;
        setSelectionSnapshot((current) => (current ? null : current));
      }
      setOpenPalette(null);
      return;
    }

    const snapshot = getInlineEditorSelectionSnapshot(root);
    selectionSnapshotRef.current = snapshot;
    setSelectionSnapshot((current) =>
      areInlineEditorSelectionSnapshotsEqual(current, snapshot)
        ? current
        : snapshot,
    );
    if (!snapshot) {
      setOpenPalette(null);
    }
  }, [linkPicker]);

  useEffect(() => {
    if (!shouldTrackSelection) {
      return;
    }

    const handleSelectionChange = () => updateSelectionSnapshot();
    document.addEventListener("selectionchange", handleSelectionChange);
    window.addEventListener("resize", handleSelectionChange);
    window.addEventListener("scroll", handleSelectionChange, true);

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      window.removeEventListener("resize", handleSelectionChange);
      window.removeEventListener("scroll", handleSelectionChange, true);
    };
  }, [shouldTrackSelection, updateSelectionSnapshot]);

  useEffect(() => clearScheduledNormalization, [clearScheduledNormalization]);

  const scheduleNormalization = useCallback(
    (nextContent: string) => {
      clearScheduledNormalization();
      normalizationTimerRef.current = setTimeout(() => {
        normalizationTimerRef.current = null;
        if (isComposing.current) {
          return;
        }

        normalizeEditorDom(
          canonicalSourceRef.current === nextContent
            ? nextContent
            : canonicalSourceRef.current,
        );
        requestAnimationFrame(updateSelectionSnapshot);
      }, NORMALIZATION_IDLE_DELAY_MS);
    },
    [clearScheduledNormalization, normalizeEditorDom, updateSelectionSnapshot],
  );

  const syncContentFromDom = useCallback(() => {
    if (!ref.current) {
      return null;
    }

    const { source } = readInlineEditorDomState(ref.current);
    canonicalSourceRef.current = source;
    onChange(source);
    return source;
  }, [onChange]);

  const handleInput = useCallback(() => {
    if (isComposing.current) {
      return;
    }

    const root = ref.current;
    if (!root) {
      return;
    }

    const { source, requiresNormalization } = readInlineEditorDomState(root);
    canonicalSourceRef.current = source;

    if (requiresNormalization) {
      scheduleNormalization(source);
    } else {
      clearScheduledNormalization();
    }

    onChange(source);
    requestAnimationFrame(updateSelectionSnapshot);
  }, [
    clearScheduledNormalization,
    onChange,
    scheduleNormalization,
    updateSelectionSnapshot,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown(e);
      requestAnimationFrame(updateSelectionSnapshot);
    },
    [onKeyDown, updateSelectionSnapshot],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      onPaste?.(e);
    },
    [onPaste],
  );

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
    if (!anchor) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    const href = anchor.href;
    if (!href) {
      return;
    }

    const normalizedHref = normalizeInlineLinkHref(
      anchor.getAttribute("href") ?? href,
    );
    const internalPageId = getInternalPageIdFromHref(normalizedHref);
    if (internalPageId) {
      const linkedPage = usePageStore.getState().pageById(internalPageId);
      if (linkedPage) {
        usePageStore.getState().openPage({
          id: linkedPage._id,
          workspaceId: linkedPage.workspaceId,
          kind: linkedPage.databaseId ? "database" : "page",
          title: linkedPage.title,
          icon: linkedPage.icon,
        });
      }
      return;
    }

    globalThis.open(normalizedHref, "_blank", "noopener,noreferrer");
  }, []);

  const applyInlineFormattingCommand = useCallback(
    (command: InlineFormattingCommand) => {
      const root = ref.current;
      const activeSelectionSnapshot = selectionSnapshotRef.current;
      if (!root || !activeSelectionSnapshot) {
        return;
      }

      const source = canonicalSourceRef.current;
      const nextContent = applyInlineFormatting(
        source,
        activeSelectionSnapshot,
        command,
      );
      if (nextContent === source) {
        root.focus();
        requestAnimationFrame(updateSelectionSnapshot);
        return;
      }

      clearScheduledNormalization();
      onChange(nextContent);
      renderContent(nextContent);
      root.focus();

      requestAnimationFrame(() => {
        setInlineEditorSelectionOffsets(root, {
          start: activeSelectionSnapshot.start,
          end: activeSelectionSnapshot.end,
        });
        updateSelectionSnapshot();
      });
    },
    [clearScheduledNormalization, onChange, renderContent, updateSelectionSnapshot],
  );

  const handleToggleInlineFormat = useCallback(
    (format: "bold" | "italic" | "strikethrough") => {
      applyInlineFormattingCommand({
        type: "toggle_format",
        format,
      });
    },
    [applyInlineFormattingCommand],
  );

  const handleApplyColor = useCallback(
    (colorKind: "text" | "background", color: InlineColorOption) => {
      applyInlineFormattingCommand({
        type: "set_color",
        colorKind,
        color: color.id,
      });
      setOpenPalette(null);
    },
    [applyInlineFormattingCommand],
  );

  const handleToggleCode = useCallback(() => {
    applyInlineFormattingCommand({
      type: "toggle_format",
      format: "code",
    });
  }, [applyInlineFormattingCommand]);

  const handleAddLink = useCallback(() => {
    if (!selectionSnapshotRef.current) {
      return;
    }

    setLinkPicker({ mode: "chooser", query: "" });
  }, []);

  const handleApplyExternalLink = useCallback(
    (url: string) => {
      const cleanUrl = normalizeInlineLinkHref(url);
      if (!cleanUrl) {
        return;
      }

      applyInlineFormattingCommand({
        type: "set_link",
        href: cleanUrl,
      });
      setLinkPicker(null);
    },
    [applyInlineFormattingCommand],
  );

  const handleApplyInternalLink = useCallback(
    (pageId: string) => {
      if (!pageId) {
        return;
      }

      applyInlineFormattingCommand({
        type: "set_link",
        href: buildInternalPageHref(pageId),
      });
      setLinkPicker(null);
    },
    [applyInlineFormattingCommand],
  );

  const handleOpenSlashMenu = useCallback(() => {
    const activeSelectionSnapshot = selectionSnapshotRef.current;
    if (!activeSelectionSnapshot || !onRequestSlashMenu) {
      return;
    }

    onRequestSlashMenu({
      x: activeSelectionSnapshot.rect.left,
      y: activeSelectionSnapshot.rect.bottom,
    });
    selectionSnapshotRef.current = null;
    setSelectionSnapshot(null);
    setOpenPalette(null);
  }, [onRequestSlashMenu]);

  useEffect(() => {
    if (!linkPicker) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        linkPickerRef.current &&
        target &&
        linkPickerRef.current.contains(target)
      ) {
        return;
      }
      setLinkPicker(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLinkPicker(null);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [linkPicker]);

  return (
    <>
      <div // NOSONAR - contentEditable is required for this Notion-like editor UX
        ref={ref}
        role="textbox"
        aria-multiline="true"
        tabIndex={0}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        data-placeholder={hasFocus ? placeholder : ""}
        className={`outline-none whitespace-pre-wrap break-words empty:before:content-[attr(data-placeholder)] empty:before:text-[var(--color-ink-faint)] empty:before:pointer-events-none ${className}`}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onClick={handleClick}
        onMouseUp={updateSelectionSnapshot}
        onFocus={() => {
          clearScheduledNormalization();
          isFocused.current = true;
          setHasFocus(true);
          renderContent(canonicalSourceRef.current);
        }}
        onBlur={() => {
          clearScheduledNormalization();
          isFocused.current = false;
          setHasFocus(false);
          if (!linkPicker) {
            selectionSnapshotRef.current = null;
            setSelectionSnapshot(null);
          }
          setOpenPalette(null);
          const syncedContent = syncContentFromDom();
          renderContent(syncedContent ?? canonicalSourceRef.current);
        }}
        onCompositionStart={() => {
          isComposing.current = true;
        }}
        onCompositionEnd={() => {
          isComposing.current = false;
          handleInput();
        }}
      />

      {selectionSnapshot && typeof document !== "undefined"
        ? createPortal(
            <InlineSelectionToolbar
              selection={selectionSnapshot}
              palette={openPalette}
              onTogglePalette={(palette) =>
                setOpenPalette((current) =>
                  current === palette ? null : palette,
                )
              }
              onFormatBold={() => handleToggleInlineFormat("bold")}
              onFormatItalic={() => handleToggleInlineFormat("italic")}
              onFormatStrike={() => handleToggleInlineFormat("strikethrough")}
              onFormatCode={handleToggleCode}
              onFormatTextColor={(color) => handleApplyColor("text", color)}
              onFormatBackgroundColor={(color) =>
                handleApplyColor("background", color)
              }
              onOpenSlashMenu={handleOpenSlashMenu}
              onOpenLinkPicker={handleAddLink}
            />,
            document.body,
          )
        : null}

      {selectionSnapshot && linkPicker && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={linkPickerRef}
              className="fixed z-[10002] w-80 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-primary)] shadow-xl"
              style={{
                left: selectionSnapshot.rect.left,
                top: Math.max(12, selectionSnapshot.rect.bottom + 8),
              }}
            >
              {linkPicker.mode === "chooser" && (
                <div className="p-2">
                  <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-faint)]">
                    Link type
                  </p>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      className="rounded-lg px-3 py-2 text-left text-sm text-[var(--color-ink)] hover:bg-[var(--color-surface-secondary)]"
                      onClick={() =>
                        setLinkPicker({ mode: "external", query: "https://" })
                      }
                    >
                      Web link
                    </button>
                    <button
                      type="button"
                      className="rounded-lg px-3 py-2 text-left text-sm text-[var(--color-ink)] hover:bg-[var(--color-surface-secondary)]"
                      onClick={() =>
                        setLinkPicker({ mode: "internal", query: "" })
                      }
                    >
                      Page link
                    </button>
                  </div>
                </div>
              )}

              {linkPicker.mode === "external" && (
                <form
                  className="p-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleApplyExternalLink(linkPicker.query);
                  }}
                >
                  <div
                    id="external-link-label"
                    className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-faint)]"
                  >
                    Web URL
                  </div>
                  <input
                    aria-labelledby="external-link-label"
                    autoFocus
                    value={linkPicker.query}
                    onChange={(e) =>
                      setLinkPicker((current) =>
                        current
                          ? { ...current, query: e.target.value }
                          : current,
                      )
                    }
                    className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-secondary)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
                    placeholder="https://example.com"
                  />
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-lg px-3 py-2 text-sm text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-secondary)]"
                      onClick={() => setLinkPicker(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                    >
                      Apply
                    </button>
                  </div>
                </form>
              )}

              {linkPicker.mode === "internal" && (
                <div className="p-2">
                  <div
                    id="page-link-label"
                    className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-faint)]"
                  >
                    Page reference
                  </div>
                  <input
                    aria-labelledby="page-link-label"
                    autoFocus
                    value={linkPicker.query}
                    onChange={(e) =>
                      setLinkPicker((current) =>
                        current
                          ? { ...current, query: e.target.value }
                          : current,
                      )
                    }
                    className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-secondary)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
                    placeholder="Search pages"
                  />
                  <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-[var(--color-line)]">
                    {filteredSelectablePages.map((workspacePage) => (
                        <button
                          key={workspacePage._id}
                          type="button"
                          className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-[var(--color-ink)] hover:bg-[var(--color-surface-secondary)]"
                          onClick={() =>
                            handleApplyInternalLink(workspacePage._id)
                          }
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-secondary)] text-xs text-[var(--color-ink-muted)]">
                            {workspacePage.icon ?? "□"}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {workspacePage.title || "Untitled"}
                          </span>
                        </button>
                      ))}
                    {filteredSelectablePages.length === 0 && (
                      <p className="px-3 py-2 text-sm text-[var(--color-ink-faint)]">
                        No pages match your search.
                      </p>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-lg px-3 py-2 text-sm text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-secondary)]"
                      onClick={() => setLinkPicker(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
};
