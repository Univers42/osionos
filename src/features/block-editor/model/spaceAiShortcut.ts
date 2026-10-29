/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   spaceAiShortcut.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The "Press 'space' for AI" shortcut of an empty paragraph.
 *
 * Kept as a pure predicate so the truth table is testable without a DOM: the
 * keydown handler supplies the event, the block, and whether the editor is
 * editable and the assistant configured.
 */

import type { Block } from "@/entities/block";

export interface SpaceAiShortcutInput {
  /** `KeyboardEvent.key` — the space key is the single character `" "`. */
  key: string;
  /** The four modifiers that make a space something else (Shift+Space selects, …). */
  mods: {
    shift: boolean;
    ctrl: boolean;
    alt: boolean;
    meta: boolean;
  };
  /** An IME composition owns the key; never steal it. */
  composing: boolean;
  type: Block["type"];
  /** The block has no text — the space would be the first character. */
  isEmpty: boolean;
  /** The editor is in edit mode (not a locked/read-only render). */
  editable: boolean;
  /** `isAiConfigured()` — without the service Space keeps typing a space. */
  aiConfigured: boolean;
}

/** True when Space on an empty paragraph must open the inline AI prompt. */
export function shouldOpenAiOnSpace({
  key,
  mods,
  composing,
  type,
  isEmpty,
  editable,
  aiConfigured,
}: SpaceAiShortcutInput): boolean {
  return (
    key === " " &&
    !mods.shift &&
    !mods.ctrl &&
    !mods.alt &&
    !mods.meta &&
    !composing &&
    type === "paragraph" &&
    isEmpty &&
    editable &&
    aiConfigured
  );
}
