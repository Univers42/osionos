import { useEffect } from "react";

import { isAutomationsEnabled } from "@/shared/config/featureFlags";
import { useBlockSelection } from "@/features/block-editor/model/blockSelectionStore";
import { useEditorCommandBus } from "@/features/block-editor/model/editorCommandBus";
import { isTextEntryTarget } from "@/features/block-editor/model/marqueeGeometry";

import { matchAutomation } from "./automationMatch";
import { commandById } from "./commandRegistry";
import { normalizeComboFromEvent } from "./combo";
import { isComboRecording } from "./recordingState";
import { useAutomationStore } from "./useAutomationStore";
import type { CommandContext } from "./types";

/** Non-printable keys that MAY be intercepted while a text field is focused. */
const NAV_KEYS = new Set([
  "Escape", "Delete", "Backspace", "Tab", "Enter",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "PageUp", "PageDown", "Home", "End",
]);

function buildContext(event: KeyboardEvent): CommandContext {
  const selection = useBlockSelection.getState();
  return {
    event,
    handle: useEditorCommandBus.getState().active,
    selection: { ids: selection.ids, pageId: selection.pageId, sourceKey: selection.activeSourceKey },
    activeElement: document.activeElement,
  };
}

/**
 * The single document-level, capture-phase keyboard dispatcher — mounted once in
 * App. It runs BEFORE React's delegated handlers, so a matched combo's
 * stopImmediatePropagation prevents any double-fire (undo/redo, canvas keymap,
 * palette hotkeys). It NEVER intercepts a typed character: while a text field is
 * focused, only modifier-chords and explicitly-named non-printables are candidates.
 * When the flag is off it is inert, so existing keybindings are byte-unchanged.
 */
export function useAutomationDispatcher(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!isAutomationsEnabled() || isComboRecording()) return;

      const inText = isTextEntryTarget(event.target);
      const hasChordMod = event.ctrlKey || event.metaKey || event.altKey;
      if (inText && !(hasChordMod || NAV_KEYS.has(event.key))) return; // bare/Shift printable → let it type

      // The free-form canvas / layout grid owns its own keymap (nudge/resize/undo per block).
      const target = event.target;
      if (target instanceof Element && target.closest(".osionos-layout-grid")) return;

      const combo = normalizeComboFromEvent(event);
      const ctx = buildContext(event);
      const automation = matchAutomation(useAutomationStore.getState().automations(), combo, ctx);
      if (!automation) return; // unbound → native + the editor's own key handling run

      const command = commandById[automation.actions[0]?.commandId];
      if (!command) return;
      if (command.enabled && !command.enabled(ctx)) return; // e.g. undo with no history → falls through to native

      event.preventDefault();
      event.stopImmediatePropagation();
      command.run(ctx);
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
