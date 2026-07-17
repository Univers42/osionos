/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   blockDomFocus.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 20:16:19 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/13 13:52:58 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * "start"/"end" collapse the caret to the block edge. `{ edge, x }` places it on
 * the FIRST ("first") or LAST ("last") visual line at viewport column `x` — the
 * goal-column carried across a block boundary so arrow-key navigation keeps the
 * same column line-to-line through the page (a real text-editor feel), instead
 * of snapping to line start/end.
 */
import { hitTestCaretRange } from "./caretGeometry";

export type CaretEdge = { edge: "first" | "last"; x: number };
export type CaretPlacement = "start" | "end" | CaretEdge;
export const VIRTUAL_BLOCK_FOCUS_EVENT = "osionos:block-focus-request";

/** Collapse an edge-placement to the coarse start/end used by cell/textarea targets. */
function placementEdge(placement: CaretPlacement): "start" | "end" {
  if (placement === "start" || placement === "end") return placement;
  return placement.edge === "first" ? "start" : "end";
}

function requestVirtualBlockFocus(blockId: string, placement: CaretPlacement) {
  if (typeof document === "undefined") return;
  document.dispatchEvent(
    new CustomEvent(VIRTUAL_BLOCK_FOCUS_EVENT, {
      detail: { blockId, placement },
    }),
  );
}

/**
 * The editor surface (pane) that owns `node`. Block-navigation DOM lookups scope
 * to it so a duplicate block id in ANOTHER mounted pane (split view, or a
 * background tab kept mounted) can never capture the caret — an unscoped
 * `document.querySelector` returns the first match, i.e. the wrong pane. Falls
 * back to the document when there is no `.osionos-page` ancestor.
 */
export function paneRootOf(node: Node | null | undefined): ParentNode {
  const el = node instanceof Element ? node : (node?.parentElement ?? null);
  return el?.closest<HTMLElement>(".osionos-page") ?? document;
}

/** The pane that currently holds the caret — for scoping an imperative focus. */
export function selectionPaneRoot(): ParentNode {
  const sel = globalThis.getSelection?.();
  return paneRootOf(sel && sel.rangeCount ? sel.anchorNode : null);
}

function resolveEditableBlock(
  blockId: string,
  placement: CaretPlacement,
  root: ParentNode = document,
): HTMLElement | null {
  const block = root.querySelector(`[data-block-id="${blockId}"]`);
  if (!block) {
    return null;
  }

  const tableCell = resolveTableCell(block as HTMLElement, placementEdge(placement));
  if (tableCell) return tableCell;

  // Priority: contenteditable → textarea → input → direct child button → wrapper
  const editable =
    (block.querySelector("[contenteditable]") as HTMLElement | null) ??
    (block.querySelector("textarea") as HTMLElement | null) ??
    (block.querySelector("input") as HTMLElement | null) ??
    (block.querySelector(":scope > button") as HTMLElement | null) ??
    (block as HTMLElement);

  // Ensure the fallback wrapper element is focusable
  if (editable === block && !block.hasAttribute("tabindex")) {
    (block as HTMLElement).setAttribute("tabindex", "-1");
  }

  return editable;
}

function resolveTableCell(block: HTMLElement, edge: "start" | "end"): HTMLElement | null {
  if (block.dataset.blockType !== "table_block") return null;
  const cellFrames = Array.from(block.querySelectorAll<HTMLElement>("[data-table-cell]"));
  if (cellFrames.length === 0) return null;

  if (edge === "start") return cellFrames[0].querySelector<HTMLElement>("[contenteditable]");

  const lastRowCell = cellFrames.reduce<HTMLElement | null>((candidate, frame) => {
    const address = parseTableCellAddress(frame.dataset.tableCell);
    const candidateAddress = parseTableCellAddress(candidate?.dataset.tableCell);
    if (!address) return candidate;
    if (!candidateAddress || address.rowIndex > candidateAddress.rowIndex) return frame;
    if (address.rowIndex === candidateAddress.rowIndex && address.columnIndex === 0) return frame;
    return candidate;
  }, null);

  return lastRowCell?.querySelector<HTMLElement>("[contenteditable]") ?? null;
}

function parseTableCellAddress(value: string | undefined): { rowIndex: number; columnIndex: number } | null {
  const [row, column] = value?.split(":") ?? [];
  const rowIndex = Number(row);
  const columnIndex = Number(column);
  if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return null;
  return { rowIndex, columnIndex };
}

// Place the caret at goal-column `x` on the block's first/last visual line, so
// vertical navigation across blocks keeps the same column. Returns false (→
// caller falls back to start/end) only when the sampled hit-test finds no caret
// position inside the target (see hitTestCaretRange for the sampling strategy).
function placeCaretAtGoalX(target: HTMLElement, placement: CaretEdge, selection: Selection): boolean {
  const range = hitTestCaretRange(target, placement.edge, placement.x);
  if (!range) return false;
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function placeCaret(target: HTMLElement, placement: CaretPlacement) {
  const edge = placementEdge(placement);
  // Textarea and input: use selectionStart/selectionEnd
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    const pos = edge === "end" ? target.value.length : 0;
    target.selectionStart = pos;
    target.selectionEnd = pos;
    return;
  }

  // ContentEditable: use Selection API
  if (!target.isContentEditable) return;

  const selection = globalThis.getSelection();
  if (!selection) return;

  if (typeof placement === "object" && placeCaretAtGoalX(target, placement, selection)) return;

  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(edge !== "end");
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Make the live contenteditable authoritative for `blockId` RIGHT NOW, caret at
 * the end of `text`.
 *
 * A markdown-shortcut conversion ("# " -> heading) rewrites the block's content
 * in the store, but that only reaches the DOM on React's NEXT commit. Every
 * keystroke dispatched inside that window lands in the still-marker-bearing node
 * and is read back into the draft — which is how the marker got stranded
 * ("Heading#", "[]Todo item") and, once stranded, broke every later slash command
 * on that block (the text no longer ends with "/"). Writing the node in the SAME
 * tick as the conversion closes the window; the snapshot can never be stale
 * because no keystroke can interleave inside one event handler.
 *
 * Returns false when the block has no contenteditable yet (not rendered, or a
 * void/textarea block) — the caller then falls back to the async focus path.
 */
export function commitEditableBlockText(
  blockId: string,
  text: string,
  root: ParentNode = document,
): boolean {
  const editable = root.querySelector<HTMLElement>(
    `[data-block-id="${blockId}"] [contenteditable="true"]`,
  );
  if (!editable) return false;

  if (editable.textContent !== text) editable.textContent = text;
  placeCaret(editable, "end");
  return true;
}

/**
 * Focus `blockId` only if the caret is NOT already inside it — deferred one frame,
 * so the check sees the post-commit DOM.
 *
 * The unconditional `focusEditableBlock` re-places the caret from a rAF/timeout
 * retry loop. When a conversion REUSES the same contenteditable node (paragraph ->
 * heading), focus was never lost, so that deferred placement fires AFTER the user's
 * next keystrokes and snaps the caret back to offset 0 — the typed text comes out
 * scrambled ("eadingH"). Conversions that genuinely remount the node (paragraph ->
 * code/divider) DO lose focus, and those still get focused here.
 */
export function refocusBlockIfLost(
  blockId: string,
  placement: CaretPlacement = "end",
  root: ParentNode = document,
) {
  requestAnimationFrame(() => {
    const block = root.querySelector(`[data-block-id="${blockId}"]`);
    const active = document.activeElement;
    if (block && active && block.contains(active)) return; // caret is already home — don't stomp it
    focusEditableBlock(blockId, placement, root);
  });
}

export function focusEditableBlock(
  blockId: string,
  placement: CaretPlacement = "start",
  root: ParentNode = document,
  remainingFrames = 10,
) {
  let requestedVirtualScroll = false;
  const retry = () => {
    requestAnimationFrame(focusAttempt);
    globalThis.setTimeout(focusAttempt, 0);
  };
  const focusAttempt = () => {
    const editable = resolveEditableBlock(blockId, placement, root);
    if (!editable) {
      if (!requestedVirtualScroll) {
        requestedVirtualScroll = true;
        requestVirtualBlockFocus(blockId, placement);
      }
      if (remainingFrames > 0) {
        remainingFrames -= 1;
        retry();
      }
      return;
    }

    editable.focus();
    // Instant (not smooth) keeps cursor navigation snappy like a code editor —
    // a smooth-scroll animation on every Arrow/focus made movement feel laggy.
    editable.scrollIntoView({ block: "nearest", behavior: "auto" });
    placeCaret(editable, placement);

    if (document.activeElement !== editable && remainingFrames > 0) {
      remainingFrames -= 1;
      retry();
    }
  };

  retry();
}

/**
 * Focuses the first rendered block editor and places the caret at the start.
 * Returns false when no rendered block is available yet.
 */
export function focusFirstEditableBlock(
  placement: CaretPlacement = "start",
): boolean {
  const firstRenderedBlock = document.querySelector<HTMLElement>("[data-block-id]");
  const blockId = firstRenderedBlock?.dataset.blockId;

  if (!blockId) {
    return false;
  }

  focusEditableBlock(blockId, placement);
  return true;
}

/**
 * Focuses the page editor start position, bootstrapping the empty editor state
 * first when the page has no rendered blocks yet.
 */
export function focusPageEditorStart(
  placement: CaretPlacement = "start",
  remainingFrames = 10,
): boolean {
  if (focusFirstEditableBlock(placement)) {
    return true;
  }

  const emptyEditorTrigger = document.querySelector<HTMLElement>(
    "[data-page-editor-empty-trigger]",
  );

  if (!emptyEditorTrigger) {
    return false;
  }

  emptyEditorTrigger.click();

  const retryFocus = () => {
    if (focusFirstEditableBlock(placement)) {
      return;
    }

    if (remainingFrames <= 0) {
      return;
    }

    remainingFrames -= 1;
    requestAnimationFrame(retryFocus);
  };

  requestAnimationFrame(retryFocus);
  return true;
}
