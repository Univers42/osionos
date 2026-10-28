/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useVariableMenu.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback, useState } from "react";

import { findBlockInTree, type Block } from "@/entities/block";
import { applyVariableInsert, matchVariableTrigger, type VariableTrigger } from "@/features/variables/model/variableTrigger";
import type { CaretPosition } from "@/shared/lib/dom/caretPosition";

export interface VariableMenuState {
  blockId: string;
  position: CaretPosition;
  trigger: VariableTrigger;
}

interface VariableMenuEditor {
  pageId: string;
  getCaretRect: (blockId: string) => CaretPosition;
  /** Commits the block's pending keystrokes and returns the tree with them. */
  flushPendingBlockDraft: (blockId: string, reason: "shortcut") => Block[];
  updateBlock: (pageId: string, blockId: string, updates: Partial<Block>) => void;
  focusBlock: (blockId: string, placement: "end") => void;
}

const sameTrigger = (a: VariableTrigger, b: VariableTrigger) =>
  a.start === b.start && a.mode === b.mode && a.name === b.name && a.query === b.query;

/** The `{{` menu's state for one editor: opened, filtered and closed by the block's text. */
export function useVariableMenu(editor: VariableMenuEditor) {
  const { pageId, getCaretRect, flushPendingBlockDraft, updateBlock, focusBlock } = editor;
  const [variableMenu, setVariableMenu] = useState<VariableMenuState | null>(null);

  const tryHandleVariableMenu = useCallback(
    (blockId: string, text: string): boolean => {
      const trigger = text.includes("{{") ? matchVariableTrigger(text) : null;
      if (!trigger) {
        if (variableMenu?.blockId === blockId) setVariableMenu(null);
        return false;
      }
      setVariableMenu((prev) => {
        if (prev?.blockId !== blockId) return { blockId, position: getCaretRect(blockId), trigger };
        return sameTrigger(prev.trigger, trigger) ? prev : { ...prev, trigger };
      });
      return true;
    },
    [variableMenu, getCaretRect],
  );

  const handleVariableSelect = useCallback(
    (insert: string) => {
      if (!variableMenu) return;
      const { blockId } = variableMenu;
      setVariableMenu(null);
      const block = findBlockInTree(flushPendingBlockDraft(blockId, "shortcut"), blockId);
      const content = block ? applyVariableInsert(block.content, insert) : null;
      if (content === null) return;
      updateBlock(pageId, blockId, { content });
      focusBlock(blockId, "end");
    },
    [variableMenu, flushPendingBlockDraft, pageId, updateBlock, focusBlock],
  );

  const closeVariableMenu = useCallback(() => setVariableMenu(null), []);

  return { variableMenu, tryHandleVariableMenu, handleVariableSelect, closeVariableMenu };
}
