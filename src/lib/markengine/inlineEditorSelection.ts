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
