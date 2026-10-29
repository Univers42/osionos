/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   voice-recorder.test.ts                             :+:      :+:    :+:   */
/*                                                    着           着    着     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  着       着        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The recorder stops itself at the cap.
 *
 * The browser APIs are fakes and the clock is fake too, so the thirty seconds
 * of a dictation pass in an instant.
 *
 * Pure logic only: no JSX, no server, no network.
 */

import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { createVoiceRecorder } from "@/widgets/channel-messages/model/voiceRecorderCore";
import type { VoiceRecorderEnv } from "@/widgets/channel-messages/model/voiceRecorderCore";

/** The MediaRecorder of the test: it records nothing and says so. */
class FakeMediaRecorder {
  state: "inactive" | "recording" | "paused" = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  start(): void {
    this.state = "recording";
  }

  pause(): void {
    this.state = "paused";
  }

  resume(): void {
    this.state = "recording";
  }

  stop(): void {
    this.state = "inactive";
    this.onstop?.();
  }
}

/** The environment of the test: no microphone, no audio, no frames. */
function fakeEnv(clock: { value: number }): Partial<VoiceRecorderEnv> {
  const recorder = new FakeMediaRecorder();
  return {
    getUserMedia: async () => ({ getTracks: () => [{ stop: () => undefined }] }) as unknown as MediaStream,
    createAudioContext: () =>
      ({
        state: "running",
        createAnalyser: () => ({ fftSize: 256, getByteTimeDomainData: () => undefined }),
        createMediaStreamSource: () => ({ connect: () => undefined }),
        close: async () => undefined,
      }) as unknown as AudioContext,
    createMediaRecorder: () => recorder as unknown as MediaRecorder,
    isTypeSupported: () => true,
    now: () => clock.value,
    // No animation frame: the test does not need the waveform.
    requestFrame: () => 0,
    cancelFrame: () => undefined,
  };
}

/** Lets the promises of the recorder settle. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

test("the recorder stops itself at the cap", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const clock = { value: 0 };
    const recorder = createVoiceRecorder({ maxMs: 30_000, env: fakeEnv(clock), peaks: false });
    await recorder.start();
    assert.equal(recorder.state.status, "recording");
    clock.value = 29_000;
    mock.timers.tick(29_000);
    await settle();
    assert.equal(recorder.state.status, "recording", "the cap is not reached yet");
    clock.value = 30_000;
    mock.timers.tick(1_000);
    await settle();
    assert.equal(recorder.state.status, "idle", "the recorder stopped by itself");
    assert.equal(recorder.state.capped, true, "and it says the cap fired");
    assert.ok(recorder.lastResult, "the audio of the capped recording is kept");
  } finally {
    mock.timers.reset();
  }
});

test("a recorder without a cap never stops by itself", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const clock = { value: 0 };
    const recorder = createVoiceRecorder({ env: fakeEnv(clock), peaks: false });
    await recorder.start();
    clock.value = 120_000;
    mock.timers.tick(120_000);
    await settle();
    assert.equal(recorder.state.status, "recording", "the voice note is capped by its own UI");
    assert.equal(recorder.state.capped, false);
    recorder.cancel();
  } finally {
    mock.timers.reset();
  }
});
