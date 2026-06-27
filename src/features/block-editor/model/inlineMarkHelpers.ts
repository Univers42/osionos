/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inlineMarkHelpers.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/21 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/21 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

const INLINE_MARK_TAGS = new Set(["STRONG", "EM", "DEL", "U", "MARK", "CODE"]);

export function getInlineMarkAtCaretEnd(
  root: HTMLElement | null,
): HTMLElement | null {
  if (!root) return null;
  const selection = globalThis.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!range.collapsed) return null;
  const { startContainer, startOffset } = range;
  if (startContainer.nodeType !== 3) return null;
  const text = startContainer as Text;
  if (startOffset < text.length) return null;
  const parent = text.parentElement;
  if (!parent || !root.contains(parent) || parent === root) return null;
  if (text !== parent.lastChild) return null;
  if (!INLINE_MARK_TAGS.has(parent.tagName) && !parent.dataset?.inlineType)
    return null;
  return parent;
}

/**
 * Move the caret out of an inline mark to its right edge. Placing it merely
 * after the element (or at the start of the following text node) still lets the
 * browser re-absorb the next typed character into the mark because of boundary
 * affinity. Inserting a zero-width spacer the caret sits *after* gives typed
 * text a home outside the mark; the spacer is stripped when the source is
 * normalized, so it never reaches the document model.
 */
export function placeCaretAfterInlineMark(mark: HTMLElement): void {
  const selection = globalThis.getSelection();
  if (!selection) return;

  const spacer = document.createTextNode("​");
  mark.parentNode?.insertBefore(spacer, mark.nextSibling);

  const range = document.createRange();
  range.setStart(spacer, 1);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}
