/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   readAloud.ts                                       :+:      :+:    :+:   */
/*                                                   lis        lis    lis     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  lis       lis        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Reading a message aloud.
 *
 * The synthesis of the browser stays ON THE DEVICE unless the user says
 * otherwise: the voices that are not local (`localService === false`) are
 * offered only after an explicit opt-in, and the opt-in says that the text
 * leaves the device.
 *
 * The speech recognition of the browser is never used: the dictation goes
 * through the service, and the service is the one that answers.
 */

/** A voice of the browser, as the settings see it. */
export interface SpeechVoice {
  voiceURI: string;
  name: string;
  lang: string;
  /** The browser says whether the voice is on the device. */
  localService: boolean;
  default?: boolean;
}

/** The synthesis of the browser, when it has one. */
export interface SpeechSynthesisLike {
  getVoices(): SpeechVoice[];
  speak(utterance: SpeechSynthesisUtterance): void;
  cancel(): void;
}

/**
 * The voices the user may hear.
 *
 * The local ones, unless the user opted into the online ones: a voice that is
 * not local sends the text to the browser's vendor.
 */
export function availableVoices(
  voices: readonly SpeechVoice[],
  allowOnline: boolean,
): SpeechVoice[] {
  if (allowOnline) return [...voices];
  return voices.filter((voice) => voice.localService === true);
}

/** The voice of the settings, or the first one the user may hear. */
export function pickVoice(
  voices: readonly SpeechVoice[],
  voiceURI: string,
  allowOnline: boolean,
): SpeechVoice | null {
  const allowed = availableVoices(voices, allowOnline);
  if (allowed.length === 0) return null;
  return allowed.find((voice) => voice.voiceURI === voiceURI) ?? allowed[0];
}

/** The synthesis of the browser, when it has one. */
export function browserSynthesis(): SpeechSynthesisLike | null {
  const synthesis = (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
  if (!synthesis) return null;
  return {
    getVoices: () => synthesis.getVoices() as unknown as SpeechVoice[],
    speak: (utterance) => synthesis.speak(utterance),
    cancel: () => synthesis.cancel(),
  };
}

/** Reads a text aloud, with the voice of the settings. */
export function speak(
  text: string,
  options: { voice?: SpeechVoice | null; rate?: number; synthesis?: SpeechSynthesisLike | null } = {},
): boolean {
  const synthesis = options.synthesis ?? browserSynthesis();
  if (!synthesis || !text.trim()) return false;
  const utterance = new SpeechSynthesisUtterance(text);
  if (options.voice) utterance.voice = options.voice as unknown as SpeechSynthesisUtterance["voice"];
  utterance.rate = Math.max(0.5, Math.min(2, options.rate ?? 1));
  synthesis.speak(utterance);
  return true;
}

/** Stops the reading. */
export function stopSpeaking(synthesis: SpeechSynthesisLike | null = browserSynthesis()): void {
  synthesis?.cancel();
}
