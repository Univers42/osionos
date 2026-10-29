/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   voice-wav.test.ts                                  :+:      :+:    :+:   */
/*                                                    着           着    着     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  着       着        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The WAV of a dictation: the header, byte by byte, and the clipping.
 *
 * Pure logic only: no JSX, no server, no network.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  DICTATION_SAMPLE_RATE,
  floatToPcm16,
  floatToWav,
  pcm16ToWav,
  WAV_HEADER_BYTES,
} from "@/features/voice/model/wav";

/** The text of the bytes, as the header carries it. */
function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

test("the header of the WAV is the one the service expects", () => {
  const pcm = new Int16Array([0, 1, -1, 32767, -32768]);
  const wav = pcm16ToWav(pcm);
  assert.equal(wav.length, WAV_HEADER_BYTES + pcm.length * 2);
  assert.equal(ascii(wav, 0, 4), "RIFF");
  assert.equal(ascii(wav, 8, 4), "WAVE");
  assert.equal(ascii(wav, 12, 4), "fmt ");
  assert.equal(ascii(wav, 36, 4), "data");
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  assert.equal(view.getUint32(4, true), 36 + pcm.length * 2, "the RIFF size counts the rest of the file");
  assert.equal(view.getUint32(16, true), 16, "the size of the fmt chunk");
  assert.equal(view.getUint16(20, true), 1, "PCM");
  assert.equal(view.getUint16(22, true), 1, "one channel");
  assert.equal(view.getUint32(24, true), DICTATION_SAMPLE_RATE);
  assert.equal(view.getUint32(28, true), DICTATION_SAMPLE_RATE * 2, "the byte rate");
  assert.equal(view.getUint16(32, true), 2, "the block align");
  assert.equal(view.getUint16(34, true), 16, "the bits of a sample");
  assert.equal(view.getUint32(40, true), pcm.length * 2, "the size of the data chunk");
});

test("the samples round-trip through the PCM", () => {
  const samples = new Float32Array([0, 0.25, -0.25, 0.5, -0.5]);
  const pcm = floatToPcm16(samples);
  assert.equal(pcm.length, samples.length);
  assert.equal(pcm[0], 0);
  assert.equal(pcm[1], Math.round(0.25 * 0x7fff));
  assert.equal(pcm[2], Math.round(-0.25 * 0x8000));
  const wav = pcm16ToWav(pcm);
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  for (let index = 0; index < pcm.length; index += 1) {
    assert.equal(view.getInt16(WAV_HEADER_BYTES + index * 2, true), pcm[index], `the sample ${index}`);
  }
});

test("a sample outside the scale is clipped, never wrapped", () => {
  const pcm = floatToPcm16(new Float32Array([2, -2, 1, -1]));
  assert.equal(pcm[0], 32767, "the full scale, not the overflow");
  assert.equal(pcm[1], -32768, "the full scale, not the overflow");
  assert.equal(pcm[2], 32767);
  assert.equal(pcm[3], -32768);
});

test("the chain of the samples writes the WAV of the dictation", () => {
  const wav = floatToWav(new Float32Array([0.1, 0.2]));
  assert.equal(wav.length, WAV_HEADER_BYTES + 4);
  assert.equal(ascii(wav, 0, 4), "RIFF");
});
