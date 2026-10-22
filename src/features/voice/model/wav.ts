/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   wav.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/**
 * The WAV of a dictation: Float32 → PCM16 → the bytes of a file.
 *
 * The browser decodes the recording and resamples it to 16 kHz mono; this
 * module writes the 44-byte header the service expects. It is pure: no DOM,
 * no server, no network.
 */

/** The rate of a dictation: the rate the speech-to-text server wants. */
export const DICTATION_SAMPLE_RATE = 16_000;

/** The bytes of the header of a canonical WAV. */
export const WAV_HEADER_BYTES = 44;

/**
 * The samples, as 16-bit little-endian PCM.
 *
 * A sample outside [-1, 1] is clipped, never wrapped: a voice that peaks
 * above the full scale must not turn into its opposite.
 */
export function floatToPcm16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const raw = samples[index];
    const clipped = Math.max(-1, Math.min(1, Number.isFinite(raw) ? raw : 0));
    out[index] = Math.round(clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff);
  }
  return out;
}

/** The WAV of the samples: 16 kHz, mono, PCM16, one `data` chunk. */
export function pcm16ToWav(pcm: Int16Array, sampleRate: number = DICTATION_SAMPLE_RATE): Uint8Array {
  const bytes = new Uint8Array(WAV_HEADER_BYTES + pcm.length * 2);
  const view = new DataView(bytes.buffer);
  const write = (text: string, offset: number) => {
    for (let index = 0; index < text.length; index += 1) bytes[offset + index] = text.charCodeAt(index);
  };
  write('RIFF', 0);
  view.setUint32(4, 36 + pcm.length * 2, true);
  write('WAVE', 8);
  write('fmt ', 12);
  view.setUint32(16, 16, true); // the size of the fmt chunk
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // one channel
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // the byte rate
  view.setUint16(32, 2, true); // the block align
  view.setUint16(34, 16, true); // the bits of a sample
  write('data', 36);
  view.setUint32(40, pcm.length * 2, true);
  for (let index = 0; index < pcm.length; index += 1) {
    view.setInt16(WAV_HEADER_BYTES + index * 2, pcm[index], true);
  }
  return bytes;
}

/** The WAV of the samples: the whole chain, in one call. */
export function floatToWav(samples: Float32Array, sampleRate: number = DICTATION_SAMPLE_RATE): Uint8Array {
  return pcm16ToWav(floatToPcm16(samples), sampleRate);
}
