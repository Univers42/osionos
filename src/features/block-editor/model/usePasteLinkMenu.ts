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
// as a link; nothing is fetched until a choice is made.

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

/** The menu hangs under the pasted link itself (not the caret, which sits at the block end).
 *  `blockElement` is the block under the paste event: a document-wide lookup by id would
 *  also match the same page open in another pane. */
function positionUnderLink(
  blockElement: HTMLElement | null,
  url: string,
  fallback: PasteMenuState["position"],
) {
  const anchors = Array.from(blockElement?.querySelectorAll<HTMLAnchorElement>("a.editor-link") ?? []);
  const link = anchors.find((anchor) => anchor.getAttribute("href") === url);
  if (!link) return fallback;
  const box = link.getBoundingClientRect();
  return { x: box.left, y: box.bottom, top: box.top };
}

export function usePasteLinkMenu(options: Readonly<UsePasteLinkMenuOptions>) {
  const { readContent, writeContent, pushUndoSnapshot, focusBlock, attachSnapshot, caretPosition } = options;
  const [pasteMenu, setPasteMenu] = useState<PasteMenuState | null>(null);
  const openRef = useRef<PasteMenuState | null>(null);

  const pendingOffer = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const offerToken = useRef(0);

  const dismissPasteMenu = useCallback(() => {
    offerToken.current += 1;
    if (pendingOffer.current !== null) globalThis.clearTimeout(pendingOffer.current);
    pendingOffer.current = null;
    openRef.current = null;
    setPasteMenu(null);
  }, []);

  // Deferred one tick: the pasted link is rendered by the re-render that follows the paste.
  // A dismiss (or a newer paste) during the tick or the provider lookup cancels the offer.
  const offerPasteMenu = useCallback(
    (blockId: string, context: PasteLinkContext, blockElement: HTMLElement | null = null) => {
      dismissPasteMenu();
      const token = offerToken.current;
      pendingOffer.current = globalThis.setTimeout(() => {
        pendingOffer.current = null;
        void defaultPasteChoice(context.url).then((initialChoice) => {
          if (token !== offerToken.current) return;
          const anchor = blockElement?.isConnected ? blockElement : null;
          const state: PasteMenuState = {
            blockId,
            context,
            initialChoice,
            position: positionUnderLink(anchor, context.url, caretPosition(blockId)),
          };
          openRef.current = state;
          setPasteMenu(state);
        });
      }, 0);
    },
    [caretPosition, dismissPasteMenu],
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
