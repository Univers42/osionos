/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useBlockHistory.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: claude <claude@anthropic.com>              +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/03 12:00:00 by claude            #+#    #+#             */
/*   Updated: 2026/05/03 12:00:00 by claude           ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Lightweight undo/redo history for block-level operations.
 *
 * Location: src/features/block-editor/model/useBlockHistory.ts
 *
 * Stores snapshots of the page content (Block[]) before each structural
 * operation. Text edits within a single block are handled by the browser's
 * native contenteditable undo and are NOT captured here.
 *
 * Usage:
 *   const { pushSnapshot, undo, redo } = useBlockHistory(pageId);
 *   // Before any structural operation:
 *   pushSnapshot(currentContent);
 *   // Then perform the operation normally.
 */

import { useCallback, useRef } from "react";
import type { Block } from "@/entities/block";

/** Maximum number of undo steps to keep per page. */
const MAX_HISTORY = 50;

interface HistoryState {
  /** Past snapshots (most recent last). */
  undoStack: Block[][];
  /** Future snapshots for redo (most recent last). */
  redoStack: Block[][];
}

export function useBlockHistory(
  pageId: string,
  applyContent: (pageId: string, blocks: Block[]) => void,
  focusBlock: (blockId: string, cursorEnd?: boolean) => void,
) {
  const historyRef = useRef<HistoryState>({ undoStack: [], redoStack: [] });

  /**
   * Save the current content as a snapshot before a structural operation.
   * Call this BEFORE the operation modifies the store.
   * Clears the redo stack (new action invalidates any redo history).
   */
  const pushSnapshot = useCallback((content: Block[]) => {
    const h = historyRef.current;
    h.undoStack.push(structuredClone(content));
    if (h.undoStack.length > MAX_HISTORY) {
      h.undoStack.shift();
    }
    h.redoStack = [];
  }, []);

  /**
   * Undo: restore the previous snapshot and push the current state
   * onto the redo stack. Returns true if a snapshot was restored.
   */
  const undo = useCallback(
    (currentContent: Block[]): boolean => {
      const h = historyRef.current;
      if (h.undoStack.length === 0) return false;

      h.redoStack.push(structuredClone(currentContent));
      const previous = h.undoStack.pop()!;
      applyContent(pageId, previous);

      // Focus the first block of the restored content.
      if (previous.length > 0) {
        focusBlock(previous[0].id);
      }
      return true;
    },
    [pageId, applyContent, focusBlock],
  );

  /**
   * Redo: restore the next snapshot and push the current state
   * back onto the undo stack. Returns true if a snapshot was restored.
   */
  const redo = useCallback(
    (currentContent: Block[]): boolean => {
      const h = historyRef.current;
      if (h.redoStack.length === 0) return false;

      h.undoStack.push(structuredClone(currentContent));
      const next = h.redoStack.pop()!;
      applyContent(pageId, next);

      if (next.length > 0) {
        focusBlock(next[0].id);
      }
      return true;
    },
    [pageId, applyContent, focusBlock],
  );

  /**
   * Clear all history (e.g. when switching pages).
   */
  const clearHistory = useCallback(() => {
    historyRef.current = { undoStack: [], redoStack: [] };
  }, []);

  return { pushSnapshot, undo, redo, clearHistory };
}
