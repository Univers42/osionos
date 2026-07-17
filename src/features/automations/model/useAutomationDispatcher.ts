import { useEffect } from "react";

import { isAutomationsEnabled } from "@/shared/config/featureFlags";
import { useBlockSelection } from "@/features/block-editor/model/blockSelectionStore";
import { useEditorCommandBus } from "@/features/block-editor/model/editorCommandBus";
import { isTextEntryTarget } from "@/features/block-editor/model/marqueeGeometry";

import { isChordPrefix, matchAutomation } from "./automationMatch";
import { commandById } from "./commandRegistry";
import { normalizeComboFromEvent } from "./combo";
import { isComboRecording } from "./recordingState";
import { useAutomationStore } from "./useAutomationStore";
import type { Automation, CommandContext } from "./types";

/** Non-printable keys that MAY be intercepted while a text field is focused. */
const NAV_KEYS = new Set([
  "Escape", "Delete", "Backspace", "Tab", "Enter",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "PageUp", "PageDown", "Home", "End",
]);

/** A modifier pressed alone is never a combo. Critically, holding one AUTO-REPEATS
 *  its keydown — without this guard those repeats would cancel a pending chord. */
const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "OS", "AltGraph"]);

/** How long a chord's first step stays armed (VSCode-ish). */
const CHORD_WINDOW_MS = 1500;

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
    // The armed first step of a chord, e.g. "mod+k" of "mod+k mod+z".
    let pending: string | null = null;
    let pendingTimer: ReturnType<typeof setTimeout> | undefined;
    const clearPending = (): void => {
      pending = null;
      if (pendingTimer) clearTimeout(pendingTimer);
      pendingTimer = undefined;
    };
    const armPending = (combo: string): void => {
      clearPending();
      pending = combo;
      pendingTimer = setTimeout(clearPending, CHORD_WINDOW_MS);
    };

    const runCommand = (automation: Automation, ctx: CommandContext, event: KeyboardEvent): boolean => {
      const command = commandById[automation.actions[0]?.commandId];
      if (!command) return false;
      if (command.enabled && !command.enabled(ctx)) return false; // e.g. undo with no history → native
      event.preventDefault();
      event.stopImmediatePropagation();
      command.run(ctx);
      return true;
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (!isAutomationsEnabled() || isComboRecording()) return;
      if (MODIFIER_KEYS.has(event.key)) return; // a held modifier auto-repeats — never a step

      const combo = normalizeComboFromEvent(event);
      const ctx = buildContext(event);
      const automations = useAutomationStore.getState().automations();

      // Chord step 2. MUST come before the typing guard: the first step may have
      // focused a text field (mod+k opens Search), and the second key would then
      // be swallowed as "just typing".
      if (pending) {
        const prefix = pending;
        clearPending();
        const chorded = matchAutomation(automations, combo, ctx, prefix);
        if (chorded && runCommand(chorded, ctx, event)) return;
        // Unresolved → fall through and treat this key normally.
      }

      const inText = isTextEntryTarget(event.target);
      const hasChordMod = event.ctrlKey || event.metaKey || event.altKey;
      if (inText && !(hasChordMod || NAV_KEYS.has(event.key))) return; // bare/Shift printable → let it type

      // The free-form canvas / layout grid owns its own keymap (nudge/resize/undo
      // per block) — and so does any ARIA `application` region (the /draw canvas):
      // that role is the declaration "keyboard handled inside".
      // A modal dialog owns it too: this listener is on CAPTURE and runCommand()
      // calls stopImmediatePropagation(), so without this guard an Escape typed
      // inside an open modal is eaten by the background "clear-selection" binding
      // and the modal can never be dismissed with Escape (Modal.tsx's own handler
      // never runs). The dialog on top owns the keyboard.
      const target = event.target;
      if (target instanceof Element && target.closest('.osionos-layout-grid, [role="application"], [role="dialog"]')) return;

      // Arm a chord whose first step this is. Deliberately NOT exclusive: "mod+k"
      // still runs Search below, so adding the chord costs no existing binding.
      if (isChordPrefix(automations, combo, ctx)) armPending(combo);

      const automation = matchAutomation(automations, combo, ctx);
      if (!automation) return; // unbound → native + the editor's own key handling run
      runCommand(automation, ctx, event);
    };

    const onBlur = (): void => clearPending();

    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onBlur);
    return () => {
      clearPending();
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
}
