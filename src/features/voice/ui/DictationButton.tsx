/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DictationButton.tsx                                :+:      :+:    :+:   */
/*                                                    着           着    着     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  着       着        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The microphone of the dictation.
 *
 * The state is VISIBLE: the ring pulses while the recording runs, and the
 * seconds left are written next to it. The button carries `aria-pressed`, and
 * a polite live region reads the final text — and nothing else, so a screen
 * reader is not interrupted by every second of the recording.
 */

import React, { useCallback, useEffect, useRef } from "react";
import { Mic, Square } from "lucide-react";

import { useToastStore } from "@osionos/ui/primitives/useToastStore";

import type { DictationLanguage } from "../api/voiceClient";
import { isDictationShortcut } from "../model/shortcut";
import { useDictation } from "../model/useDictation";

const BUTTON =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]";

const RING = "pointer-events-none absolute inset-0 rounded-md ring-2 ring-[var(--osio-accent)] animate-pulse";

export interface DictationButtonProps {
  /** The transcript lands in the composer, as typed input. */
  onText: (text: string) => void;
  /** The language of the dictation. */
  language?: DictationLanguage;
  /** The name of the button, for the readers of the screen. */
  label?: string;
  /** The class of the button, when the surface has its own. */
  className?: string;
}

export const DictationButton: React.FC<DictationButtonProps> = ({
  onText,
  language = "auto",
  label = "Dictate",
  className = "",
}) => {
  const { status, secondsLeft, error, errorKind, transcript, start, stop } = useDictation({ onText, language });
  const recording = status === "recording";
  const working = status === "working";

  // The refusal is a toast, like the one of the voice note: the live region
  // below carries the text of the dictation, and nothing else.
  useEffect(() => {
    if (!error) return;
    // The refusal of the microphone is the toast of the voice note, word for
    // word; the refusal of the service is the one of the dictation.
    useToastStore.getState().push({
      kind: "error",
      title: errorKind === "microphone" ? "Microphone unavailable" : "Dictation unavailable",
      description: error,
    });
  }, [error, errorKind]);

  const toggle = useCallback(() => {
    if (recording) {
      void stop();
      return;
    }
    if (working) return;
    void start();
  }, [recording, working, start, stop]);

  // The shortcut of the dictation (Ctrl+Shift+D): it acts on the composer that
  // holds the caret, and on no other.
  const container = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isDictationShortcut(event)) return;
      const active = document.activeElement as HTMLElement | null;
      const composer = active?.closest?.("[data-dictation-composer]");
      if (!composer || !container.current?.contains(composer)) return;
      event.preventDefault();
      toggle();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [toggle]);

  return (
    <span ref={container} className="relative inline-flex items-center gap-1">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={recording}
        aria-label={recording ? `Stop dictating, ${secondsLeft} seconds left` : label}
        title={recording ? `Stop dictating (${secondsLeft}s left)` : label}
        className={`${BUTTON} ${className}`}
      >
        {recording ? <Square size={12} /> : <Mic size={16} />}
      </button>
      {recording ? (
        <>
          <span aria-hidden="true" className={RING} />
          <span aria-hidden="true" className="text-2xs tabular-nums text-[var(--osio-fg-muted)]">
            {secondsLeft}s
          </span>
        </>
      ) : null}
      {/* The final text, and nothing else: the live region is read once. */}
      <span aria-live="polite" aria-atomic="true" className="sr-only">
        {transcript}
      </span>
    </span>
  );
};
