/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   EditableContent.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 19:04:24 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/12 23:14:09 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Baseline,
  Bold,
  Code,
  Highlighter,
  Italic,
  Keyboard,
  Link,
  Radical,
  RemoveFormatting,
  Slash,
  Strikethrough,
  Underline,
} from "lucide-react";
import { getLoadedKatex, loadKatex, onKatexReady, renderMathToHtml } from "@/shared/lib/math/katexRuntime";
import {
  ColorPickerBoard,
  type ColorPickerPreset,
} from "@univers42/ui-collection";
import {
  applyInlineFormatting,
  areInlineEditorSelectionSnapshotsEqual,
  autoformatInlineMarkdown,
  getInlineEditorSelectionOffsets,
  getInlineEditorSelectionSnapshot,
  normalizeInlineLinkHref,
  parseInlineMarkdown,
  readInlineEditorDomState,
  setInlineEditorSelectionOffsets,
  type InlineEditorSelectionSnapshot as SelectionSnapshot,
  type InlineFormattingCommand,
} from "@/shared/lib/markengine";
// Direct paths (not the barrel): the caret-escape that lands the caret OUTSIDE a
// freshly-closed markdown style pair (so it never overflows), and the SOURCE-space
// caret offset that lets autoformat fire on every inline style in a block — not
// only the first.
import { setInlineCaretAfterStyledBoundary } from "@/shared/lib/markengine/inlineEditorSelection";
import { inlineSourceCaretOffset } from "@/shared/lib/markengine/inlineEditorDom";
import {
  getInlineColorOption,
  normalizeInlineColorToken,
  type InlineColorOption,
} from "@/shared/lib/markengine/inlineTextStyles";
import { usePageStore } from "@/store/usePageStore";
import {
  canReadPage,
  getCurrentPageAccessContext,
} from "@/shared/lib/auth/pageAccess";
import { resolveInternalPageLinkTitle } from "@/entities/page/model/resolveInternalPageLinkTitle";
import { findLinks, removeLink, replaceLink } from "./linkSourceEdit";
import { LinkEditorPanel, type LinkEditorAnchor } from "./LinkEditorPanel";
import { TurnIntoMenu } from "./TurnIntoMenu";

interface EditableContentProps {
  content: string;
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
  pageId?: string;
  onChange: (text: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  onRequestSlashMenu?: (position: { x: number; y: number; top: number }) => void;
  onFocus?: React.FocusEventHandler<HTMLDivElement>;
  onBlur?: React.FocusEventHandler<HTMLDivElement>;
  /** Current block type — powers the selection toolbar's "Turn into" dropdown. */
  blockType?: string;
  /** Convert this block to another type (from the "Turn into" dropdown). */
  onTurnInto?: (type: string) => void;
}

type PaletteKind = "text" | "background" | null;
type LinkPickerMode = "chooser" | "external" | "internal";
type ResolvedThemeName = "light" | "dark";

const EMPTY_WORKSPACE_PAGES: readonly never[] = [];
const INLINE_COLOR_RECENTS_STORAGE_KEY = "osionos:inline-color-recents";
const MAX_INLINE_COLOR_RECENTS = 7;
const LIGHT_THEME_DEFAULT_INLINE_COLOR = "var(--osio-fg-default)";
const DARK_THEME_DEFAULT_INLINE_COLOR = "var(--osio-fg-default)";

/** Closing delimiters that can complete an inline markdown style pair. */
const INLINE_CLOSERS = new Set(["*", "_", "`", "~", "="]);

/** The collapsed caret range inside `root`, or null (a text selection / no caret). */
function caretRangeInRoot(root: HTMLElement): Range | null {
  const selection = globalThis.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!range.collapsed || !root.contains(range.commonAncestorContainer)) return null;
  return range;
}

/** True when the character just before the caret is an inline closing delimiter —
 *  the cheap gate that keeps autoformat off every non-delimiter keystroke. */
function endsWithInlineCloser(range: Range): boolean {
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE || range.startOffset === 0) return false;
  const char = (node.textContent ?? "")[range.startOffset - 1];
  return Boolean(char) && INLINE_CLOSERS.has(char);
}

interface LinkPickerState {
  mode: LinkPickerMode;
  query: string;
}

/** The link being edited via Ctrl/Cmd-click: its position in source-order (== its
 *  .editor-link anchor index in the DOM), current text/href, and screen anchor. */
interface LinkEditorTarget {
  index: number;
  text: string;
  href: string;
  rect: LinkEditorAnchor;
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

interface NavigablePage {
  _id: string;
  workspaceId: string;
  databaseId?: string | null;
  title: string;
  icon?: string | null;
}

function openPageById(pageId: string | null | undefined): boolean {
  if (!pageId) {
    return false;
  }

  const page = usePageStore.getState().pageById(pageId) as NavigablePage | null;
  if (!page) {
    return false;
  }

  usePageStore.getState().openPage({
    id: page._id,
    workspaceId: page.workspaceId,
    kind: page.databaseId ? "database" : "page",
    title: page.title,
    icon: page.icon ?? undefined,
    databaseId: page.databaseId,
  });
  return true;
}

function handleMentionMouseDown(
  event: React.MouseEvent<HTMLDivElement>,
  target: HTMLElement,
): boolean {
  const mention = target.closest(
    ".page-mention-placeholder",
  ) as HTMLElement | null;
  if (!mention) {
    return false;
  }

  const opened = openPageById(mention.dataset.pageId);
  if (opened) {
    event.preventDefault();
    event.stopPropagation();
  }

  return true;
}

function handleAnchorMouseDown(
  event: React.MouseEvent<HTMLDivElement>,
  target: HTMLElement,
): boolean {
  const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
  if (!anchor) {
    return false;
  }

  const href = anchor.getAttribute("href");
  if (!href) {
    return true;
  }

  const normalizedHref = normalizeInlineLinkHref(href);
  const internalPageId = getInternalPageIdFromHref(normalizedHref);

  if (internalPageId) {
    const opened = openPageById(internalPageId);
    if (opened) {
      event.preventDefault();
      event.stopPropagation();
    }
    return true;
  }

  event.preventDefault();
  event.stopPropagation();
  globalThis.open(normalizedHref, "_blank", "noopener,noreferrer");
  return true;
}

const INLINE_MATH_PATTERN = /\$[^$\n]+\$|\\\(|\\\[/;

function renderInlineMathToHtml(source: string): string {
  const html = renderMathToHtml(source, false);
  if (html !== null) return html;
  // katex has not loaded yet: show the raw source (escaped) until it upgrades.
  const escaped = source.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return `<span class="osio-inline-math-pending">${escaped}</span>`;
}

function renderInlineHtmlPreservingLineBreaks(
  source: string,
  renderSourceForEditing: boolean,
  renderLinkAsSource = false,
): string {
  const lines = source.split("\n");

  return lines
    .map((line) =>
      parseInlineMarkdown(line, {
        resolveInternalLinkTitle: resolveInternalPageLinkTitle,
        renderInlineMath: renderInlineMathToHtml,
        // Math stays as `$…$` source while editing (typeset on blur); inline
        // STYLES render live — a completed pair (**bold**, `code`) is converted
        // in place by autoformatInlineMarkdown in handleInput, so it must NOT be
        // held raw here (that was the "stays raw until blur" bug).
        renderInlineMathAsSource: renderSourceForEditing,
        // Links reveal as raw `[text](url)` only during a Ctrl/Cmd-click edit —
        // gesture-gated, NOT tied to focus, so plain click-to-open still works.
        renderLinkAsSource,
      }),
    )
    .join("<br />");
}

function normalizeInlineSource(source: string): string {
  return source.replaceAll(/[\r\n\u200B]/g, "").length === 0 ? "" : source;
}

function isInlineSourceEmpty(source: string): boolean {
  return (
    normalizeInlineSource(source).replaceAll("\u00A0", " ").trim().length === 0
  );
}

function readResolvedThemeName(): ResolvedThemeName {
  if (typeof document === "undefined") {
    return "light";
  }

  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function getThemeDefaultInlineColor(theme: ResolvedThemeName) {
  if (typeof document !== "undefined" && readResolvedThemeName() === theme) {
    const computedInk = normalizeInlineColorToken(
      getComputedStyle(document.documentElement)
        .getPropertyValue("--osio-fg-default")
        .trim(),
    );
    if (computedInk) {
      return computedInk;
    }
  }

  return theme === "dark"
    ? DARK_THEME_DEFAULT_INLINE_COLOR
    : LIGHT_THEME_DEFAULT_INLINE_COLOR;
}

function loadRecentInlineColors() {
  if (globalThis.window === undefined) {
    return [];
  }

  try {
    const stored = JSON.parse(
      globalThis.localStorage.getItem(INLINE_COLOR_RECENTS_STORAGE_KEY) ?? "[]",
    );
    if (!Array.isArray(stored)) {
      return [];
    }

    return stored
      .map((value) =>
        typeof value === "string" ? normalizeInlineColorToken(value) : null,
      )
      .filter((value, index, colors): value is string => {
        return Boolean(value) && colors.indexOf(value) === index;
      })
      .slice(0, MAX_INLINE_COLOR_RECENTS);
  } catch {
    return [];
  }
}

function saveRecentInlineColors(colors: readonly string[]) {
  if (globalThis.window === undefined) {
    return;
  }

  try {
    globalThis.localStorage.setItem(
      INLINE_COLOR_RECENTS_STORAGE_KEY,
      JSON.stringify(colors),
    );
  } catch {
    // localStorage can be unavailable or quota-limited.
  }
}

function recordRecentInlineColor(
  currentColors: readonly string[],
  nextColor: string,
) {
  const normalized = normalizeInlineColorToken(nextColor);
  if (!normalized) {
    return [...currentColors];
  }

  return [
    normalized,
    ...currentColors.filter((color) => color !== normalized),
  ].slice(0, MAX_INLINE_COLOR_RECENTS);
}

function buildInlineColorPresets(
  theme: ResolvedThemeName,
  recentColors: readonly string[],
): ColorPickerPreset[] {
  const defaultColor = getThemeDefaultInlineColor(theme);
  return [
    {
      label: theme === "dark" ? "Dark theme default" : "Light theme default",
      value: defaultColor,
    },
    ...recentColors
      .filter((color) => color !== defaultColor)
      .map((value, index) => ({
        label: `Recent ${index + 1}`,
        value,
      })),
  ];
}

const TOOLBAR_BUTTON_BASE =
  "grid h-8 min-w-8 place-items-center rounded-md border border-transparent px-2 text-xs font-semibold text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-subtle)] hover:text-[var(--osio-fg-default)]";

const TOOLBAR_ACTIVE_BUTTON =
  "border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] text-[var(--osio-fg-default)]";

interface InlineSelectionToolbarProps {
  selection: SelectionSnapshot;
  palette: PaletteKind;
  colorPresets: ColorPickerPreset[];
  defaultColor: string;
  shortcutsOpen: boolean;
  onTogglePalette: (palette: Exclude<PaletteKind, null>) => void;
  onToggleShortcuts: () => void;
  onFormatBold: () => void;
  onFormatItalic: () => void;
  onFormatStrike: () => void;
  onFormatCode: () => void;
  onFormatUnderline: () => void;
  onFormatTextColor: (color: InlineColorOption) => void;
  onFormatBackgroundColor: (color: InlineColorOption) => void;
  onOpenSlashMenu: () => void;
  onOpenLinkPicker: () => void;
  onClearFormat: () => void;
  onToggleMath: () => void;
  blockType?: string;
  onTurnInto?: (type: string) => void;
}

const ToolbarDivider = () => (
  <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-[var(--osio-border-default)]" />
);

const TOOLBAR_ICON = "h-[18px] w-[18px]";

// One icon button shape for the whole toolbar — keeps the 12 controls identical
// (Notion-style: muted SVG that brightens on hover; `active` shows the pressed pill).
const ToolbarIconButton: React.FC<{
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, active, children }) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    aria-pressed={active}
    className={[TOOLBAR_BUTTON_BASE, active ? TOOLBAR_ACTIVE_BUTTON : ""].join(" ")}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
  >
    {children}
  </button>
);

const InlineSelectionToolbar: React.FC<InlineSelectionToolbarProps> = ({
  selection,
  palette,
  colorPresets,
  defaultColor,
  shortcutsOpen,
  onTogglePalette,
  onToggleShortcuts,
  onFormatBold,
  onFormatItalic,
  onFormatStrike,
  onFormatCode,
  onFormatUnderline,
  onFormatTextColor,
  onFormatBackgroundColor,
  onOpenSlashMenu,
  onOpenLinkPicker,
  onClearFormat,
  onToggleMath,
  blockType,
  onTurnInto,
}) => (
  <div
    data-testid="inline-selection-toolbar"
    className="fixed z-[var(--osio-z-max)] -translate-x-1/2"
    style={{
      left: selection.rect.left + selection.rect.width / 2,
      top: Math.max(12, selection.rect.top - 58),
    }}
    onMouseDownCapture={(event) => {
      event.preventDefault();
    }}
    onPointerDownCapture={(event) => {
      event.preventDefault();
    }}
  >
    <div className="relative rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-1.5 py-1 shadow-xl">
      <div className="flex items-center gap-0.5">
        {blockType && onTurnInto ? (
          <>
            <TurnIntoMenu blockType={blockType} onTurnInto={onTurnInto} />
            <ToolbarDivider />
          </>
        ) : null}
        <ToolbarIconButton
          label="Text color"
          active={palette === "text"}
          onClick={() => onTogglePalette("text")}
        >
          <Baseline className={TOOLBAR_ICON} strokeWidth={2.25} aria-hidden />
        </ToolbarIconButton>
        <ToolbarIconButton
          label="Background color"
          active={palette === "background"}
          onClick={() => onTogglePalette("background")}
        >
          <Highlighter className={TOOLBAR_ICON} strokeWidth={2.25} aria-hidden />
        </ToolbarIconButton>
        <ToolbarIconButton label="Bold" onClick={onFormatBold}>
          <Bold className={TOOLBAR_ICON} strokeWidth={2.5} aria-hidden />
        </ToolbarIconButton>
        <ToolbarIconButton label="Italic" onClick={onFormatItalic}>
          <Italic className={TOOLBAR_ICON} strokeWidth={2.5} aria-hidden />
        </ToolbarIconButton>
        <ToolbarIconButton label="Underline" onClick={onFormatUnderline}>
          <Underline className={TOOLBAR_ICON} strokeWidth={2.5} aria-hidden />
        </ToolbarIconButton>
        <ToolbarIconButton label="Clear formatting" onClick={onClearFormat}>
          <RemoveFormatting className={TOOLBAR_ICON} strokeWidth={2.25} aria-hidden />
        </ToolbarIconButton>
        <ToolbarDivider />
        <ToolbarIconButton label="Add link" onClick={onOpenLinkPicker}>
          <Link className={TOOLBAR_ICON} strokeWidth={2.25} aria-hidden />
        </ToolbarIconButton>
        <ToolbarIconButton label="Strikethrough" onClick={onFormatStrike}>
          <Strikethrough className={TOOLBAR_ICON} strokeWidth={2.5} aria-hidden />
        </ToolbarIconButton>
        <ToolbarIconButton label="Inline code" onClick={onFormatCode}>
          <Code className={TOOLBAR_ICON} strokeWidth={2.25} aria-hidden />
        </ToolbarIconButton>
        <ToolbarIconButton label="Equation" onClick={onToggleMath}>
          <Radical className={TOOLBAR_ICON} strokeWidth={2.25} aria-hidden />
        </ToolbarIconButton>
        <ToolbarDivider />
        <ToolbarIconButton
          label="Keyboard shortcuts"
          active={shortcutsOpen}
          onClick={onToggleShortcuts}
        >
          <Keyboard className={TOOLBAR_ICON} strokeWidth={2.25} aria-hidden />
        </ToolbarIconButton>
        <ToolbarIconButton label="Open slash menu" onClick={onOpenSlashMenu}>
          <Slash className={TOOLBAR_ICON} strokeWidth={2.25} aria-hidden />
        </ToolbarIconButton>
      </div>

      {palette && (
        <div
          data-testid={
            palette === "text"
              ? "inline-text-color-palette"
              : "inline-background-color-palette"
          }
          className="absolute left-0 top-full mt-2 rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-2 w-45 h-60 shadow-xl"
        >
          <ColorPickerBoard
            defaultValue={defaultColor}
            label={palette === "text" ? "Text color" : "Background color"}
            presets={colorPresets}
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
        <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-2 shadow-xl">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-[var(--osio-fg-subtle)]">
            Keyboard shortcuts
          </p>
          <ul className="space-y-1">
            <li className="flex items-center justify-between rounded-md px-2 py-1 text-sm text-[var(--osio-fg-default)]">
              <span>Bold</span>
              <span className="text-[var(--osio-fg-muted)]">
                Ctrl/Cmd + B
              </span>
            </li>
            <li className="flex items-center justify-between rounded-md px-2 py-1 text-sm text-[var(--osio-fg-default)]">
              <span>Italic</span>
              <span className="text-[var(--osio-fg-muted)]">
                Ctrl/Cmd + I
              </span>
            </li>
            <li className="flex items-center justify-between rounded-md px-2 py-1 text-sm text-[var(--osio-fg-default)]">
              <span>Underline</span>
              <span className="text-[var(--osio-fg-muted)]">
                Ctrl/Cmd + U
              </span>
            </li>
            <li className="flex items-center justify-between rounded-md px-2 py-1 text-sm text-[var(--osio-fg-default)]">
              <span>Inline code</span>
              <span className="text-[var(--osio-fg-muted)]">
                Ctrl/Cmd + E
              </span>
            </li>
            <li className="flex items-center justify-between rounded-md px-2 py-1 text-sm text-[var(--osio-fg-default)]">
              <span>Strikethrough</span>
              <span className="text-[var(--osio-fg-muted)]">
                Ctrl/Cmd + Shift + X
              </span>
            </li>
            <li className="flex items-center justify-between rounded-md px-2 py-1 text-sm text-[var(--osio-fg-default)]">
              <span>Add link</span>
              <span className="text-[var(--osio-fg-muted)]">
                Ctrl/Cmd + Shift + L
              </span>
            </li>
            <li className="flex items-center justify-between rounded-md px-2 py-1 text-sm text-[var(--osio-fg-default)]">
              <span>Delete previous word</span>
              <span className="text-[var(--osio-fg-muted)]">
                Ctrl + Backspace
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
  style,
  placeholder = "",
  pageId,
  onChange,
  onKeyDown,
  onPaste,
  onRequestSlashMenu,
  onFocus,
  onBlur,
  blockType,
  onTurnInto,
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
  // Ctrl/Cmd-click link editor. The ref mirrors the state so renderContent (a
  // ref-free useCallback) can read "am I revealing link source?" without a dep churn.
  const [linkEditor, setLinkEditor] = useState<LinkEditorTarget | null>(null);
  const linkEditorRef = useRef<LinkEditorTarget | null>(null);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedThemeName>(() =>
    readResolvedThemeName(),
  );
  const [recentInlineColors, setRecentInlineColors] = useState<string[]>(() =>
    loadRecentInlineColors(),
  );
  const [katexReady, setKatexReady] = useState(() => Boolean(getLoadedKatex()));
  const linkPickerRef = useRef<HTMLDivElement | null>(null);
  const canonicalSourceRef = useRef(content);
  const lastEmittedSourceRef = useRef(content);
  const pendingChangeRef = useRef<string | null>(null);
  const pendingChangeFrameRef = useRef<number | null>(null);
  // ponytail: dedup the inline re-serialize. `input` fires before `keyup` for every
  // content-mutating key, so keyup's fallback handleInput() re-walks the DOM for nothing.
  // Set here when input handled it, reset on keydown; keyup only runs when input did NOT.
  const inputHandledRef = useRef(false);
  const renderedContentCache = useRef<{ source: string; html: string }>({
    source: "",
    html: "",
  });

  // ponytail: subscribe to the workspaceId string, not the whole page object — the id is
  // stable across content edits, so a 250ms draft-commit (which rebuilds the edited page
  // object) no longer re-renders every block on the page just to read this value.
  const workspaceId = usePageStore((s) =>
    pageId ? s.pageById(pageId)?.workspaceId : undefined,
  );
  // selectablePages (the internal link-picker list) is the only consumer of the workspace
  // page array, so only subscribe to it while the picker is open — otherwise each commit
  // rebuilds that array ref and re-renders every mounted block over the whole workspace list.
  const linkPickerOpen = linkPicker !== null;
  const workspacePages = usePageStore((s) =>
    linkPickerOpen && workspaceId
      ? (s.pages[workspaceId] ?? EMPTY_WORKSPACE_PAGES)
      : EMPTY_WORKSPACE_PAGES,
  );

  const selectablePages = useMemo(() => {
    const accessContext = getCurrentPageAccessContext();
    return workspacePages.filter(
      (workspacePage) =>
        !workspacePage.archivedAt && canReadPage(workspacePage, accessContext),
    );
  }, [workspacePages]);

  const defaultInlineColor = useMemo(
    () => getThemeDefaultInlineColor(resolvedTheme),
    [resolvedTheme],
  );

  const inlineColorPresets = useMemo(
    () => buildInlineColorPresets(resolvedTheme, recentInlineColors),
    [recentInlineColors, resolvedTheme],
  );

  const getRenderedInlineHtml = useCallback((nextContent: string, renderMathAsSource: boolean, renderLinkAsSource = false) => {
    const cacheKey = `${renderMathAsSource ? "source" : "rendered"}:${renderLinkAsSource ? "linksrc" : "link"}:${katexReady}:${nextContent}`;
    if (renderedContentCache.current.source === cacheKey) {
      return renderedContentCache.current.html;
    }

    const html = nextContent
      ? renderInlineHtmlPreservingLineBreaks(nextContent, renderMathAsSource, renderLinkAsSource)
      : "";
    renderedContentCache.current = {
      source: cacheKey,
      html,
    };
    return html;
  }, [katexReady]);

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
            databaseId: page.databaseId,
          });
        }
      }
    };

    root.addEventListener("click", handleClick);
    return () => root.removeEventListener("click", handleClick);
  }, []);

  useEffect(() => {
    canonicalSourceRef.current = content;
    lastEmittedSourceRef.current = content;
  }, [content]);

  const cancelPendingChangeFrame = useCallback(() => {
    if (pendingChangeFrameRef.current === null) return;
    cancelAnimationFrame(pendingChangeFrameRef.current);
    pendingChangeFrameRef.current = null;
  }, []);

  const emitChange = useCallback((source: string) => {
    if (source === lastEmittedSourceRef.current) return;
    lastEmittedSourceRef.current = source;
    onChange(source);
  }, [onChange]);

  const flushPendingChange = useCallback((fallbackSource?: string | null) => {
    cancelPendingChangeFrame();
    const nextSource = pendingChangeRef.current ?? fallbackSource;
    pendingChangeRef.current = null;
    if (nextSource != null) emitChange(nextSource);
  }, [cancelPendingChangeFrame, emitChange]);

  const scheduleChange = useCallback((source: string) => {
    pendingChangeRef.current = source;
    // Menu triggers ("/", "[[", ":") must reach onChange at their exact char
    // boundary: rAF coalescing swallows it under fast typing ("/toggle" arrives in
    // one frame and never ends with "/"), so the slash/page/emoji menus silently
    // fail to open. Flush those keystrokes synchronously; all others stay batched.
    if (/[/:[]$/.test(source)) {
      flushPendingChange();
      return;
    }
    if (pendingChangeFrameRef.current !== null) return;

    pendingChangeFrameRef.current = requestAnimationFrame(() => {
      pendingChangeFrameRef.current = null;
      const nextSource = pendingChangeRef.current;
      pendingChangeRef.current = null;
      if (nextSource != null) emitChange(nextSource);
    });
  }, [emitChange, flushPendingChange]);


  const renderContent = useCallback(
    (nextContent: string, renderMathAsSource = isFocused.current) => {
      const root = ref.current;
      if (!root) {
        return;
      }

      canonicalSourceRef.current = nextContent;
      const nextHtml = getRenderedInlineHtml(nextContent, renderMathAsSource, linkEditorRef.current !== null);
      if (root.innerHTML !== nextHtml) {
        // Overwriting innerHTML collapses the contenteditable selection to offset 0.
        // While this block is focused (the user is actively typing), a reactive
        // content re-render here would otherwise drift the caret to the start — so
        // save the caret before the rewrite and restore it after, the same pattern
        // handleInput already uses for its normalization rewrite.
        const savedOffsets = isFocused.current
          ? getInlineEditorSelectionOffsets(root)
          : null;
        root.innerHTML = nextHtml;
        if (savedOffsets) {
          setInlineEditorSelectionOffsets(root, savedOffsets);
        }
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

  // Lazily pull in katex only when this block actually contains inline math,
  // then flip katexReady so the cached HTML re-renders with typeset math.
  useEffect(() => {
    if (katexReady || !INLINE_MATH_PATTERN.test(content)) return;
    const unsubscribe = onKatexReady(() => setKatexReady(true));
    void loadKatex();
    return unsubscribe;
  }, [content, katexReady]);

  // Once katex is ready, re-render the typeset (unfocused) view. While focused,
  // math is shown as raw source, so no katex upgrade is needed.
  useEffect(() => {
    if (katexReady && !isFocused.current) renderContent(content);
  }, [katexReady, content, renderContent]);

  useEffect(() => {
    if (selectionSnapshot) {
      lastSelectionSnapshotRef.current = selectionSnapshot;
    }
  }, [selectionSnapshot]);

  const updateSelectionSnapshot = useCallback(() => {
    const root = ref.current;
    // A cross-block drag owns the selection UI (DOM seam, same family as
    // data-pane-resizing) — the per-block toolbar stands down entirely.
    if (document.body.dataset.crossTextActive) {
      lastSelectionSnapshotRef.current = null;
      setSelectionSnapshot((current) => (current ? null : current));
      setOpenPalette((current) => (current ? null : current));
      return;
    }
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

  // Only the FOCUSED block listens for selectionchange. Previously every mounted
  // block attached its own document-level listener, so each caret move (i.e. every
  // keystroke) invoked O(mounted blocks) handlers — same disease the scroll
  // listener below already cured. Blur clears the snapshot with the identical
  // guard, so detaching while unfocused loses nothing.
  useEffect(() => {
    if (!hasFocus) return;
    const handleSelectionChange = () => updateSelectionSnapshot();
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [hasFocus, updateSelectionSnapshot]);

  // Reposition the floating toolbar on scroll/resize — but ONLY for the block
  // that currently has a selection. Previously every block attached a
  // capture-phase window scroll listener, so scrolling fired O(blocks) handlers
  // per tick and stuttered. Now at most one block (the selected one) listens.
  useEffect(() => {
    if (!selectionSnapshot) return;
    const reposition = () => updateSelectionSnapshot();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [selectionSnapshot, updateSelectionSnapshot]);

  const syncContentFromDom = useCallback(() => {
    if (!ref.current) {
      return null;
    }

    const { source } = readInlineEditorDomState(ref.current);
    const normalizedSource = normalizeInlineSource(source);
    canonicalSourceRef.current = normalizedSource;
    flushPendingChange(normalizedSource);
    return normalizedSource;
  }, [flushPendingChange]);

  useEffect(() => () => flushPendingChange(), [flushPendingChange]);

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

    // Live markdown autoformat: when a collapsed caret just typed a CLOSING style
    // delimiter that completed a pair (**bold**, `code`, *i*, ~~s~~, ==h==, ***bi***),
    // consume the delimiters and render styled IN PLACE — for every inline style in
    // the block, not just the first.
    const caret = caretRangeInRoot(root);
    if (caret && endsWithInlineCloser(caret)) {
      // sourceCaret indexes into the RAW DOM-read `source` (where `**B**` is still
      // literal) — autoformat does its own parse of the left side.
      const sourceCaret = inlineSourceCaretOffset(root, caret);
      const auto = autoformatInlineMarkdown(source, sourceCaret);
      if (auto) {
        canonicalSourceRef.current = auto.source;
        root.innerHTML = getRenderedInlineHtml(auto.source, true);
        setInlineCaretAfterStyledBoundary(root, auto.caret);
        scheduleChange(auto.source);
        inputHandledRef.current = true;
        requestAnimationFrame(updateSelectionSnapshot);
        return;
      }
    }

    if (requiresNormalization) {
      const parsedHtml = getRenderedInlineHtml(normalizedSource, true);

      if (root.innerHTML !== parsedHtml) {
        // The innerHTML teardown + caret restore is the heavy per-keystroke cost
        // that makes held Backspace / fast typing feel sluggish. It is only needed
        // when the canonical render carries inline MARKUP (a tag), or the live DOM
        // has stray markup to clean (a <br>/span left by editing). When both sides
        // are tag-free the difference is benign text-node fragmentation that renders
        // identically — skip the teardown and let the cheap serialize + rAF-batched
        // onChange carry it, so plain-text editing stays smooth.
        if (parsedHtml.includes("<") || root.innerHTML.includes("<")) {
          root.innerHTML = parsedHtml;
          if (selectionOffsets) {
            setInlineEditorSelectionOffsets(root, selectionOffsets);
          }
        }
      }
    }

    scheduleChange(normalizedSource);
    inputHandledRef.current = true;
    requestAnimationFrame(updateSelectionSnapshot);
  }, [getRenderedInlineHtml, scheduleChange, updateSelectionSnapshot]);

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

      // ponytail: only re-serialize on keyup if the `input` event didn't already (rare).
      if (!inputHandledRef.current) {
        handleInput();
      }
    },
    [handleInput],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      onPaste?.(e);
    },
    [onPaste],
  );

  // Ctrl/Cmd-click a link: reveal its raw `[text](url)` inline AND open the fields
  // panel. The clicked anchor's position among .editor-link nodes maps to the Nth
  // link in source (findLinks), which is the source-truth text/href — so an empty
  // `[label]()` opens with a blank URL to fill rather than a dead `#`.
  const openLinkEditorForAnchor = useCallback(
    (e: React.MouseEvent, anchor: HTMLAnchorElement): boolean => {
      const root = ref.current;
      if (!root) return false;
      const rawHref = anchor.getAttribute("href") ?? "";
      // Internal page links keep their open-the-page behavior (edited via the page).
      if (getInternalPageIdFromHref(normalizeInlineLinkHref(rawHref))) return false;

      const anchors = Array.from(root.querySelectorAll("a.editor-link"));
      const domIndex = anchors.indexOf(anchor);
      const links = findLinks(canonicalSourceRef.current);
      const anchorText = (anchor.textContent ?? "").replaceAll("​", "");
      const link = links[domIndex] ?? links.find((l) => l.text === anchorText);
      if (!link) return false;

      e.preventDefault();
      e.stopPropagation();
      const box = anchor.getBoundingClientRect();
      const target: LinkEditorTarget = {
        index: links.indexOf(link),
        text: link.text,
        href: link.href,
        rect: { left: box.left, top: box.top, bottom: box.bottom },
      };
      linkEditorRef.current = target;
      setLinkEditor(target);
      renderContent(canonicalSourceRef.current);
      return true;
    },
    [renderContent],
  );

  const applyLinkEdit = useCallback(
    (next: { text: string; href: string }) => {
      const target = linkEditorRef.current;
      if (!target) return;
      const nextContent = replaceLink(canonicalSourceRef.current, target.index, next);
      if (nextContent === canonicalSourceRef.current) return;
      flushPendingChange();
      emitChange(nextContent);
      renderContent(nextContent);
      const updated = { ...target, text: next.text || next.href, href: next.href };
      linkEditorRef.current = updated;
      setLinkEditor(updated);
    },
    [emitChange, flushPendingChange, renderContent],
  );

  const removeLinkAt = useCallback(() => {
    const target = linkEditorRef.current;
    if (!target) return;
    const nextContent = removeLink(canonicalSourceRef.current, target.index);
    linkEditorRef.current = null;
    setLinkEditor(null);
    flushPendingChange();
    emitChange(nextContent);
    renderContent(nextContent);
  }, [emitChange, flushPendingChange, renderContent]);

  const closeLinkEditor = useCallback(() => {
    if (!linkEditorRef.current) return;
    linkEditorRef.current = null;
    setLinkEditor(null);
    renderContent(canonicalSourceRef.current);
  }, [renderContent]);

  const handleOpenLinkUrl = useCallback((href: string) => {
    const normalized = normalizeInlineLinkHref(href);
    if (normalized) globalThis.open(normalized, "_blank", "noopener,noreferrer");
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (!target) {
      return;
    }

    if (handleMentionMouseDown(e, target)) {
      return;
    }

    if (e.metaKey || e.ctrlKey) {
      const anchor = target.closest("a.editor-link") as HTMLAnchorElement | null;
      if (anchor && openLinkEditorForAnchor(e, anchor)) {
        return;
      }
    }

    handleAnchorMouseDown(e, target);
  }, [openLinkEditorForAnchor]);

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

      flushPendingChange();
      emitChange(nextContent);
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
    [emitChange, flushPendingChange, renderContent, selectionSnapshot, updateSelectionSnapshot],
  );

  const handleToggleInlineFormat = useCallback(
    (format: "bold" | "italic" | "strikethrough" | "underline") => {
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
      setRecentInlineColors((currentColors) => {
        const nextColors = recordRecentInlineColor(currentColors, color.id);
        saveRecentInlineColors(nextColors);
        return nextColors;
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

  const handleClearFormat = useCallback(() => {
    applyInlineFormattingCommand({ type: "clear_format" });
  }, [applyInlineFormattingCommand]);

  const handleToggleMath = useCallback(() => {
    applyInlineFormattingCommand({ type: "toggle_math" });
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

      if (key === "u") {
        event.preventDefault();
        handleToggleInlineFormat("underline");
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
      // ponytail: reset the dedup flag before input/keyup for this keystroke fire.
      inputHandledRef.current = false;

      if (handleInlineFormattingShortcut(e)) {
        requestAnimationFrame(updateSelectionSnapshot);
        return;
      }

      // A held Backspace/Delete fires this keydown on every OS auto-repeat tick.
      // Flushing the rAF-batched onChange synchronously per tick forces a parent
      // re-render for every deleted char (the "held-Backspace lag") — yet the
      // parent's structural delete handlers only act at the block edge
      // (start-outdent self-flushes via flushPendingBlockDraft; empty-block merge
      // needs no text). So for a collapsed caret away from the start, skip the
      // flush and let scheduleChange batch, exactly like printable typing; keep
      // the synchronous flush at the edge (offset 0) and for selection-deletes.
      let skipDeleteFlush = false;
      if ((e.key === "Backspace" || e.key === "Delete") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const offsets = ref.current ? getInlineEditorSelectionOffsets(ref.current) : null;
        skipDeleteFlush = !!offsets && offsets.start === offsets.end && offsets.start > 0;
      }

      if (!skipDeleteFlush && (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey)) {
        flushPendingChange(canonicalSourceRef.current);
      }

      onKeyDown(e);
      requestAnimationFrame(updateSelectionSnapshot);
    },
    [flushPendingChange, handleInlineFormattingShortcut, onKeyDown, updateSelectionSnapshot],
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
      top: effectiveSelection.rect.top,
    });
    setSelectionSnapshot(null);
    lastSelectionSnapshotRef.current = null;
    setOpenPalette(null);
  }, [onRequestSlashMenu, selectionSnapshot]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setResolvedTheme(readResolvedThemeName());
    });

    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      observer.disconnect();
    };
  }, []);

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

  // Close the link editor on Escape or a click outside both the panel and this
  // block (a click inside the block keeps it open — that's inline source editing).
  useEffect(() => {
    if (!linkEditor) {
      return;
    }
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-link-editor-panel]")) return;
      if (ref.current?.contains(target)) return;
      closeLinkEditor();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeLinkEditor();
    };
    document.addEventListener("mousedown", handleOutside, true);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside, true);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [linkEditor, closeLinkEditor]);

  return (
    <>
      <div // NOSONAR - contentEditable is required for this osionos-like editor UX
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder || "Editable text block"}
        tabIndex={0}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        data-placeholder={hasFocus ? placeholder : ""}
        data-empty={hasFocus && isPlaceholderVisible}
        className={`outline-none whitespace-pre-wrap break-words data-[empty=true]:before:content-[attr(data-placeholder)] data-[empty=true]:before:text-[var(--osio-fg-subtle)] data-[empty=true]:before:pointer-events-none ${className}`}
        style={style}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onPaste={handlePaste}
        onMouseDown={handleMouseDown}
        onFocus={(event) => {
          onFocus?.(event);
          isFocused.current = true;
          setHasFocus(true);
          renderContent(content, true);
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
          renderContent(syncedContent ?? content, false);
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

      {linkEditor && typeof document !== "undefined"
        ? createPortal(
            <LinkEditorPanel
              text={linkEditor.text}
              href={linkEditor.href}
              rect={linkEditor.rect}
              onApply={applyLinkEdit}
              onOpenUrl={handleOpenLinkUrl}
              onRemove={removeLinkAt}
              onClose={closeLinkEditor}
            />,
            document.body,
          )
        : null}

      {selectionSnapshot && typeof document !== "undefined"
        ? createPortal(
            <InlineSelectionToolbar
              selection={selectionSnapshot}
              palette={openPalette}
              colorPresets={inlineColorPresets}
              defaultColor={defaultInlineColor}
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
              onFormatUnderline={() => handleToggleInlineFormat("underline")}
              onFormatStrike={() => handleToggleInlineFormat("strikethrough")}
              onFormatCode={handleToggleCode}
              onFormatTextColor={(color) => handleApplyColor("text", color)}
              onFormatBackgroundColor={(color) =>
                handleApplyColor("background", color)
              }
              onOpenSlashMenu={handleOpenSlashMenu}
              onOpenLinkPicker={handleAddLink}
              onClearFormat={handleClearFormat}
              onToggleMath={handleToggleMath}
              blockType={blockType}
              onTurnInto={onTurnInto}
            />,
            document.body,
          )
        : null}

      {selectionSnapshot && linkPicker && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={linkPickerRef}
              data-testid="inline-link-picker"
              className="fixed z-[var(--osio-z-max)] w-80 rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] shadow-xl"
              style={{
                left: selectionSnapshot.rect.left,
                top: Math.max(12, selectionSnapshot.rect.bottom + 8),
              }}
            >
              {linkPicker.mode === "chooser" && (
                <div className="p-2">
                  <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-[var(--osio-fg-subtle)]">
                    Link type
                  </p>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      className="rounded-lg px-3 py-2 text-left text-sm text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-subtle)]"
                      onClick={() =>
                        setLinkPicker({ mode: "external", query: "https://" })
                      }
                    >
                      Web link
                    </button>
                    <button
                      type="button"
                      className="rounded-lg px-3 py-2 text-left text-sm text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-subtle)]"
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
                    className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-[var(--osio-fg-subtle)]"
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
                    className="w-full rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm text-[var(--osio-fg-default)] outline-none focus:border-[var(--osio-accent)]"
                    placeholder="https://example.com"
                  />
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-lg px-3 py-2 text-sm text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-subtle)]"
                      onClick={() => setLinkPicker(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-lg bg-[var(--osio-accent)] px-3 py-2 text-sm font-medium text-[var(--osio-accent-fg)] hover:opacity-90"
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
                    className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-[var(--osio-fg-subtle)]"
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
                    className="w-full rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm text-[var(--osio-fg-default)] outline-none focus:border-[var(--osio-accent)]"
                    placeholder="Search pages"
                  />
                  <div
                    data-testid="inline-page-link-results"
                    className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-[var(--osio-border-default)]"
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
                          className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-subtle)]"
                          onClick={() =>
                            handleApplyInternalLink(workspacePage._id)
                          }
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--osio-bg-subtle)] text-xs text-[var(--osio-fg-muted)]">
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
                      <p className="px-3 py-2 text-sm text-[var(--osio-fg-subtle)]">
                        No pages match your search.
                      </p>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-lg px-3 py-2 text-sm text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-subtle)]"
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
