/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useContextPicker.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The composer's picker: what the assistant is pointed at.
 *
 * Typing "@" opens the app's page picker — the editor's own, with its
 * keyboard. What the reader picks becomes a chip above the textarea, and the
 * chips are the context of the run: the pages it may read, and whether the
 * whole workspace is searched.
 *
 * The picker is the editor's (PageSelectorMenu): no second picker, the same
 * pages, the same arrows, Enter and Escape.
 */

import { useCallback, useState } from "react";

import {
  addContextChip,
  contextTrigger,
  type ContextChip,
} from "@/features/ai/model/aiContext";

/** Where the picker opens: under the composer, or above it when it would fit. */
export interface PickerPosition {
  x: number;
  y: number;
  top: number;
}

/** The "@" that opened the picker, and the query the reader typed after it. */
export interface ContextTrigger {
  query: string;
  start: number;
}

export interface ContextPicker {
  /** The "@" that opened the picker — null when it is closed. */
  trigger: ContextTrigger | null;
  /** Where the picker opens. */
  position: PickerPosition | null;
  /** The one line the reader is told when a pick is refused. */
  hint: string | null;
  /** Reads the "@" at the caret — after a keystroke and after a click. */
  sync: (element: HTMLTextAreaElement, text: string) => void;
  /** Closes the picker, leaving the text as it is. */
  close: () => void;
  /** Closes the picker and takes the "@" out of the question. */
  cancel: () => void;
  /** Adds a chip: a page of the workspace, or the whole workspace. */
  pick: (chip: ContextChip) => void;
  /** Takes a chip away. */
  remove: (id: string) => void;
}

interface Options {
  /** The text of the composer. */
  value: string;
  /** Writes the text of the composer. */
  onChange: (value: string) => void;
  /** The chips the reader picked. */
  chips: ContextChip[];
  /** Writes the chips. */
  onChipsChange: (chips: ContextChip[]) => void;
}

/** The composer's picker: the "@", the chips, and the line that refuses a pick. */
export function useContextPicker({ value, onChange, chips, onChipsChange }: Options): ContextPicker {
  const [trigger, setTrigger] = useState<ContextTrigger | null>(null);
  const [position, setPosition] = useState<PickerPosition | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const sync = useCallback(
    (element: HTMLTextAreaElement, text: string) => {
      const caret = element.selectionStart ?? text.length;
      const found = contextTrigger(text, caret);
      if (!found) {
        setTrigger(null);
        return;
      }
      if (trigger && trigger.start === found.start && trigger.query === found.query) return;
      // The picker opens where the composer is, and shows what was typed.
      const rect = element.getBoundingClientRect();
      setPosition({ x: rect.left + 12, y: rect.bottom + 6, top: rect.top });
      setTrigger(found);
    },
    [trigger],
  );

  /** Closes the picker, leaving the text as the reader wrote it. */
  const close = useCallback(() => {
    setTrigger(null);
  }, []);

  /** Closes the picker and takes the "@" out of the question. */
  const cancel = useCallback(() => {
    if (!trigger) return;
    onChange(`${value.slice(0, trigger.start)}${value.slice(trigger.start + 1 + trigger.query.length)}`);
    setTrigger(null);
  }, [onChange, trigger, value]);

  const pick = useCallback(
    (chip: ContextChip) => {
      const result = addContextChip(chips, chip);
      onChipsChange(result.chips);
      setHint(result.refusal);
      if (result.refusal) return;
      cancel();
    },
    [cancel, chips, onChipsChange],
  );

  const remove = useCallback(
    (id: string) => {
      onChipsChange(chips.filter((chip) => chip.id !== id));
      setHint(null);
    },
    [chips, onChipsChange],
  );

  return { trigger, position, hint, sync, close, cancel, pick, remove };
}
