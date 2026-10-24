/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   VoiceSettingsPanel.tsx                             :+:      :+:    :+:   */
/*                                                    着           着    着     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  着       着        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Settings › Accessibility & voice — the dictation and the read-aloud.
 *
 * The online voices are OFF, and the switch says what turning them on means:
 * the text that is read aloud leaves the device and goes to the browser's
 * vendor. The local voices are the default, and they never leave.
 */

import React, { useEffect, useMemo, useState } from "react";

import { Checkbox } from "@osionos/ui/primitives/Checkbox";
import { useVoiceSettingsStore } from "@/store/settings";

import { DICTATION_LANGUAGES } from "@/features/voice/api/voiceClient";
import { availableVoices, browserSynthesis } from "@/features/voice/model/readAloud";
import type { SpeechVoice } from "@/features/voice/model/readAloud";

/** The languages of the dictation, in the words of the settings. */
const LANGUAGE_LABELS: Record<string, string> = {
  auto: "Automatic (the model decides)",
  en: "English",
  fr: "French",
  es: "Spanish",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
};

const FIELD =
  "w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 py-1.5 text-sm text-[var(--osio-fg-default)] outline-none focus:border-[var(--osio-accent)]";

const LABEL = "text-sm font-medium text-[var(--osio-fg-default)]";
const HINT = "text-xs text-[var(--osio-fg-muted)]";

export const VoiceSettingsPanel: React.FC = () => {
  const settings = useVoiceSettingsStore((state) => state.data);
  const update = useVoiceSettingsStore((state) => state.update);
  const [voices, setVoices] = useState<SpeechVoice[]>([]);

  // The voices of the browser arrive late: the list is filled on the event.
  useEffect(() => {
    const synthesis = browserSynthesis();
    if (!synthesis) return;
    const read = () => setVoices(synthesis.getVoices());
    read();
    const target = globalThis as unknown as {
      speechSynthesis?: {
        addEventListener?: (type: string, fn: () => void) => void;
        removeEventListener?: (type: string, fn: () => void) => void;
      };
    };
    target.speechSynthesis?.addEventListener?.("voiceschanged", read);
    return () => target.speechSynthesis?.removeEventListener?.("voiceschanged", read);
  }, []);

  // The voices the user may hear: the local ones, unless they opted in.
  const offered = useMemo(
    () => availableVoices(voices, settings.allowOnlineVoices),
    [voices, settings.allowOnlineVoices],
  );

  return (
    <div className="flex max-w-2xl flex-col gap-6 p-4">
      <section className="flex flex-col gap-2">
        <label className={LABEL} htmlFor="voice-dictation-language">
          Dictation language
        </label>
        <p className={HINT}>
          The language the recording is transcribed in. “Automatic” lets the model hear it.
        </p>
        <select
          id="voice-dictation-language"
          className={FIELD}
          value={settings.dictationLanguage}
          onChange={(event) => update({ dictationLanguage: event.target.value })}
        >
          {DICTATION_LANGUAGES.map((language) => (
            <option key={language} value={language}>
              {LANGUAGE_LABELS[language] ?? language}
            </option>
          ))}
        </select>
      </section>

      <section className="flex flex-col gap-2">
        <label className={LABEL} htmlFor="voice-read-aloud">
          Read-aloud voice
        </label>
        <p className={HINT}>The voice that reads an answer aloud. The local voices come first.</p>
        <select
          id="voice-read-aloud"
          className={FIELD}
          value={settings.readAloudVoiceURI}
          onChange={(event) => update({ readAloudVoiceURI: event.target.value })}
        >
          <option value="">The first voice available</option>
          {offered.map((voice) => (
            <option key={voice.voiceURI} value={voice.voiceURI}>
              {voice.name} ({voice.lang}){voice.localService ? "" : " — online"}
            </option>
          ))}
        </select>
      </section>

      <section className="flex flex-col gap-2">
        <label className={LABEL} htmlFor="voice-read-aloud-rate">
          Read-aloud rate
        </label>
        <input
          id="voice-read-aloud-rate"
          type="range"
          min={0.5}
          max={2}
          step={0.1}
          value={settings.readAloudRate}
          onChange={(event) => update({ readAloudRate: Number(event.target.value) })}
          className="w-full"
        />
        <p className={HINT}>{settings.readAloudRate.toFixed(1)}× the normal speed.</p>
      </section>

      <section className="flex flex-col gap-2">
        <Checkbox
          checked={settings.allowOnlineVoices}
          onChange={(checked) => update({ allowOnlineVoices: checked })}
          ariaLabel="Allow online voices"
          label="Allow online voices"
        />
        <p className={HINT}>
          An online voice is not on your device: the text read aloud is sent to your browser’s
          vendor to be spoken there. Leave this off to keep every word on this machine.
        </p>
      </section>
    </div>
  );
};
