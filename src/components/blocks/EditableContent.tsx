/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   EditableContent.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 19:04:24 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/15 17:22:48 by rstancu          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ColorPickerBoard } from "@univers42/ui-collection";
import { parseInlineMarkdown } from "@/shared/lib/markengine";
import {
  getInlineColorOption,
  INLINE_COLOR_OPTIONS,
  type InlineColorOption,
  normalizeInlineColorToken,
} from "@/shared/lib/markengine/inlineTextStyles";
import { usePageStore } from "@/store/usePageStore";

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

interface SelectionSnapshot {
  start: number;
  end: number;
  rect: DOMRect;
}

interface SelectionOffsets {
  start: number;
  end: number;
}

type PaletteKind = "text" | "background" | null;
type LinkPickerMode = "chooser" | "external" | "internal";

const EMPTY_WORKSPACE_PAGES: readonly never[] = [];
const DEFAULT_INLINE_COLOR = INLINE_COLOR_OPTIONS[0]?.id ?? "#0F172A";

interface LinkPickerState {
  mode: LinkPickerMode;
  query: string;
}

interface LegacyExecCommandDocument {
  execCommand(commandId: string, showUI?: boolean, value?: string): boolean;
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

function normalizeHref(href: string) {
  const cleanHref = href.trim();
  if (!cleanHref) {
    return cleanHref;
  }

  if (cleanHref.startsWith(INTERNAL_PAGE_LINK_PREFIX)) {
    return cleanHref;
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(cleanHref) || cleanHref.startsWith("//")) {
    return cleanHref.startsWith("//") ? `https:${cleanHref}` : cleanHref;
  }

  if (
    /^[^\s/]+\.[^\s/]+(?:[/?#].*)?$/i.test(cleanHref) &&
    !cleanHref.startsWith("/") &&
    !cleanHref.startsWith("#")
  ) {
    return `https://${cleanHref}`;
  }

  return cleanHref;
}

function getSelectionRange(root: HTMLElement): Range | null {
  const selection = globalThis.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) {
    return null;
  }

  return range;
}

function getSelectionSnapshot(root: HTMLElement): SelectionSnapshot | null {
  const range = getSelectionRange(root);
  if (!range) {
    return null;
  }

  const startRange = range.cloneRange();
  startRange.selectNodeContents(root);
  startRange.setEnd(range.startContainer, range.startOffset);

  const endRange = range.cloneRange();
  endRange.selectNodeContents(root);
  endRange.setEnd(range.endContainer, range.endOffset);

  const start = startRange.toString().length;
  const end = endRange.toString().length;
  if (start === end) {
    return null;
  }

  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return null;
  }

  return { start, end, rect };
}

function getSelectionOffsets(root: HTMLElement): SelectionOffsets | null {
  const selection = globalThis.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) {
    return null;
  }

  const startRange = range.cloneRange();
  startRange.selectNodeContents(root);
  startRange.setEnd(range.startContainer, range.startOffset);

  const endRange = range.cloneRange();
  endRange.selectNodeContents(root);
  endRange.setEnd(range.endContainer, range.endOffset);

  return {
    start: startRange.toString().length,
    end: endRange.toString().length,
  };
}

function setSelectionOffsets(root: HTMLElement, start: number, end: number) {
  const selection = globalThis.getSelection();
  if (!selection) {
    return;
  }

  const range = document.createRange();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  let currentNode: Node | null = walker.nextNode();
  let offset = 0;
  let startNode: Node | null = null;
  let endNode: Node | null = null;
  let startOffset = 0;
  let endOffset = 0;

  while (currentNode) {
    const length = currentNode.textContent?.length ?? 0;
    if (!startNode && start <= offset + length) {
      startNode = currentNode;
      startOffset = Math.max(0, start - offset);
    }
    if (!endNode && end <= offset + length) {
      endNode = currentNode;
      endOffset = Math.max(0, end - offset);
      break;
    }
    offset += length;
    currentNode = walker.nextNode();
  }

  if (!startNode || !endNode) {
    range.selectNodeContents(root);
    range.collapse(false);
  } else {
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
  }

  selection.removeAllRanges();
  selection.addRange(range);
}

function normalizeElementColor(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return normalizeInlineColorToken(value);
}

function isBoldElement(element: HTMLElement) {
  if (element.dataset.inlineType === "bold") {
    return true;
  }

  if (element.tagName === "STRONG" || element.tagName === "B") {
    return true;
  }

  const fontWeight = element.style.fontWeight;
  return fontWeight === "bold" || Number(fontWeight) >= 600;
}

function isItalicElement(element: HTMLElement) {
  return (
    element.dataset.inlineType === "italic" ||
    element.tagName === "EM" ||
    element.tagName === "I" ||
    element.style.fontStyle === "italic"
  );
}

function isStrikeElement(element: HTMLElement) {
  return (
    element.dataset.inlineType === "strikethrough" ||
    element.tagName === "DEL" ||
    element.tagName === "S" ||
    element.tagName === "STRIKE" ||
    element.style.textDecoration.includes("line-through")
  );
}

function isCodeElement(element: HTMLElement) {
  return element.dataset.inlineType === "code" || element.tagName === "CODE";
}

function isTextColorElement(element: HTMLElement) {
  return (
    element.dataset.inlineType === "text_color" ||
    (!!element.style.color &&
      normalizeElementColor(element.style.color) !== null) ||
    (!!element.getAttribute("color") &&
      normalizeElementColor(element.getAttribute("color")) !== null)
  );
}

function isBackgroundColorElement(element: HTMLElement) {
  return (
    element.dataset.inlineType === "background_color" ||
    (!!element.style.backgroundColor &&
      normalizeElementColor(element.style.backgroundColor) !== null)
  );
}

function serializeTextNode(node: Node): string {
  return node.textContent ?? "";
}

function serializeBlockElement(
  element: HTMLElement,
  children: string,
): string | null {
  switch (element.tagName) {
    case "BR":
      return "\n";
    case "DIV":
    case "P":
      return children;
    default:
      return null;
  }
}

function serializeLinkElement(
  element: HTMLElement,
  children: string,
): string | null {
  const href = element.getAttribute("href");
  return href ? `[${children}](${href})` : null;
}

function serializeFormattedElement(
  element: HTMLElement,
  children: string,
): string | null {
  if (isCodeElement(element)) {
    return `[code]${children}[/code]`;
  }

  let serialized = children;
  let hasFormatting = false;

  const link = serializeLinkElement(element, serialized);
  if (link) {
    serialized = link;
    hasFormatting = true;
  }

  if (isBoldElement(element)) {
    serialized = `[b]${serialized}[/b]`;
    hasFormatting = true;
  }

  if (isItalicElement(element)) {
    serialized = `[i]${serialized}[/i]`;
    hasFormatting = true;
  }

  if (isStrikeElement(element)) {
    serialized = `[s]${serialized}[/s]`;
    hasFormatting = true;
  }

  if (element.tagName === "U") {
    serialized = `[u]${serialized}[/u]`;
    hasFormatting = true;
  }

  if (element.tagName === "MARK") {
    serialized = `[mark]${serialized}[/mark]`;
    hasFormatting = true;
  }

  if (isTextColorElement(element)) {
    const color =
      normalizeElementColor(element.dataset.inlineColor) ??
      normalizeElementColor(element.style.color) ??
      normalizeElementColor(element.getAttribute("color"));
    if (color) {
      serialized = `[color=${color}]${serialized}[/color]`;
      hasFormatting = true;
    }
  }

  if (isBackgroundColorElement(element)) {
    const color =
      normalizeElementColor(element.dataset.inlineColor) ??
      normalizeElementColor(element.style.backgroundColor);
    if (color) {
      serialized = `[bg=${color}]${serialized}[/bg]`;
      hasFormatting = true;
    }
  }

  return hasFormatting ? serialized : null;
}

function serializeEditableNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return serializeTextNode(node);
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const element = node as HTMLElement;
  const children = Array.from(element.childNodes)
    .map(serializeEditableNode)
    .join("");

  const block = serializeBlockElement(element, children);
  if (block !== null) {
    return block;
  }

  const formatted = serializeFormattedElement(element, children);
  return formatted ?? children;
}

function serializeEditableContent(root: HTMLElement) {
  return Array.from(root.childNodes).map(serializeEditableNode).join("");
}

function selectCurrentRange(range: Range) {
  const selection = globalThis.getSelection();
  if (!selection) {
    return;
  }

  selection.removeAllRanges();
  selection.addRange(range);
}

function unwrapElement(element: HTMLElement) {
  const parent = element.parentNode;
  if (!parent) {
    return;
  }

  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }

  element.remove();
}

function getClosestFormatElement(
  node: Node,
  root: HTMLElement,
  predicate: (element: HTMLElement) => boolean,
) {
  let current: HTMLElement | null =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : node.parentElement;

  while (current && current !== root) {
    if (predicate(current)) {
      return current;
    }
    current = current.parentElement;
  }

  return null;
}

function getSharedFormatElement(
  range: Range,
  root: HTMLElement,
  predicate: (element: HTMLElement) => boolean,
) {
  const startMatch = getClosestFormatElement(
    range.startContainer,
    root,
    predicate,
  );
  if (startMatch?.contains(range.endContainer)) {
    return startMatch;
  }

  const endMatch = getClosestFormatElement(range.endContainer, root, predicate);
  if (endMatch?.contains(range.startContainer)) {
    return endMatch;
  }

  return null;
}

function getFormatDepth(element: HTMLElement, root: HTMLElement) {
  let depth = 0;
  let current: HTMLElement | null = element;
  while (current && current !== root) {
    depth += 1;
    current = current.parentElement;
  }
  return depth;
}

function getMatchingFormatAncestors(
  node: Node,
  root: HTMLElement,
  predicate: (element: HTMLElement) => boolean,
) {
  const matches: HTMLElement[] = [];
  let current: HTMLElement | null =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : node.parentElement;

  while (current && current !== root) {
    if (predicate(current)) {
      matches.push(current);
    }
    current = current.parentElement;
  }

  return matches;
}

function getFormatElementsForRange(
  range: Range,
  root: HTMLElement,
  predicate: (element: HTMLElement) => boolean,
) {
  const elements = new Set<HTMLElement>();
  const commonAncestor =
    range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? (range.commonAncestorContainer as HTMLElement)
      : range.commonAncestorContainer.parentElement;

  for (const element of getMatchingFormatAncestors(
    range.startContainer,
    root,
    predicate,
  )) {
    elements.add(element);
  }

  for (const element of getMatchingFormatAncestors(
    range.endContainer,
    root,
    predicate,
  )) {
    elements.add(element);
  }

  if (commonAncestor && commonAncestor !== root && predicate(commonAncestor)) {
    elements.add(commonAncestor);
  }

  return Array.from(elements).sort(
    (left, right) => getFormatDepth(right, root) - getFormatDepth(left, root),
  );
}

function unwrapElements(elements: HTMLElement[]) {
  for (const element of elements) {
    if (element.isConnected) {
      unwrapElement(element);
    }
  }
}

function createCodeElement() {
  const code = document.createElement("code");
  code.dataset.inlineType = "code";
  code.className = "inline-code";
  code.style.backgroundColor =
    "var(--inline-code-background,var(--color-surface-tertiary-soft2))";
  code.style.border = "1px solid var(--color-line)";
  code.style.borderRadius = "6px";
  code.style.padding = "0 0.35em";
  code.style.fontFamily =
    "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
  code.style.fontSize = "0.92em";
  code.style.color = "var(--inline-code-color,currentColor)";
  code.style.textDecorationColor =
    "var(--inline-code-decoration-color,currentColor)";
  code.style.setProperty("--inline-background-fill", "transparent");
  code.style.setProperty("--inline-background-padding", "0");
  code.style.setProperty("--inline-background-radius", "0");
  return code;
}

function createColorElement(
  kind: "text" | "background",
  option: InlineColorOption,
) {
  const span = document.createElement("span");
  span.dataset.inlineType = kind === "text" ? "text_color" : "background_color";
  span.dataset.inlineColor = option.id;

  if (kind === "text") {
    span.style.color = option.textColor;
    span.style.textDecorationColor = option.textColor;
    span.style.setProperty("--inline-code-color", option.textColor);
    span.style.setProperty("--inline-code-decoration-color", option.textColor);
  } else {
    span.style.setProperty(
      "background-color",
      `var(--inline-background-fill, ${option.backgroundColor})`,
    );
    span.style.borderRadius = "var(--inline-background-radius, 4px)";
    span.style.padding = "var(--inline-background-padding, 0 0.2em)";
    span.style.setProperty("--inline-code-background", option.backgroundColor);
  }

  return span;
}

function isFormattingWrapperElement(element: HTMLElement) {
  return (
    isBoldElement(element) ||
    isItalicElement(element) ||
    isStrikeElement(element) ||
    isTextColorElement(element) ||
    isBackgroundColorElement(element) ||
    element.tagName === "U" ||
    element.tagName === "MARK"
  );
}

function shouldSuppressBackgroundElement(
  node: Node,
  allowCodeDescendant = false,
): boolean {
  if (node.nodeType === Node.TEXT_NODE) {
    return !node.textContent?.trim();
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return true;
  }

  const element = node as HTMLElement;
  if (isCodeElement(element)) {
    return true;
  }

  if (!isFormattingWrapperElement(element) && element.tagName !== "SPAN") {
    return false;
  }

  const hasCodeDescendant =
    allowCodeDescendant ||
    !!element.querySelector('[data-inline-type="code"], code');

  if (!hasCodeDescendant) {
    return false;
  }

  return Array.from(element.childNodes).every((child) =>
    shouldSuppressBackgroundElement(child, hasCodeDescendant),
  );
}

function syncBackgroundColorSuppression(root: HTMLElement) {
  const elements = root.querySelectorAll<HTMLElement>(
    '[data-inline-type="background_color"]',
  );

  for (const element of elements) {
    if (shouldSuppressBackgroundElement(element)) {
      element.style.setProperty("--inline-background-fill", "transparent");
      element.style.setProperty("--inline-background-padding", "0");
      element.style.setProperty("--inline-background-radius", "0");
      continue;
    }

    element.style.removeProperty("--inline-background-fill");
    element.style.removeProperty("--inline-background-padding");
    element.style.removeProperty("--inline-background-radius");
  }
}

function runLegacyExecCommand(command: string, value?: string): boolean {
  const legacyDocument = document as unknown as LegacyExecCommandDocument;
  return legacyDocument.execCommand(command, false, value);
}

function wrapRange(range: Range, wrapper: HTMLElement) {
  const fragment = range.extractContents();
  if (!fragment.textContent?.trim()) {
    return null;
  }

  wrapper.append(fragment);
  range.insertNode(wrapper);
  range.selectNodeContents(wrapper);
  selectCurrentRange(range);
  return wrapper;
}

const TOOLBAR_BUTTON_BASE =
  "grid h-8 min-w-8 place-items-center rounded-md border border-transparent px-2 text-xs font-semibold text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-ink)]";

const TOOLBAR_ACTIVE_BUTTON =
  "border-[var(--color-line)] bg-[var(--color-surface-secondary)] text-[var(--color-ink)]";

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
          className="absolute left-0 top-full mt-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-primary)] p-2 shadow-xl"
          onMouseDown={(e) => e.preventDefault()}
        >
          <ColorPickerBoard
            defaultValue={DEFAULT_INLINE_COLOR}
            label={palette === "text" ? "Text color" : "Background color"}
            presets={INLINE_COLOR_OPTIONS}
            showInput={false}
            size={158}
            variant="wheel"
            styles={{
              presetButton: {
                gap: 0,
                padding: "8px",
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
  const [openPalette, setOpenPalette] = useState<PaletteKind>(null);
  const [linkPicker, setLinkPicker] = useState<LinkPickerState | null>(null);
  const linkPickerRef = useRef<HTMLDivElement | null>(null);

  const currentPage = usePageStore((s) =>
    pageId ? s.pageById(pageId) : undefined,
  );
  const workspacePages = usePageStore((s) =>
    currentPage?.workspaceId
      ? s.pagesForWorkspace(currentPage.workspaceId)
      : EMPTY_WORKSPACE_PAGES,
  );

  const selectablePages = workspacePages.filter(
    (workspacePage) => !workspacePage.archivedAt,
  );

  const renderContent = useCallback((nextContent: string) => {
    if (!ref.current) {
      return;
    }

    ref.current.innerHTML = nextContent ? parseInlineMarkdown(nextContent) : "";
    syncBackgroundColorSuppression(ref.current);
  }, []);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    const serialized = serializeEditableContent(ref.current);
    if (serialized === content) {
      return;
    }

    renderContent(content);
  }, [content, renderContent]);

  const updateSelectionSnapshot = useCallback(() => {
    const root = ref.current;
    if (!root || !isFocused.current) {
      if (!linkPicker) {
        setSelectionSnapshot(null);
      }
      setOpenPalette(null);
      return;
    }

    const snapshot = getSelectionSnapshot(root);
    setSelectionSnapshot(snapshot);
    if (!snapshot) {
      setOpenPalette(null);
    }
  }, [linkPicker]);

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
      return;
    }

    onChange(serializeEditableContent(ref.current));
  }, [onChange]);

  const handleInput = useCallback(() => {
    if (isComposing.current) {
      return;
    }

    const root = ref.current;
    if (!root) {
      return;
    }

    const selectionOffsets = getSelectionOffsets(root);
    const serialized = serializeEditableContent(root);
    const parsedHtml = serialized ? parseInlineMarkdown(serialized) : "";

    if (root.innerHTML !== parsedHtml) {
      root.innerHTML = parsedHtml;
      syncBackgroundColorSuppression(root);
      if (selectionOffsets) {
        setSelectionOffsets(root, selectionOffsets.start, selectionOffsets.end);
      }
    }

    onChange(serialized);
    requestAnimationFrame(updateSelectionSnapshot);
  }, [onChange, updateSelectionSnapshot]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown(e);
      requestAnimationFrame(updateSelectionSnapshot);
    },
    [onKeyDown, updateSelectionSnapshot],
  );

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

    const normalizedHref = normalizeHref(anchor.getAttribute("href") ?? href);
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

  const applyDomMutation = useCallback(
    (mutate: (root: HTMLElement, range: Range) => void) => {
      const root = ref.current;
      if (!root || !selectionSnapshot) {
        return;
      }

      let range = getSelectionRange(root);
      if (!range) {
        setSelectionOffsets(
          root,
          selectionSnapshot.start,
          selectionSnapshot.end,
        );
        range = getSelectionRange(root);
      }
      if (!range) {
        return;
      }

      mutate(root, range);
      root.normalize();
      syncBackgroundColorSuppression(root);
      syncContentFromDom();
      root.focus();

      requestAnimationFrame(() => {
        setSelectionOffsets(
          root,
          selectionSnapshot.start,
          selectionSnapshot.end,
        );
        updateSelectionSnapshot();
      });
    },
    [selectionSnapshot, syncContentFromDom, updateSelectionSnapshot],
  );

  const execInlineCommand = useCallback(
    (command: string, value?: string) => {
      applyDomMutation(() => {
        runLegacyExecCommand("styleWithCSS", "true");
        runLegacyExecCommand(command, value);
      });
    },
    [applyDomMutation],
  );

  const handleApplyColor = useCallback(
    (kind: "text" | "background", color: InlineColorOption) => {
      applyDomMutation((root, range) => {
        const existing = getSharedFormatElement(
          range,
          root,
          kind === "text" ? isTextColorElement : isBackgroundColorElement,
        );

        if (existing) {
          const currentColor =
            normalizeElementColor(existing.dataset.inlineColor) ??
            normalizeElementColor(
              kind === "text"
                ? existing.style.color
                : existing.style.backgroundColor,
            );

          if (currentColor === color.id) {
            unwrapElement(existing);
            return;
          }

          existing.dataset.inlineType =
            kind === "text" ? "text_color" : "background_color";
          existing.dataset.inlineColor = color.id;

          if (kind === "text") {
            existing.style.color = color.textColor;
            existing.style.textDecorationColor = color.textColor;
            existing.style.setProperty("--inline-code-color", color.textColor);
            existing.style.setProperty(
              "--inline-code-decoration-color",
              color.textColor,
            );
          } else {
            existing.style.setProperty(
              "background-color",
              `var(--inline-background-fill, ${color.backgroundColor})`,
            );
            existing.style.borderRadius = "var(--inline-background-radius, 4px)";
            existing.style.padding =
              "var(--inline-background-padding, 0 0.2em)";
            existing.style.setProperty(
              "--inline-code-background",
              color.backgroundColor,
            );
          }
          return;
        }

        wrapRange(range, createColorElement(kind, color));
      });

      setOpenPalette(null);
    },
    [applyDomMutation],
  );

  const handleToggleCode = useCallback(() => {
    applyDomMutation((root, range) => {
      const existing = getFormatElementsForRange(range, root, isCodeElement);
      if (existing.length > 0) {
        unwrapElements(existing);
        return;
      }

      wrapRange(range, createCodeElement());
    });
  }, [applyDomMutation]);

  const handleAddLink = useCallback(() => {
    if (!selectionSnapshot) {
      return;
    }

    setLinkPicker({ mode: "chooser", query: "" });
  }, [selectionSnapshot]);

  const handleApplyExternalLink = useCallback(
    (url: string) => {
      const cleanUrl = normalizeHref(url);
      if (!cleanUrl) {
        return;
      }

      execInlineCommand("createLink", cleanUrl);
      setLinkPicker(null);
    },
    [execInlineCommand],
  );

  const handleApplyInternalLink = useCallback(
    (pageId: string) => {
      if (!pageId) {
        return;
      }

      execInlineCommand("createLink", buildInternalPageHref(pageId));
      setLinkPicker(null);
    },
    [execInlineCommand],
  );

  const handleOpenSlashMenu = useCallback(() => {
    if (!selectionSnapshot || !onRequestSlashMenu) {
      return;
    }

    onRequestSlashMenu({
      x: selectionSnapshot.rect.left,
      y: selectionSnapshot.rect.bottom,
    });
    setSelectionSnapshot(null);
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
        className={`outline-none whitespace-pre-wrap break-words empty:before:content-[attr(data-placeholder)] empty:before:text-[var(--color-ink-faint)] empty:before:pointer-events-none ${className}`}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onPaste={handlePaste}
        onClick={handleClick}
        onMouseUp={updateSelectionSnapshot}
        onFocus={() => {
          isFocused.current = true;
          setHasFocus(true);
          renderContent(content);
        }}
        onBlur={() => {
          isFocused.current = false;
          setHasFocus(false);
          if (!linkPicker) {
            setSelectionSnapshot(null);
          }
          setOpenPalette(null);
          syncContentFromDom();
          renderContent(content);
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
              onFormatBold={() => execInlineCommand("bold")}
              onFormatItalic={() => execInlineCommand("italic")}
              onFormatStrike={() => execInlineCommand("strikeThrough")}
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
