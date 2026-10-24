/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   voice-dictation.test.ts                            :+:      :+:    :+:   */
/*                                                    着           着    着     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  着       着        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The dictation: the barge-in, the voices, and what a transcript may do.
 *
 * Pure logic only: no JSX, no server, no network.
 */

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { applyTranscript, insertTranscript } from "@/features/voice/model/insertTranscript";
import { availableVoices, pickVoice } from "@/features/voice/model/readAloud";
import type { SpeechVoice } from "@/features/voice/model/readAloud";
import { isDictationShortcut } from "@/features/voice/model/shortcut";
import { startDictation } from "@/features/voice/model/useDictation";
import type { DictationDeps } from "@/features/voice/model/useDictation";

/** The deps of a dictation that records nothing: only the order matters. */
function fakeDeps(order: string[]): DictationDeps {
  return {
    cancelSpeech: () => {
      order.push("cancel");
    },
    openMic: async () => {
      order.push("mic");
    },
    closeMic: async () => null,
    dropMic: () => undefined,
    decode: async () => new Uint8Array(),
    transcribe: async () => "",
  };
}

test("the read-aloud is cancelled BEFORE the microphone opens", async () => {
  const order: string[] = [];
  await startDictation(fakeDeps(order));
  assert.deepEqual(order, ["cancel", "mic"], "the barge-in comes first: the app never hears itself");
});

test("the voices of the browser: the local ones, and the others only after the opt-in", () => {
  const voices: SpeechVoice[] = [
    { voiceURI: "local-one", name: "Local one", lang: "en-US", localService: true },
    { voiceURI: "remote-one", name: "Remote one", lang: "en-US", localService: false },
    { voiceURI: "local-two", name: "Local two", lang: "fr-FR", localService: true },
  ];
  assert.deepEqual(
    availableVoices(voices, false).map((voice) => voice.voiceURI),
    ["local-one", "local-two"],
    "only the local voices by default",
  );
  assert.deepEqual(
    availableVoices(voices, true).map((voice) => voice.voiceURI),
    ["local-one", "remote-one", "local-two"],
    "the remote voice appears only after the opt-in",
  );
  assert.equal(pickVoice(voices, "remote-one", false)?.voiceURI, "local-one", "a remote voice is never picked by default");
  assert.equal(pickVoice(voices, "remote-one", true)?.voiceURI, "remote-one");
});

test("a transcript lands as text, and it submits nothing", () => {
  let value = "hello ";
  let submitted = false;
  const next = applyTranscript(
    {
      value,
      caret: value.length,
      onChange: (text) => {
        value = text;
      },
    },
    "approve delete page",
  );
  assert.equal(value, "hello approve delete page", "the words land in the composer");
  assert.equal(next, value);
  assert.equal(submitted, false, "a transcript never submits: the user still presses the key");
});

test("the transcript lands where the caret is", () => {
  assert.equal(insertTranscript("ab", "XY", 1), "aXYb");
  assert.equal(insertTranscript("ab", "XY", 0), "XYab");
  assert.equal(insertTranscript("ab", "XY", 99), "abXY", "a caret past the end lands at the end");
});

test("the shortcut of the dictation is free and reads the modifiers", () => {
  assert.equal(isDictationShortcut({ key: "D", ctrlKey: true, metaKey: false, shiftKey: true, altKey: false }), true);
  assert.equal(isDictationShortcut({ key: "d", ctrlKey: false, metaKey: true, shiftKey: true, altKey: false }), true);
  assert.equal(isDictationShortcut({ key: "d", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false }), false, "without the shift it is another shortcut");
  assert.equal(isDictationShortcut({ key: "d", ctrlKey: true, metaKey: true, shiftKey: true, altKey: false }), false, "both modifiers is not the shortcut");
  assert.equal(isDictationShortcut({ key: "k", ctrlKey: true, metaKey: false, shiftKey: true, altKey: false }), false);
});

test("the app never uses SpeechRecognition", async () => {
  const root = fileURLToPath(new URL("../../src/", import.meta.url));
  const files: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = `${directory}${entry.name}`;
      if (entry.isDirectory()) {
        await walk(`${path}/`);
        continue;
      }
      if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) files.push(path);
    }
  };
  await walk(root);
  assert.ok(files.length > 0, "the sources of the app are there");
  const offenders: string[] = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (/webkitSpeechRecognition|\bSpeechRecognition\b/.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], "the dictation goes through the service, never through the browser");
});
