/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   tableCaretDom.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { focusEditableBlock } from "@/features/block-editor/model/blockDomFocus";
import type { CaretPlacement } from "./tableTypes";

/** Focuses a cell's editor and places the caret; returns false if absent. */
export function focusCell(table: HTMLElement | null, rowIndex: number, columnIndex: number, placement: CaretPlacement = "start"): boolean {
  const cell = table?.querySelector<HTMLElement>(`[data-table-cell="${rowIndex}:${columnIndex}"] [contenteditable]`);
  if (!cell) return false;
  cell.focus();
  placeCaret(cell, placement);
  return true;
}

/** Retries focusing a cell across a few frames while the DOM settles. */
export function focusCellWhenReady(table: HTMLElement | null, rowIndex: number, columnIndex: number, placement: CaretPlacement, attempts = 8) {
  if (attempts <= 0 || focusCell(table, rowIndex, columnIndex, placement)) return;
  const retry = () => focusCellWhenReady(table, rowIndex, columnIndex, placement, attempts - 1);
  requestAnimationFrame(retry);
  globalThis.setTimeout(retry, 0);
}

function placeCaret(target: HTMLElement, placement: CaretPlacement) {
  const selection = globalThis.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(placement !== "end");
  selection.removeAllRanges();
  selection.addRange(range);
}

export function isCaretAtStart(cell: HTMLElement): boolean {
  const selection = globalThis.getSelection();
  if (!selection?.rangeCount) return true;
  const range = selection.getRangeAt(0);
  if (!range.collapsed) return false;
  const testRange = document.createRange();
  testRange.setStart(cell, 0);
  testRange.setEnd(range.startContainer, range.startOffset);
  return testRange.toString().length === 0;
}

export function isCaretAtEnd(cell: HTMLElement): boolean {
  const selection = globalThis.getSelection();
  if (!selection?.rangeCount) return true;
  const range = selection.getRangeAt(0);
  if (!range.collapsed) return false;
  const testRange = document.createRange();
  testRange.setStart(range.endContainer, range.endOffset);
  testRange.setEnd(cell, cell.childNodes.length);
  return testRange.toString().length === 0;
}

// True when the caret sits on the cell's first/last visual line, so multi-line
// cells move the caret within the cell before navigating to an adjacent row.
export function caretLineEdge(cell: HTMLElement): { first: boolean; last: boolean } {
  const selection = globalThis.getSelection();
  if (!selection?.rangeCount) return { first: true, last: true };
  const range = selection.getRangeAt(0).cloneRange();
  range.collapse(true);
  const rects = range.getClientRects();
  const caretRect = rects.length ? rects[0] : range.getBoundingClientRect();
  if (!caretRect || caretRect.height === 0) return { first: true, last: true };
  const cellRect = cell.getBoundingClientRect();
  const slack = Math.max(caretRect.height * 0.6, 4);
  return { first: caretRect.top - cellRect.top <= slack, last: cellRect.bottom - caretRect.bottom <= slack };
}

export function focusTableBlockShell(root: HTMLElement | null) {
  const shell = root?.closest<HTMLElement>("[data-table-block-shell]") ?? root?.closest<HTMLElement>("article") ?? root;
  if (!shell) return;
  if (!shell.hasAttribute("tabindex")) shell.setAttribute("tabindex", "-1");
  shell.focus();
}

export function exitTable(root: HTMLElement | null, direction: "up" | "down") {
  const block = root?.closest<HTMLElement>("[data-block-id]");
  if (!block) return;
  const blocks = Array.from(document.querySelectorAll<HTMLElement>("[data-block-id]"));
  const target = blocks[blocks.indexOf(block) + (direction === "up" ? -1 : 1)];
  if (target?.dataset.blockId) focusEditableBlock(target.dataset.blockId, direction === "up" ? "end" : "start");
}

export function startPointerDrag(cursor: string, move: (event: PointerEvent) => void, up: () => void) {
  document.body.style.cursor = cursor;
  document.body.style.userSelect = "none";
  globalThis.addEventListener("pointermove", move);
  globalThis.addEventListener("pointerup", up, { once: true });
}

export function stopPointerDrag(move: (event: PointerEvent) => void, up: () => void) {
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
  globalThis.removeEventListener("pointermove", move);
  globalThis.removeEventListener("pointerup", up);
}

// Maps a pointer Y to the row slot it would drop into and the indicator's Y
// (relative to the table root) drawn at that slot boundary.
export function resolveRowDropSlot(table: HTMLElement | null, root: HTMLElement | null, clientY: number): { slot: number; indicatorY: number } {
  const rows = table ? Array.from(table.querySelectorAll<HTMLElement>("tbody > tr")) : [];
  const rootTop = root?.getBoundingClientRect().top ?? 0;
  for (let index = 0; index < rows.length; index += 1) {
    const rect = rows[index].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return { slot: index, indicatorY: rect.top - rootTop };
  }
  const lastRect = rows.at(-1)?.getBoundingClientRect();
  return { slot: rows.length, indicatorY: lastRect ? lastRect.bottom - rootTop : 0 };
}
