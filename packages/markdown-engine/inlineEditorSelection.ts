/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inlineEditorSelection.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/16 22:23:25 by rstancu           #+#    #+#             */
/*   Updated: 2026/04/16 22:23:26 by rstancu          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export interface InlineEditorSelectionSnapshot {
  start: number;
  end: number;
  rect: DOMRect;
}

export interface InlineEditorSelectionOffsets {
  start: number;
  end: number;
}

/**
 * Returns the current expanded browser range inside the given editor root.
 */
export function getInlineEditorSelectionRange(
  root: HTMLElement,
): Range | null {
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

/**
 * Converts the current DOM selection into plain-text offsets and screen bounds.
 */
export function getInlineEditorSelectionSnapshot(
  root: HTMLElement,
): InlineEditorSelectionSnapshot | null {
  const range = getInlineEditorSelectionRange(root);
  if (!range) {
    return null;
  }

  const offsets = createSelectionOffsetsFromRange(root, range);
  if (!offsets || offsets.start === offsets.end) {
    return null;
  }

  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return null;
  }

  return {
    ...offsets,
    rect,
  };
}

/**
 * Converts the current DOM selection into plain-text offsets inside the editor root.
 */
export function getInlineEditorSelectionOffsets(
  root: HTMLElement,
): InlineEditorSelectionOffsets | null {
  const selection = globalThis.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) {
    return null;
  }

  return createSelectionOffsetsFromRange(root, range);
}

/**
 * Converts an arbitrary DOM range (e.g. built from caretRangeFromPoint during a
 * cross-block drag) into plain-text offsets inside the editor root.
 */
export function getInlineEditorOffsetsForRange(
  root: HTMLElement,
  range: Range,
): InlineEditorSelectionOffsets | null {
  return createSelectionOffsetsFromRange(root, range);
}

export function areInlineEditorSelectionSnapshotsEqual(
  previous: InlineEditorSelectionSnapshot | null,
  next: InlineEditorSelectionSnapshot | null,
) {
  if (previous === next) {
    return true;
  }

  if (!previous || !next) {
    return false;
  }

  return (
    previous.start === next.start &&
    previous.end === next.end &&
    previous.rect.x === next.rect.x &&
    previous.rect.y === next.rect.y &&
    previous.rect.width === next.rect.width &&
    previous.rect.height === next.rect.height
  );
}

/**
 * Restores the caret/selection using plain-text offsets within the editor root.
 */
export function setInlineEditorSelectionOffsets(
  root: HTMLElement,
  offsets: InlineEditorSelectionOffsets,
) {
  const selection = globalThis.getSelection();
  if (!selection) {
    return;
  }

  const range = document.createRange();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  let currentNode: Node | null = walker.nextNode();
  let currentOffset = 0;
  let startNode: Node | null = null;
  let endNode: Node | null = null;
  let startOffset = 0;
  let endOffset = 0;

  while (currentNode) {
    const textLength = currentNode.textContent?.length ?? 0;
    if (!startNode && offsets.start <= currentOffset + textLength) {
      startNode = currentNode;
      startOffset = Math.max(0, offsets.start - currentOffset);
    }
    if (!endNode && offsets.end <= currentOffset + textLength) {
      endNode = currentNode;
      endOffset = Math.max(0, offsets.end - currentOffset);
      break;
    }
    currentOffset += textLength;
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

/** The inline formatting wrappers a markdown shortcut can produce. */
function isInlineFormatElement(element: Element): boolean {
  const tag = element.tagName;
  if (
    tag === "STRONG" || tag === "EM" || tag === "DEL" ||
    tag === "U" || tag === "MARK" || tag === "CODE" || tag === "A" ||
    tag === "SUB" || tag === "SUP" || tag === "KBD"
  ) {
    return true;
  }
  return tag === "SPAN" && element.hasAttribute("data-inline-type");
}

/**
 * Autoformat caret placement: after a markdown style pair just CLOSED at `offset`,
 * land the caret OUTSIDE the trailing styled element so the next character is
 * unstyled — the pair's effect must stay within its delimiters and never overflow.
 *
 * This is deliberately different from TOOLBAR formatting, where the caret stays
 * inside the mark and ArrowRight escapes it (see tests/browser/specs/inlineMarkCaret.mjs):
 * completing `**bold**` by typing signals "I'm done with this style", so we exit it.
 * Falls back to the plain offset placement when the caret does not land at the
 * trailing edge of a styled element (nested marks climb to the OUTERMOST wrapper).
 */
export function setInlineCaretAfterStyledBoundary(
  root: HTMLElement,
  offset: number,
): void {
  setInlineEditorSelectionOffsets(root, { start: offset, end: offset });
  const selection = globalThis.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return;
  }
  const range = selection.getRangeAt(0);
  const container = range.startContainer;
  // Only act at the very END of a text node — the closing edge of the pair.
  if (
    container.nodeType !== Node.TEXT_NODE ||
    range.startOffset !== (container.textContent?.length ?? 0)
  ) {
    return;
  }
  // Climb to the outermost inline-format element whose trailing edge the caret is at.
  let outer: Element | null = null;
  let child: Node = container;
  let parent: Node | null = container.parentNode;
  while (
    parent &&
    parent !== root &&
    parent.nodeType === Node.ELEMENT_NODE &&
    isInlineFormatElement(parent as Element) &&
    (parent as Element).lastChild === child
  ) {
    outer = parent as Element;
    child = parent;
    parent = parent.parentNode;
  }
  if (!outer || !outer.parentNode) {
    return;
  }
  // A collapsed caret at the boundary right after an inline element is ambiguous:
  // Chromium ABSORBS the next typed character back INTO the element, so the mark
  // overflows ("boldX" inside <strong>) and only re-settles on blur. Anchor the
  // caret in a zero-width-space CARRIER text node that lives OUTSIDE the mark, so
  // the next keystroke lands unstyled. readInlineEditorDomState strips the ZWSP
  // and flags a re-render, so the carrier is transient and never reaches the source.
  const carrier = document.createTextNode("\u200B");
  outer.parentNode.insertBefore(carrier, outer.nextSibling);
  const after = document.createRange();
  after.setStart(carrier, 1);
  after.collapse(true);
  selection.removeAllRanges();
  selection.addRange(after);
}

function createSelectionOffsetsFromRange(
  root: HTMLElement,
  range: Range,
): InlineEditorSelectionOffsets | null {
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
