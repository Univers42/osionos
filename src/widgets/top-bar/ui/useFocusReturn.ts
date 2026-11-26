/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useFocusReturn.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useRef, type FocusEvent, type RefObject } from "react";
import { useBlockSelection } from "@/features/block-editor/model/blockSelectionStore";
import type { MenuAction } from "../model/menuTypes";

const EDITABLE = '[data-block-id], [contenteditable="true"]';

/** The element focus left to enter the menu, when it is an editable of a page. */
function editableOrNull(element: EventTarget | null): HTMLElement | null {
  return element instanceof HTMLElement && element.closest(EDITABLE) ? element : null;
}

/** True while blocks are selected: focusing a block would clear that selection (BlockEditorSurface focusin). */
function hasBlockSelection(): boolean {
  return useBlockSelection.getState().ids.length > 0;
}

export interface FocusReturn {
  /** Spread on the container: remembers the editable focus left when the menu took it. */
  captureProps: {
    onPointerDownCapture: () => void;
    onFocusCapture: (event: FocusEvent<HTMLElement>) => void;
  };
  /** Close-then-run protocol for a chosen row; see the doc of the hook. */
  activate: (item: MenuAction) => void;
}

/**
 * Remembers the editable that held focus before the menubar took it and gives
 * it back around a row's `run`. Rows that mark `refocusEditor` (Undo, Redo)
 * get the editable BEFORE `run`, since native undo acts on the focused
 * element. Every other row runs first and focus returns on the next frame,
 * never into a block while blocks are selected: focusin there clears the
 * marquee selection that Edit › Copy/Cut/Delete act on. When no editable takes
 * focus back and focus sits on <body>, it lands on `fallbackRef` (the opener).
 * Ponytail: a click on a non-focusing control (Safari buttons) is caught on
 * pointerdown only — focus that moved earlier by script is not remembered.
 */
export function useFocusReturn(containerRef: RefObject<HTMLElement | null>, fallbackRef?: RefObject<HTMLElement | null>): FocusReturn {
  const remembered = useRef<HTMLElement | null>(null);

  const remember = (from: EventTarget | null): void => {
    if (from instanceof Node && containerRef.current?.contains(from)) return;
    remembered.current = editableOrNull(from);
  };

  const refocus = (): void => {
    const target = remembered.current;
    if (target?.isConnected && !hasBlockSelection()) target.focus({ preventScroll: true });
  };

  const restoreAfterRun = (): void => {
    const active = document.activeElement;
    if (active !== document.body && !containerRef.current?.contains(active)) return;
    refocus();
    if (document.activeElement === document.body) fallbackRef?.current?.focus({ preventScroll: true });
  };

  return {
    captureProps: {
      onPointerDownCapture: () => remember(document.activeElement),
      onFocusCapture: (event) => { if (event.relatedTarget) remember(event.relatedTarget); },
    },
    activate: (item) => {
      if (item.refocusEditor) refocus();
      item.run();
      requestAnimationFrame(restoreAfterRun);
    },
  };
}
