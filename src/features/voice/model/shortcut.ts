/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   shortcut.ts                                        :+:      :+:    :+:   */
/*                                                    着           着    着     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  着       着        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The shortcut of the dictation.
 *
 * `Ctrl+Shift+D` (`Cmd+Shift+D` on a mac). It is free: the seeded shortcuts of
 * the automations take `mod+z`, `mod+shift+z`, `mod+y`, `mod+a`, `mod+c`,
 * `mod+x`, `mod+v`, `mod+shift+v`, `mod+d`, `mod+shift+p`, `mod+k`,
 * `mod+shift+f`, `mod+alt+…` and the bare keys — `mod+shift+d` is none of
 * them.
 *
 * The shortcut only acts in the composer that holds the caret: it toggles the
 * dictation of THAT composer, never another one.
 */

/** The name of the shortcut, as the automations write them. */
export const DICTATION_SHORTCUT = "mod+shift+d";

/** The keys of a keyboard event, as the shortcut reads them. */
export interface ShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/**
 * True when the event is the shortcut of the dictation.
 *
 * `mod` is Ctrl or Cmd: both are accepted, so the shortcut is the same on
 * every machine.
 */
export function isDictationShortcut(event: ShortcutEvent): boolean {
  if (event.key.toLowerCase() !== "d") return false;
  if (!event.shiftKey) return false;
  if (event.altKey) return false;
  return event.ctrlKey !== event.metaKey;
}
