/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useDockHotkeys.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect } from "react";

import { useBlockSelection } from "@/features/block-editor/model/blockSelectionStore";
import { useInlineAiStore } from "@/features/ai/model/inlineAiStore";
import { decideDockHotkey, type DockHotkeyTarget } from "./dockHotkeyDecision";
import { useWorkbenchStore } from "./workbenchStore";

/** The block the AI would act on. */
interface AskAiTarget {
  pageId: string;
  blockId: string;
}

/** The element that has the focus, when the app has a DOM at all. */
function focusedElement(): Element | null {
  const active = globalThis.document?.activeElement ?? null;
  if (!active || typeof active.closest !== "function") return null;
  return active;
}

/**
 * Where the focus is, as the decision needs it.
 *
 * A block's editable is the AI's; any other text field is the user's own
 * (a sidebar search, a composer) and keeps Ctrl+J for the dock.
 */
function readTarget(): DockHotkeyTarget {
  const active = focusedElement();
  if (!active) return "other";
  const inBlock = active.closest("[data-block-id]");
  if (inBlock && active.closest('[contenteditable="true"]')) return "block-editable";
  const tag = active.tagName;
  const editable = active.getAttribute("contenteditable");
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || editable === "true" || editable === "") {
    return "input";
  }
  return "other";
}

/**
 * The block the AI answers for: the one under the caret, or the selected one.
 *
 * The block row carries the page it belongs to, so the panel opens on the
 * right page even when several editors are open at once.
 */
function readAskAiTarget(target: DockHotkeyTarget): AskAiTarget | null {
  const active = focusedElement();
  if (target === "block-editable" && active) {
    const block = active.closest("[data-block-id]");
    const blockId = block?.getAttribute("data-block-id") ?? null;
    const pageId = block?.getAttribute("data-page-id") ?? null;
    if (blockId && pageId) return { pageId, blockId };
  }
  const selection = useBlockSelection.getState();
  const blockId = selection.ids[0] ?? null;
  if (blockId && selection.pageId) return { pageId: selection.pageId, blockId };
  return null;
}

/**
 * Ctrl+` and Ctrl+J.
 *
 * Ctrl+` toggles the dock, everywhere. Ctrl+J toggles the dock too — except
 * inside the block editor, where it opens "Ask AI" on that block, the chord
 * the block menu has always advertised. The decision itself lives in
 * dockHotkeyDecision.ts, away from the DOM.
 */
export function useDockHotkeys(): void {
  const toggleDock = useWorkbenchStore((s) => s.toggleDock);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = readTarget();
      const selection = useBlockSelection.getState();
      const action = decideDockHotkey(e, {
        target,
        hasSelectedBlock: selection.ids.length > 0,
      });
      if (action === null) return;
      e.preventDefault();
      if (action === "dock") {
        toggleDock();
        return;
      }
      const askAi = readAskAiTarget(target);
      // No block to ask about: the dock is the better guess.
      if (!askAi) {
        toggleDock();
        return;
      }
      // The same door the block menu's "Ask AI" opens.
      useInlineAiStore.getState().open(askAi);
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [toggleDock]);
}
