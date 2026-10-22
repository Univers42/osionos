/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   dockHotkeyDecision.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/**
 * Which chord does what: the dock, or the AI.
 *
 * Ctrl+` is the dock's chord, everywhere. Ctrl+J is the AI's chord INSIDE the
 * block editor — the block menu has always advertised "Ask AI — Ctrl+J" — and
 * the dock's everywhere else. The decision lives here, away from the DOM, so
 * it can be tested without a browser.
 */

/** What a keystroke does. `null` means: not ours. */
export type DockHotkeyAction = "ask-ai" | "dock" | null;

/** Where the focus is when the key is pressed. */
export type DockHotkeyTarget =
  /** A block's editable, in the block editor. */
  | "block-editable"
  /** Another text field: a sidebar search, a composer, the AI's own input. */
  | "input"
  /** Anywhere else: the page, a button, the body. */
  | "other";

/** The keystroke, as the decision needs it. */
export interface DockHotkeyKeyEvent {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/** What the editor holds, as the decision needs it. */
export interface DockHotkeyState {
  /** Where the focus is. */
  target: DockHotkeyTarget;
  /** The editor holds a selected block — the AI would act on it. */
  hasSelectedBlock: boolean;
}

/**
 * The decision.
 *
 * - Ctrl+` always toggles the dock.
 * - Ctrl+J asks the AI when the focus is in the block editor (a block's
 *   editable, or a block the editor has selected) and toggles the dock
 *   anywhere else, as it always did.
 * - Ctrl+Shift+J is nobody's chord: the browser and the OS keep it.
 */
export function decideDockHotkey(
  event: DockHotkeyKeyEvent,
  state: DockHotkeyState,
): DockHotkeyAction {
  if (!event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.key === "`") return "dock";
  if (event.key.toLowerCase() !== "j") return null;
  if (event.shiftKey) return null;
  // The AI answers for the block under the caret, or for the selected one.
  if (state.target === "block-editable") return "ask-ai";
  // A selection counts only when the user is not typing somewhere else.
  if (state.hasSelectedBlock && state.target !== "input") return "ask-ai";
  return "dock";
}
