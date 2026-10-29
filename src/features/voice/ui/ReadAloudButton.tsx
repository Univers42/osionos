/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ReadAloudButton.tsx                                :+:      :+:    :+:   */
/*                                                    着           着    着     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  着       着        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Reading an answer aloud.
 *
 * The voices that are not local are offered only after the user opted in, and
 * the opt-in says that the text leaves the device. The button reads the
 * message with the voice of the settings, and stops when it is pressed again.
 */

import React, { useEffect, useState } from "react";
import { Square, Volume2 } from "lucide-react";

import { useVoiceSettingsStore } from "@/store/settings";

import { availableVoices, browserSynthesis, pickVoice, speak, stopSpeaking } from "../model/readAloud";
import type { SpeechVoice } from "../model/readAloud";

const BUTTON =
  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]";

export interface ReadAloudButtonProps {
  /** The text that is read. */
  text: string;
}

export const ReadAloudButton: React.FC<ReadAloudButtonProps> = ({ text }) => {
  const settings = useVoiceSettingsStore((state) => state.data);
  const [voices, setVoices] = useState<SpeechVoice[]>([]);
  const [reading, setReading] = useState(false);

  // The voices of the browser arrive late: the list is filled on the event.
  useEffect(() => {
    const synthesis = browserSynthesis();
    if (!synthesis) return;
    const read = () => setVoices(synthesis.getVoices());
    read();
    const target = globalThis as unknown as {
      speechSynthesis?: { addEventListener?: (type: string, fn: () => void) => void; removeEventListener?: (type: string, fn: () => void) => void };
    };
    target.speechSynthesis?.addEventListener?.("voiceschanged", read);
    return () => target.speechSynthesis?.removeEventListener?.("voiceschanged", read);
  }, []);

  const toggle = () => {
    if (reading) {
      stopSpeaking();
      setReading(false);
      return;
    }
    const synthesis = browserSynthesis();
    const voice = pickVoice(voices, settings.readAloudVoiceURI, settings.allowOnlineVoices);
    const spoken = speak(text, { voice, rate: settings.readAloudRate, synthesis });
    setReading(spoken);
  };

  // The voices the user may hear: the local ones, unless they opted in.
  const allowed = availableVoices(voices, settings.allowOnlineVoices);

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={reading}
        aria-label={reading ? "Stop reading aloud" : "Read aloud"}
        title={reading ? "Stop reading aloud" : "Read aloud"}
        className={BUTTON}
      >
        {reading ? <Square size={10} /> : <Volume2 size={12} />}
        <span>{reading ? "Stop" : "Read aloud"}</span>
      </button>
      {allowed.length > 0 && settings.allowOnlineVoices ? (
        <span className="sr-only">Online voices are allowed: the text leaves this device.</span>
      ) : null}
    </span>
  );
};
