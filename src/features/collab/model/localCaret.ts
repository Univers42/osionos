/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   localCaret.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 17:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 17:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Reads THIS client's keyboard caret/selection from the live DOM Selection and
 * maps it to transport-level `{blockId, offset}` (AOC §3, R-A1: keyboard caret
 * only — mouse position is never read or sent). A DOM point is converted to a
 * character offset by measuring a range from the block's editable start, which
 * handles both text nodes and empty contenteditables. Read-only; never mutates.
 */

import type { CaretState, SelectionRange } from './realtimeTransport.port';

/** Map a DOM (node, offset) to a block-relative CaretState, or null if outside a block. */
function domPointToCaret(node: Node | null, nodeOffset: number): CaretState | null {
  if (!node || typeof document === 'undefined') return null;
  const host = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  const block = host?.closest<HTMLElement>('[data-block-id]');
  const blockId = block?.dataset.blockId;
  if (!block || !blockId) return null;
  const editable = block.querySelector<HTMLElement>('[contenteditable]') ?? block;
  if (!editable.contains(node)) return null;
  const measure = document.createRange();
  measure.selectNodeContents(editable);
  try { measure.setEnd(node, nodeOffset); } catch { return null; }
  return { blockId, offset: measure.toString().length };
}

/** Current local caret + selection, mapped to block coordinates (or nulls). */
export function readLocalCaretAndSelection(): { caret: CaretState | null; selection: SelectionRange | null } {
  if (typeof window === 'undefined') return { caret: null, selection: null };
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { caret: null, selection: null };
  const focus = domPointToCaret(sel.focusNode ?? sel.anchorNode, sel.focusOffset);
  if (!focus) return { caret: null, selection: null };
  if (sel.isCollapsed) return { caret: focus, selection: null };
  const anchor = domPointToCaret(sel.anchorNode, sel.anchorOffset);
  if (!anchor) return { caret: focus, selection: null };
  return { caret: focus, selection: { anchor, focus } };
}
