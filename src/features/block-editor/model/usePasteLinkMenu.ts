/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePasteLinkMenu.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// State and actions of the paste menu. The menu opens right after a bare URL was pasted
// as a link; nothing is fetched until a choice is made (C18).

import { useCallback, useRef, useState } from "react";
import type { Block } from "@/entities/block";
import { findBlockInTree, insertBlockAfterInTree, updateBlockInTree } from "@/entities/block/model/blockTreeUtils";
import { applyPasteChoice, defaultPasteChoice, type PasteChoice, type PasteLinkContext } from "./pasteLinkMenu";
import type { SnapshotRequest } from "./linkSnapshotApply";

export interface PasteMenuState {
  blockId: string;
  context: PasteLinkContext;
  initialChoice: PasteChoice;
  position: { x: number; y: number; top: number };
}

interface UsePasteLinkMenuOptions {
  /** The tree with every pending text draft committed. */
  readContent: () => Block[];
  writeContent: (blocks: Block[]) => void;
  pushUndoSnapshot: (blocks: Block[]) => void;
  focusBlock: (blockId: string, cursorEnd?: boolean) => void;
  attachSnapshot: (request: SnapshotRequest) => void;
  caretPosition: (blockId: string) => PasteMenuState["position"];
}

/** The menu hangs under the pasted link itself (not the caret, which sits at the block end). */
function positionUnderLink(blockId: string, url: string, fallback: PasteMenuState["position"]) {
  const block = document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`);
  const anchors = Array.from(block?.querySelectorAll<HTMLAnchorElement>("a.editor-link") ?? []);
  const link = anchors.find((anchor) => anchor.getAttribute("href") === url);
  if (!link) return fallback;
  const box = link.getBoundingClientRect();
  return { x: box.left, y: box.bottom, top: box.top };
}

export function usePasteLinkMenu(options: Readonly<UsePasteLinkMenuOptions>) {
  const { readContent, writeContent, pushUndoSnapshot, focusBlock, attachSnapshot, caretPosition } = options;
  const [pasteMenu, setPasteMenu] = useState<PasteMenuState | null>(null);
  const openRef = useRef<PasteMenuState | null>(null);

  const dismissPasteMenu = useCallback(() => {
    openRef.current = null;
    setPasteMenu(null);
  }, []);

  // Deferred one tick: the pasted link is rendered by the re-render that follows the paste.
  const offerPasteMenu = useCallback(
    (blockId: string, context: PasteLinkContext) => {
      globalThis.setTimeout(() => {
        const state: PasteMenuState = {
          blockId,
          context,
          initialChoice: defaultPasteChoice(context.url),
          position: positionUnderLink(blockId, context.url, caretPosition(blockId)),
        };
        openRef.current = state;
        setPasteMenu(state);
      }, 0);
    },
    [caretPosition],
  );

  const choosePaste = useCallback(
    (choice: PasteChoice) => {
      const state = openRef.current;
      dismissPasteMenu();
      if (!state) return;
      const blocks = readContent();
      const block = findBlockInTree(blocks, state.blockId);
      const edit = block ? applyPasteChoice(choice, block, state.context) : null;
      if (!edit) {
        focusBlock(state.blockId, true);
        return;
      }
      pushUndoSnapshot(blocks);
      const replaced = updateBlockInTree(blocks, state.blockId, () => edit.block);
      writeContent(edit.inserted ? insertBlockAfterInTree(replaced, state.blockId, edit.inserted) : replaced);
      focusBlock(state.blockId, true);
      if (choice === "mention") {
        attachSnapshot({ kind: "mention", blockId: state.blockId, context: state.context });
        return;
      }
      attachSnapshot({ kind: "block", blockId: edit.inserted?.id ?? state.blockId, url: state.context.url });
    },
    [attachSnapshot, dismissPasteMenu, focusBlock, pushUndoSnapshot, readContent, writeContent],
  );

  return { pasteMenu, offerPasteMenu, choosePaste, dismissPasteMenu };
}
