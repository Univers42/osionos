import { useEffect, useRef } from "react";

import type { Block } from "@/entities/block/model/types";
import { getInlineEditorOffsetsForRange } from "@/shared/lib/markengine/inlineEditorSelection";

import { useBlockSelection } from "./blockSelectionStore";
import { focusEditableBlock } from "./blockDomFocus";
import { collapseCrossText, serializeCrossText, type CrossTextRange } from "./crossTextOps";
import { useCrossTextSelection as useCrossTextStore } from "./crossTextSelectionStore";

const CROSS_MIME = "application/x-osionos-blocks";
const LEAF_SELECTOR = '[contenteditable="true"]';

interface UseCrossTextSelectionOptions {
  rootRef: { readonly current: HTMLElement | null };
  sourceKey: string;
  pageId: string;
  enabled: boolean;
  getBlocks: () => Block[];
  /** Flush pending per-block drafts, returning the canonical tree (structural discipline). */
  flushBlocks: () => Block[];
  updateContent: (blocks: Block[]) => void;
}

interface LeafEntry {
  blockId: string;
  leaf: HTMLElement;
  /** Bounds relative to the surface root (scroll-stable). */
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Caret DOM point from a viewport position (Chromium + Firefox seams). */
function caretFromPoint(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  if (doc.caretRangeFromPoint) {
    const range = doc.caretRangeFromPoint(x, y);
    return range ? { node: range.startContainer, offset: range.startOffset } : null;
  }
  const position = doc.caretPositionFromPoint?.(x, y);
  return position ? { node: position.offsetNode, offset: position.offset } : null;
}

/** Plain-text offset of a DOM point inside a leaf. */
function textOffsetAt(leaf: HTMLElement, point: { node: Node; offset: number }): number | null {
  if (!leaf.contains(point.node)) return null;
  const range = document.createRange();
  range.setStart(point.node, point.offset);
  range.collapse(true);
  return getInlineEditorOffsetsForRange(leaf, range)?.start ?? null;
}

/**
 * Cross-block text selection. Browsers confine a drag anchored inside a
 * contenteditable to that host (verified), and even clamp programmatic
 * cross-host ranges — so the anchor block keeps its native (correct) partial
 * selection, and this hook custom-paints the rest: full tints for covered
 * middle blocks, a partial tint for the focus block, all rAF-coalesced with
 * geometry cached per drag. On release the range (plain-text offsets) is
 * published; copy/cut/typing are intercepted while it is active.
 */
export function useCrossTextSelection(options: UseCrossTextSelectionOptions): void {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  const { rootRef, enabled } = options;
  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root) return;

    let anchor: { blockId: string; leaf: HTMLElement; offset: number; y: number } | null = null;
    let crossed = false;
    let leaves: LeafEntry[] = [];
    let pointer = { x: 0, y: 0 };
    let frame = 0;
    let overlay: HTMLDivElement | null = null;
    let lastFocus: { blockId: string; leaf: HTMLElement; point: { node: Node; offset: number } | null } | null = null;

    const rootTop = () => root.getBoundingClientRect();

    const ensureOverlay = (): HTMLDivElement => {
      if (overlay) return overlay;
      overlay = document.createElement("div");
      overlay.className = "osio-cross-select-overlay";
      overlay.setAttribute("aria-hidden", "true");
      root.appendChild(overlay);
      return overlay;
    };

    const removeOverlay = (): void => {
      overlay?.remove();
      overlay = null;
    };

    const clearCommitted = (): void => {
      if (useCrossTextStore.getState().sourceKey === latest.current.sourceKey) {
        useCrossTextStore.getState().clear();
      }
      delete document.body.dataset.crossTextActive;
      removeOverlay();
    };

    const collectLeaves = (): void => {
      const rootRect = rootTop();
      leaves = [];
      root.querySelectorAll<HTMLElement>("[data-block-id]").forEach((blockEl) => {
        const id = blockEl.dataset.blockId;
        const leaf = blockEl.querySelector<HTMLElement>(LEAF_SELECTOR);
        if (!id || !leaf) return;
        const r = leaf.getBoundingClientRect();
        leaves.push({
          blockId: id,
          leaf,
          top: r.top - rootRect.top,
          bottom: r.bottom - rootRect.top,
          left: r.left - rootRect.left,
          right: r.right - rootRect.left,
        });
      });
    };

    const tint = (parent: HTMLElement, left: number, top: number, width: number, height: number): void => {
      const el = document.createElement("div");
      el.className = "osio-cross-select-tint";
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.width = `${width}px`;
      el.style.height = `${height}px`;
      parent.appendChild(el);
    };

    const paint = (): void => {
      frame = 0;
      if (!anchor) return;
      const rootRect = rootTop();
      const pointerRootY = pointer.y - rootRect.top;
      const anchorIdx = leaves.findIndex((entry) => entry.blockId === anchor?.blockId);
      if (anchorIdx === -1) return;

      // The focus leaf: the one whose vertical band contains the pointer, clamped.
      let focusIdx = leaves.findIndex((entry) => pointerRootY >= entry.top && pointerRootY <= entry.bottom);
      if (focusIdx === -1) focusIdx = pointerRootY < leaves[0].top ? 0 : leaves.length - 1;
      const downward = focusIdx >= anchorIdx;
      const focusEntry = leaves[focusIdx];
      const caret = caretFromPoint(
        Math.min(Math.max(pointer.x, focusEntry.left + rootRect.left + 1), focusEntry.right + rootRect.left - 1),
        Math.min(Math.max(pointer.y, focusEntry.top + rootRect.top + 1), focusEntry.bottom + rootRect.top - 1),
      );
      lastFocus = {
        blockId: focusEntry.blockId,
        leaf: focusEntry.leaf,
        point: caret && focusEntry.leaf.contains(caret.node) ? caret : null,
      };

      const box = ensureOverlay();
      box.replaceChildren();

      // Middle blocks: full-leaf tints from the per-drag cache (no layout reads).
      const [from, to] = downward ? [anchorIdx + 1, focusIdx - 1] : [focusIdx + 1, anchorIdx - 1];
      for (let i = from; i <= to; i++) {
        const entry = leaves[i];
        tint(box, entry.left, entry.top, entry.right - entry.left, entry.bottom - entry.top);
      }

      // Focus block: partial tint up to the caret (leaf start → caret when
      // dragging down, caret → leaf end when dragging up).
      if (focusIdx !== anchorIdx) {
        const partial = document.createRange();
        partial.selectNodeContents(focusEntry.leaf);
        if (lastFocus.point) {
          if (downward) partial.setEnd(lastFocus.point.node, lastFocus.point.offset);
          else partial.setStart(lastFocus.point.node, lastFocus.point.offset);
        }
        for (const r of partial.getClientRects()) {
          tint(box, r.left - rootRect.left, r.top - rootRect.top, r.width, r.height);
        }
      }
    };

    const onPointerMove = (event: PointerEvent): void => {
      pointer = { x: event.clientX, y: event.clientY };
      if (!anchor) return;
      if (!crossed) {
        const leafRect = anchor.leaf.getBoundingClientRect();
        const outside = pointer.y < leafRect.top - 4 || pointer.y > leafRect.bottom + 4;
        if (!outside) return;
        crossed = true;
        collectLeaves();
        document.body.dataset.crossTextActive = "true";
        useBlockSelection.getState().clearSelection();
        // The clamped native selection stops firing selectionchange once the
        // pointer leaves the anchor host — poke it so per-block selection UI
        // (inline toolbar) re-evaluates its stand-down guard and hides.
        document.dispatchEvent(new Event("selectionchange"));
      }
      if (frame === 0) frame = requestAnimationFrame(paint);
    };

    const commit = (): void => {
      if (!anchor || !crossed || !lastFocus) return;
      const { sourceKey, pageId } = latest.current;
      const anchorIdx = leaves.findIndex((entry) => entry.blockId === anchor?.blockId);
      const focusIdx = leaves.findIndex((entry) => entry.blockId === lastFocus?.blockId);
      if (anchorIdx === -1 || focusIdx === -1 || anchorIdx === focusIdx) {
        clearCommitted();
        return;
      }
      const downward = focusIdx > anchorIdx;
      const focusOffset = lastFocus.point ? textOffsetAt(lastFocus.leaf, lastFocus.point) : null;
      const focusLen = lastFocus.leaf.textContent?.length ?? 0;
      const startIdx = downward ? anchorIdx : focusIdx;
      const endIdx = downward ? focusIdx : anchorIdx;
      const range: CrossTextRange = {
        start: downward
          ? { blockId: anchor.blockId, offset: anchor.offset }
          : { blockId: lastFocus.blockId, offset: focusOffset ?? 0 },
        end: downward
          ? { blockId: lastFocus.blockId, offset: focusOffset ?? focusLen }
          : { blockId: anchor.blockId, offset: anchor.offset },
        middleIds: leaves.slice(startIdx + 1, endIdx).map((entry) => entry.blockId),
      };
      useCrossTextStore.getState().set(sourceKey, pageId, range);
    };

    const onPointerUp = (): void => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (crossed) commit();
      anchor = null;
      crossed = false;
      globalThis.removeEventListener("pointermove", onPointerMove);
      globalThis.removeEventListener("pointerup", onPointerUp);
      // Not crossed → plain in-block selection; nothing committed, nothing painted.
      if (!useCrossTextStore.getState().range) clearCommitted();
    };

    const onPointerDown = (event: PointerEvent): void => {
      // A new press always dismisses a committed cross-selection.
      if (useCrossTextStore.getState().sourceKey === latest.current.sourceKey) clearCommitted();
      if (event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      const leaf = target?.closest<HTMLElement>(LEAF_SELECTOR) ?? null;
      const blockEl = leaf?.closest<HTMLElement>("[data-block-id]") ?? null;
      if (!leaf || !blockEl?.dataset.blockId) return;
      const caret = caretFromPoint(event.clientX, event.clientY);
      const offset = caret ? textOffsetAt(leaf, caret) : null;
      if (offset === null) return;
      anchor = { blockId: blockEl.dataset.blockId, leaf, offset, y: event.clientY };
      crossed = false;
      globalThis.addEventListener("pointermove", onPointerMove);
      globalThis.addEventListener("pointerup", onPointerUp, { once: true });
    };

    const applyCollapse = (insertText: string): void => {
      const { range } = useCrossTextStore.getState();
      if (!range) return;
      const { flushBlocks, updateContent } = latest.current;
      const result = collapseCrossText(flushBlocks(), range, insertText);
      clearCommitted();
      globalThis.getSelection()?.removeAllRanges();
      if (!result) return;
      updateContent(result.blocks);
      focusEditableBlock(result.caretBlockId, result.caretOffset === 0 ? "start" : "end");
    };

    const isActive = (): boolean =>
      useCrossTextStore.getState().sourceKey === latest.current.sourceKey &&
      useCrossTextStore.getState().range !== null;

    const onCopy = (event: ClipboardEvent): void => {
      if (!isActive() || !event.clipboardData) return;
      const { range } = useCrossTextStore.getState();
      if (!range) return;
      const payload = serializeCrossText(latest.current.flushBlocks(), range);
      event.clipboardData.setData(CROSS_MIME, payload.json);
      event.clipboardData.setData("text/markdown", payload.markdown);
      event.clipboardData.setData("text/html", payload.html);
      event.clipboardData.setData("text/plain", payload.plain);
      event.preventDefault();
      event.stopPropagation();
    };

    const onCut = (event: ClipboardEvent): void => {
      if (!isActive()) return;
      onCopy(event);
      applyCollapse("");
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (!isActive()) return;
      if (event.key === "Escape") {
        // Escalate: covered blocks become a block selection (Notion ladder).
        const { range } = useCrossTextStore.getState();
        const { sourceKey, pageId } = latest.current;
        if (range) {
          useBlockSelection
            .getState()
            .select(sourceKey, pageId, [range.start.blockId, ...range.middleIds, range.end.blockId]);
        }
        clearCommitted();
        event.preventDefault();
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        event.stopPropagation();
        applyCollapse("");
        return;
      }
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        applyCollapse(event.key);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        applyCollapse("");
      }
    };

    root.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("copy", onCopy, true);
    document.addEventListener("cut", onCut, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      root.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("copy", onCopy, true);
      document.removeEventListener("cut", onCut, true);
      document.removeEventListener("keydown", onKeyDown, true);
      globalThis.removeEventListener("pointermove", onPointerMove);
      globalThis.removeEventListener("pointerup", onPointerUp);
      if (frame) cancelAnimationFrame(frame);
      clearCommitted();
    };
  }, [rootRef, enabled]);
}
