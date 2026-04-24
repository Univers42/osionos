/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   EditableContent.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 19:04:24 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/22 11:30:35 by rstancu          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ColorPickerBoard } from "@univers42/ui-collection";
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
import {
  canReadPage,
  getCurrentPageAccessContext,
} from "@/shared/lib/auth/pageAccess";
import { resolveInternalPageLinkTitle } from "@/entities/page/model/resolveInternalPageLinkTitle";

interface EditableContentProps {
  content: string;
  className?: string;
  placeholder?: string;
  pageId?: string;
  onChange: (text: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  onRequestSlashMenu?: (position: { x: number; y: number }) => void;
  onFocus?: React.FocusEventHandler<HTMLDivElement>;
  onBlur?: React.FocusEventHandler<HTMLDivElement>;
}

type PaletteKind = "text" | "background" | null;
type LinkPickerMode = "chooser" | "external" | "internal";

const EMPTY_WORKSPACE_PAGES: readonly never[] = [];
const DEFAULT_INLINE_COLOR = INLINE_COLOR_OPTIONS[0]?.id ?? "#0F172A";

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

function normalizeInlineSource(source: string): string {
  return source.replaceAll(/[\r\n\u200B]/g, "").length === 0 ? "" : source;
}

function isInlineSourceEmpty(source: string): boolean {
  return (
    normalizeInlineSource(source).replaceAll("\u00A0", " ").trim().length === 0
  );
}

const TOOLBAR_BUTTON_BASE =
  "grid h-8 min-w-8 place-items-center rounded-md border border-transparent px-2 text-xs font-semibold text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-ink)]";

const TOOLBAR_ACTIVE_BUTTON =
  "border-[var(--color-line)] bg-[var(--color-surface-secondary)] text-[var(--color-ink)]";

interface InlineSelectionToolbarProps {
  selection: SelectionSnapshot;
  palette: PaletteKind;
  shortcutsOpen: boolean;
  onTogglePalette: (palette: Exclude<PaletteKind, null>) => void;
  onToggleShortcuts: () => void;
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
  shortcutsOpen,
  onTogglePalette,
  onToggleShortcuts,
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
    data-testid="inline-selection-toolbar"
    className="fixed z-[10001] -translate-x-1/2"
    style={{
      left: selection.rect.left + selection.rect.width / 2,
      top: Math.max(12, selection.rect.top - 58),
    }}
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
          onMouseDown={(e) => e.preventDefault()}
          onClick={onFormatBold}
        >
          B
        </button>
        <button
          type="button"
          title="Italic"
          className={TOOLBAR_BUTTON_BASE}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onFormatItalic}
        >
          I
        </button>
        <button
          type="button"
          title="Strikethrough"
          className={TOOLBAR_BUTTON_BASE}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onFormatStrike}
        >
          S
        </button>
        <button
          type="button"
          title="Add link"
          className={TOOLBAR_BUTTON_BASE}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onOpenLinkPicker}
        >
          ↗
        </button>
        <button
          type="button"
          title="Inline code"
          className={TOOLBAR_BUTTON_BASE}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onFormatCode}
        >
          {"</>"}
        </button>
        <button
          type="button"
          title="Keyboard shortcuts"
          className={[
            TOOLBAR_BUTTON_BASE,
            shortcutsOpen ? TOOLBAR_ACTIVE_BUTTON : "",
          ].join(" ")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onToggleShortcuts}
        >
          ?
        </button>
        <button
          type="button"
          title="Open slash menu"
          className={TOOLBAR_BUTTON_BASE}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onOpenSlashMenu}
        >
          /
        </button>
      </div>

      {palette && (
        <div
          data-testid={
            palette === "text"
              ? "inline-text-color-palette"
              : "inline-background-color-palette"
          }
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

      {shortcutsOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-primary)] p-2 shadow-xl">
          <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-faint)]">
            Keyboard shortcuts
          </p>
          <ul className="space-y-1">
            <li className="flex items-center justify-between rounded-md px-2 py-1 text-sm text-[var(--color-ink)]">
              <span>Bold</span>
              <span className="text-[var(--color-ink-muted)]">
                Ctrl/Cmd + B
              </span>
            </li>
            <li className="flex items-center justify-between rounded-md px-2 py-1 text-sm text-[var(--color-ink)]">
              <span>Italic</span>
              <span className="text-[var(--color-ink-muted)]">
                Ctrl/Cmd + I
              </span>
            </li>
            <li className="flex items-center justify-between rounded-md px-2 py-1 text-sm text-[var(--color-ink)]">
              <span>Inline code</span>
              <span className="text-[var(--color-ink-muted)]">
                Ctrl/Cmd + E
              </span>
            </li>
            <li className="flex items-center justify-between rounded-md px-2 py-1 text-sm text-[var(--color-ink)]">
              <span>Strikethrough</span>
              <span className="text-[var(--color-ink-muted)]">
                Ctrl/Cmd + Shift + X
              </span>
            </li>
            <li className="flex items-center justify-between rounded-md px-2 py-1 text-sm text-[var(--color-ink)]">
              <span>Add link</span>
              <span className="text-[var(--color-ink-muted)]">
                Ctrl/Cmd + Shift + L
              </span>
            </li>
          </ul>
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
  onFocus,
  onBlur,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const isComposing = useRef(false);
  const isFocused = useRef(false);
  const [hasFocus, setHasFocus] = useState(false);
  const [selectionSnapshot, setSelectionSnapshot] =
    useState<SelectionSnapshot | null>(null);
  const lastSelectionSnapshotRef = useRef<SelectionSnapshot | null>(null);
  const isPlaceholderVisible = isInlineSourceEmpty(content);
  const [openPalette, setOpenPalette] = useState<PaletteKind>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [linkPicker, setLinkPicker] = useState<LinkPickerState | null>(null);
  const linkPickerRef = useRef<HTMLDivElement | null>(null);
  const canonicalSourceRef = useRef(content);
  const renderedContentCache = useRef<{ source: string; html: string }>({
    source: "",
    html: "",
  });

  const currentPage = usePageStore((s) =>
    pageId ? s.pageById(pageId) : undefined,
  );
  const workspacePages = usePageStore((s) =>
    currentPage?.workspaceId
      ? (s.pages[currentPage.workspaceId] ?? EMPTY_WORKSPACE_PAGES)
      : EMPTY_WORKSPACE_PAGES,
  );

  const selectablePages = useMemo(() => {
    const accessContext = getCurrentPageAccessContext();
    return workspacePages.filter(
      (workspacePage) =>
        !workspacePage.archivedAt && canReadPage(workspacePage, accessContext),
    );
  }, [workspacePages]);

  const getRenderedInlineHtml = useCallback((nextContent: string) => {
    if (renderedContentCache.current.source === nextContent) {
      return renderedContentCache.current.html;
    }

    const html = nextContent
      ? parseInlineMarkdown(nextContent, {
          resolveInternalLinkTitle: resolveInternalPageLinkTitle,
        })
      : "";
    renderedContentCache.current = {
      source: nextContent,
      html,
    };
    return html;
  }, []);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const mention = target.closest(
        ".page-mention-placeholder",
      ) as HTMLElement;
      if (mention) {
        const targetPageId = mention.dataset.pageId;
        const page = targetPageId
          ? usePageStore.getState().pageById(targetPageId)
          : null;
        if (page) {
          e.preventDefault();
          e.stopPropagation();
          usePageStore.getState().openPage({
            id: page._id,
            workspaceId: page.workspaceId,
            kind: page.databaseId ? "database" : "page",
            title: page.title,
            icon: page.icon,
          });
        }
      }
    };

    root.addEventListener("click", handleClick);
    return () => root.removeEventListener("click", handleClick);
  }, []);

  useEffect(() => {
    canonicalSourceRef.current = content;
  }, [content]);

  const renderContent = useCallback(
    (nextContent: string) => {
      const root = ref.current;
      if (!root) {
        return;
      }

      canonicalSourceRef.current = nextContent;
      const nextHtml = getRenderedInlineHtml(nextContent);
      if (root.innerHTML !== nextHtml) {
        root.innerHTML = nextHtml;
      }
    },
    [getRenderedInlineHtml],
  );

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    const { source } = readInlineEditorDomState(ref.current);
    if (source === content) {
      return;
    }

    renderContent(content);
  }, [content, renderContent]);

  useEffect(() => {
    if (selectionSnapshot) {
      lastSelectionSnapshotRef.current = selectionSnapshot;
    }
  }, [selectionSnapshot]);

  const updateSelectionSnapshot = useCallback(() => {
    const root = ref.current;
    if (!root || !isFocused.current) {
      if (!linkPicker && !openPalette) {
        lastSelectionSnapshotRef.current = null;
        setSelectionSnapshot((current) => (current ? null : current));
        setOpenPalette((current) => (current ? null : current));
      }
      return;
    }

    const snapshot = getInlineEditorSelectionSnapshot(root);
    setSelectionSnapshot((current) =>
      areInlineEditorSelectionSnapshotsEqual(current, snapshot)
        ? current
        : snapshot,
    );
    if (!snapshot) {
      setOpenPalette(null);
      setShowShortcuts(false);
    }
  }, [linkPicker, openPalette]);

  useEffect(() => {
    const handleSelectionChange = () => updateSelectionSnapshot();
    document.addEventListener("selectionchange", handleSelectionChange);
    window.addEventListener("resize", handleSelectionChange);
    window.addEventListener("scroll", handleSelectionChange, true);

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      window.removeEventListener("resize", handleSelectionChange);
      window.removeEventListener("scroll", handleSelectionChange, true);
    };
  }, [updateSelectionSnapshot]);

  const syncContentFromDom = useCallback(() => {
    if (!ref.current) {
      return null;
    }

    const { source } = readInlineEditorDomState(ref.current);
    const normalizedSource = normalizeInlineSource(source);
    canonicalSourceRef.current = normalizedSource;
    onChange(normalizedSource);
    return normalizedSource;
  }, [onChange]);

  const handleInput = useCallback(() => {
    if (isComposing.current) {
      return;
    }

    const root = ref.current;
    if (!root) {
      return;
    }

    const selectionOffsets = getInlineEditorSelectionOffsets(root);
    const { source, requiresNormalization } = readInlineEditorDomState(root);
    const normalizedSource = normalizeInlineSource(source);
    canonicalSourceRef.current = normalizedSource;

    if (requiresNormalization) {
      const parsedHtml = getRenderedInlineHtml(normalizedSource);

      if (root.innerHTML !== parsedHtml) {
        root.innerHTML = parsedHtml;
        if (selectionOffsets) {
          setInlineEditorSelectionOffsets(root, selectionOffsets);
        }
      }
    }

    onChange(normalizedSource);
    requestAnimationFrame(updateSelectionSnapshot);
  }, [getRenderedInlineHtml, onChange, updateSelectionSnapshot]);

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (isComposing.current) {
        return;
      }

      const shouldRefreshInlineParsing =
        e.key.length === 1 ||
        e.key === "Backspace" ||
        e.key === "Delete" ||
        e.key === "Tab";

      if (!shouldRefreshInlineParsing) {
        return;
      }

      handleInput();
    },
    [handleInput],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      onPaste?.(e);
    },
    [onPaste],
  );

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // 1. Handle Wiki Links (Internal mentions)
    const mention = target.closest(".page-mention-placeholder") as HTMLElement;
    if (mention) {
      const targetPageId = mention.dataset.pageId;
      const page = targetPageId ? usePageStore.getState().pageById(targetPageId) : null;
      if (page) {
        e.preventDefault();
        e.stopPropagation();
        usePageStore.getState().openPage({
          id: page._id,
          workspaceId: page.workspaceId,
          kind: page.databaseId ? "database" : "page",
          title: page.title,
          icon: page.icon,
        });
      }
      return;
    }

    // 2. Handle Standard Links (A tags)
    const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
    if (anchor) {
      const href = anchor.getAttribute("href");
      if (!href) return;

      const normalizedHref = normalizeInlineLinkHref(href);
      const internalPageId = getInternalPageIdFromHref(normalizedHref);

      if (internalPageId) {
        // Internal page link from toolbar
        const linkedPage = usePageStore.getState().pageById(internalPageId);
        if (linkedPage) {
          e.preventDefault();
          e.stopPropagation();
          usePageStore.getState().openPage({
            id: linkedPage._id,
            workspaceId: linkedPage.workspaceId,
            kind: linkedPage.databaseId ? "database" : "page",
            title: linkedPage.title,
            icon: linkedPage.icon,
          });
        }
      } else {
        // External link
        e.preventDefault();
        e.stopPropagation();
        globalThis.open(normalizedHref, "_blank", "noopener,noreferrer");
      }
    }
  }, []);

  const applyInlineFormattingCommand = useCallback(
    (command: InlineFormattingCommand) => {
      const root = ref.current;
      const effectiveSelection =
        selectionSnapshot ?? lastSelectionSnapshotRef.current;

      if (!root || !effectiveSelection) {
        return;
      }

      const source = canonicalSourceRef.current;
      const nextContent = applyInlineFormatting(
        source,
        effectiveSelection,
        command,
      );
      if (nextContent === source) {
        root.focus();
        requestAnimationFrame(updateSelectionSnapshot);
        return;
      }

      onChange(nextContent);
      renderContent(nextContent);
      root.focus();

      requestAnimationFrame(() => {
        setInlineEditorSelectionOffsets(root, {
          start: effectiveSelection.start,
          end: effectiveSelection.end,
        });
        updateSelectionSnapshot();
      });
    },
    [
      onChange,
      renderContent,
      selectionSnapshot,
      updateSelectionSnapshot,
    ],
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
    if (!(selectionSnapshot ?? lastSelectionSnapshotRef.current)) {
      return;
    }

    setLinkPicker({ mode: "chooser", query: "" });
  }, [selectionSnapshot]);

  const handleInlineFormattingShortcut = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (isComposing.current || event.altKey) {
        return false;
      }

      const hasPrimaryModifier = event.metaKey || event.ctrlKey;
      if (!hasPrimaryModifier) {
        return false;
      }

      const key = event.key.toLowerCase();

      if (key === "b") {
        event.preventDefault();
        handleToggleInlineFormat("bold");
        return true;
      }

      if (key === "i") {
        event.preventDefault();
        handleToggleInlineFormat("italic");
        return true;
      }

      if (key === "e" || event.key === "`") {
        event.preventDefault();
        handleToggleCode();
        return true;
      }

      if (key === "l" && event.shiftKey) {
        event.preventDefault();
        handleAddLink();
        return true;
      }

      if (key === "x" && event.shiftKey) {
        event.preventDefault();
        handleToggleInlineFormat("strikethrough");
        return true;
      }

      return false;
    },
    [handleAddLink, handleToggleCode, handleToggleInlineFormat],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (handleInlineFormattingShortcut(e)) {
        requestAnimationFrame(updateSelectionSnapshot);
        return;
      }

      onKeyDown(e);
      requestAnimationFrame(updateSelectionSnapshot);
    },
    [handleInlineFormattingShortcut, onKeyDown, updateSelectionSnapshot],
  );

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
    const effectiveSelection =
      selectionSnapshot ?? lastSelectionSnapshotRef.current;

    if (!effectiveSelection || !onRequestSlashMenu) {
      return;
    }

    onRequestSlashMenu({
      x: effectiveSelection.rect.left,
      y: effectiveSelection.rect.bottom,
    });
    setSelectionSnapshot(null);
    lastSelectionSnapshotRef.current = null;
    setOpenPalette(null);
  }, [onRequestSlashMenu, selectionSnapshot]);

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
        data-empty={hasFocus && isPlaceholderVisible}
        className={`outline-none whitespace-pre-wrap break-words data-[empty=true]:before:content-[attr(data-placeholder)] data-[empty=true]:before:text-[var(--color-ink-faint)] data-[empty=true]:before:pointer-events-none ${className}`}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onPaste={handlePaste}
        onMouseDown={handleMouseDown}
        onFocus={(event) => {
          onFocus?.(event);
          isFocused.current = true;
          setHasFocus(true);
          renderContent(content);
        }}
        onBlur={(event) => {
          onBlur?.(event);
          isFocused.current = false;
          setHasFocus(false);
          if (!linkPicker && !openPalette) {
            lastSelectionSnapshotRef.current = null;
            setSelectionSnapshot(null);
            setOpenPalette((current) => (current ? null : current));
          }
          const syncedContent = syncContentFromDom();
          renderContent(syncedContent ?? content);
        }}
        onMouseUp={updateSelectionSnapshot}
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
              shortcutsOpen={showShortcuts}
              onTogglePalette={(palette) =>
                setOpenPalette((current) =>
                  current === palette ? null : palette,
                )
              }
              onToggleShortcuts={() => {
                setOpenPalette(null);
                setShowShortcuts((current) => !current);
              }}
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
              data-testid="inline-link-picker"
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
                  <div
                    data-testid="inline-page-link-results"
                    className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-[var(--color-line)]"
                  >
                    {selectablePages
                      .filter((workspacePage) => {
                        const lower = linkPicker.query.trim().toLowerCase();
                        if (!lower) return true;
                        return workspacePage.title
                          .toLowerCase()
                          .includes(lower);
                      })
                      .slice(0, 12)
                      .map((workspacePage) => (
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
                    {selectablePages.filter((workspacePage) => {
                      const lower = linkPicker.query.trim().toLowerCase();
                      if (!lower) return true;
                      return workspacePage.title.toLowerCase().includes(lower);
                    }).length === 0 && (
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
