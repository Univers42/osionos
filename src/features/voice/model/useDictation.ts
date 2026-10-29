/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useDictation.ts                                    :+:      :+:    :+:   */
/*                                                    着           着    着     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  着       着        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The dictation: the voice of the user, and the text it becomes.
 *
 * The order is the law. The read-aloud is cancelled BEFORE the microphone
 * opens (C65): otherwise the microphone hears the app reading a message
 * aloud, and the app transcribes itself.
 *
 * The text that comes back is TYPED INPUT: it lands in the composer where the
 * caret is. It never submits, never presses Enter, and never approves
 * anything — a spoken "approve" is a word in the box.
 *
 * The session is a module, not a component: the composer, the channel and the
 * editor share ONE dictation, and the state they show is the same one.
 */

import { useCallback, useEffect, useState } from "react";

import { createVoiceRecorder } from "@/widgets/channel-messages/model/voiceRecorderCore";
import type { VoiceRecorderCore } from "@/widgets/channel-messages/model/voiceRecorderCore";

import { transcribeVoice, type DictationLanguage } from "../api/voiceClient";
import { decodeToWav } from "./decodeToWav";
import { micErrorMessage } from "./micError";

/** The cap of a dictation: 30 s, and the recorder stops itself at it. */
export const DICTATION_MAX_MS = 30_000;

/** The browser APIs the dictation uses — a test injects its own. */
export interface DictationDeps {
  /** Stops the read-aloud. It runs BEFORE the microphone opens. */
  cancelSpeech(): void;
  /** Opens the microphone and starts the recording. */
  openMic(): Promise<void>;
  /** Stops the recording and gives the audio back. */
  closeMic(): Promise<Blob | null>;
  /** Abandons the recording. */
  dropMic(): void;
  /** The audio → the WAV the service wants. */
  decode(blob: Blob): Promise<Uint8Array>;
  /** The WAV → the text. */
  transcribe(wav: Uint8Array, language: DictationLanguage): Promise<string>;
}

/**
 * Starts a dictation.
 *
 * The read-aloud is cancelled first: the microphone must never hear the app.
 */
export async function startDictation(deps: DictationDeps): Promise<void> {
  deps.cancelSpeech();
  await deps.openMic();
}

/** Finishes a dictation: the audio → the text. */
export async function finishDictation(
  deps: DictationDeps,
  language: DictationLanguage = "auto",
): Promise<string> {
  const blob = await deps.closeMic();
  if (!blob) throw new Error("no_audio");
  const wav = await deps.decode(blob);
  return deps.transcribe(wav, language);
}

/** The status of a dictation. */
export type DictationStatus = "idle" | "recording" | "working" | "error";

export interface DictationState {
  status: DictationStatus;
  /** The seconds left before the cap. */
  secondsLeft: number;
  /** The sentence the user reads. */
  error: string | null;
  /** Where the failure comes from: the microphone, or the service. */
  errorKind: "microphone" | "service" | null;
  /** The last transcript: the live region reads it, and nothing else. */
  transcript: string;
}

/** The listener of the state. */
export type DictationListener = (state: DictationState) => void;

/** The sentence of a failure. */
export function dictationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message === "no_audio") return "Nothing was recorded. Try again.";
  if (error instanceof Error && error.name === "TimeoutError") return "The dictation took too long. Try again.";
  return micErrorMessage(error);
}

/** The deps of the browser: the real recorder, the real service. */
export function browserDeps(recorder: VoiceRecorderCore): DictationDeps {
  return {
    cancelSpeech: () => {
      const synthesis = (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
      synthesis?.cancel();
    },
    openMic: () => recorder.start(),
    closeMic: async () => (await recorder.stop())?.blob ?? null,
    dropMic: () => recorder.cancel(),
    decode: (blob: Blob) => decodeToWav(blob),
    transcribe: (wav: Uint8Array, language: DictationLanguage) => transcribeVoice(wav, { language }),
  };
}

/** The session: the recorder, the flow, and the state. */
class DictationSession {
  private recorder: VoiceRecorderCore | null = null;
  private deps: DictationDeps | null = null;
  private listeners = new Set<DictationListener>();
  private state: DictationState = {
    status: "idle",
    secondsLeft: DICTATION_MAX_MS / 1000,
    error: null,
    errorKind: null,
    transcript: "",
  };
  private sink: ((text: string) => void) | null = null;
  private language: DictationLanguage = "auto";

  /** The state, now. */
  getState(): DictationState {
    return this.state;
  }

  /** The listeners hear every change. */
  subscribe(listener: DictationListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** The state changes, and the listeners hear it. */
  private publish(next: Partial<DictationState>): void {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener(this.state);
  }

  /** The recorder, made once, and the deps that go with it. */
  private core(): { recorder: VoiceRecorderCore; deps: DictationDeps } {
    if (!this.recorder) {
      this.recorder = createVoiceRecorder({
        maxMs: DICTATION_MAX_MS,
        peaks: false,
        onState: (recorderState) => {
          this.publish({
            status: recorderState.status === "recording" ? "recording" : this.state.status,
            secondsLeft: Math.max(0, Math.ceil((DICTATION_MAX_MS - recorderState.elapsedMs) / 1000)),
          });
          // The cap fired: the recording stopped by itself, and the text is
          // transcribed without waiting for a click.
          if (recorderState.capped && this.state.status === "recording") void this.finish();
        },
      });
    }
    if (!this.deps) this.deps = browserDeps(this.recorder);
    return { recorder: this.recorder, deps: this.deps };
  }

  /** Starts a dictation: the read-aloud stops BEFORE the microphone opens. */
  async start(sink: (text: string) => void, language: DictationLanguage = "auto"): Promise<void> {
    if (this.state.status === "recording" || this.state.status === "working") return;
    this.sink = sink;
    this.language = language;
    this.publish({ status: "recording", error: null, errorKind: null, transcript: "" });
    try {
      await startDictation(this.core().deps);
    } catch (error) {
      // The microphone refused: the toast is the one of the voice note.
      this.publish({ status: "error", error: dictationErrorMessage(error), errorKind: "microphone" });
    }
  }

  /** Stops the recording and writes the text where it was asked for. */
  async stop(): Promise<void> {
    if (this.state.status !== "recording") return;
    await this.finish();
  }

  /** The recording → the transcript. */
  private async finish(): Promise<void> {
    this.publish({ status: "working", error: null, errorKind: null });
    try {
      const text = await finishDictation(this.core().deps, this.language);
      this.publish({ status: "idle", transcript: text });
      this.sink?.(text);
    } catch (error) {
      this.publish({ status: "error", error: dictationErrorMessage(error), errorKind: "service" });
    }
  }

  /** Abandons the recording. */
  cancel(): void {
    this.recorder?.cancel();
    this.publish({ status: "idle", error: null, errorKind: null });
  }
}

/** The one session of the app. */
export const dictationSession = new DictationSession();

/**
 * The dictation, as a hook.
 *
 * `onText` receives the transcript: the surface that asked for it puts it in
 * its composer, as typed input.
 */
export function useDictation(options: { onText: (text: string) => void; language?: DictationLanguage }) {
  const [state, setState] = useState<DictationState>(() => dictationSession.getState());
  useEffect(() => dictationSession.subscribe(setState), []);

  const start = useCallback(
    () => dictationSession.start(options.onText, options.language ?? "auto"),
    [options.onText, options.language],
  );
  const stop = useCallback(() => dictationSession.stop(), []);
  const cancel = useCallback(() => dictationSession.cancel(), []);

  return { ...state, start, stop, cancel };
}
