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

export type CaretPlacement = "start" | "end";
export const VIRTUAL_BLOCK_FOCUS_EVENT = "osionos:block-focus-request";

function requestVirtualBlockFocus(blockId: string, placement: CaretPlacement) {
  if (typeof document === "undefined") return;
  document.dispatchEvent(
    new CustomEvent(VIRTUAL_BLOCK_FOCUS_EVENT, {
      detail: { blockId, placement },
    }),
  );
}

function resolveEditableBlock(blockId: string, placement: CaretPlacement): HTMLElement | null {
  const block = document.querySelector(`[data-block-id="${blockId}"]`);
  if (!block) {
    return null;
  }

  const tableCell = resolveTableCell(block as HTMLElement, placement);
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

function resolveTableCell(block: HTMLElement, placement: CaretPlacement): HTMLElement | null {
  if (block.dataset.blockType !== "table_block") return null;
  const cellFrames = Array.from(block.querySelectorAll<HTMLElement>("[data-table-cell]"));
  if (cellFrames.length === 0) return null;

  if (placement === "start") return cellFrames[0].querySelector<HTMLElement>("[contenteditable]");

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

function placeCaret(target: HTMLElement, placement: CaretPlacement) {
  // Textarea and input: use selectionStart/selectionEnd
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    const pos = placement === "end" ? target.value.length : 0;
    target.selectionStart = pos;
    target.selectionEnd = pos;
    return;
  }

  // ContentEditable: use Selection API
  if (!target.isContentEditable) return;

  const selection = globalThis.getSelection();
  if (!selection) return;

  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(placement !== "end");
  selection.removeAllRanges();
  selection.addRange(range);
}

export function focusEditableBlock(
  blockId: string,
  placement: CaretPlacement = "start",
  remainingFrames = 10,
) {
  let requestedVirtualScroll = false;
  const retry = () => {
    requestAnimationFrame(focusAttempt);
    globalThis.setTimeout(focusAttempt, 0);
  };
  const focusAttempt = () => {
    const editable = resolveEditableBlock(blockId, placement);
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
    editable.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
