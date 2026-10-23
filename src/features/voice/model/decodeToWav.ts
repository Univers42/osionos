/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   decodeToWav.ts                                     :+:      :+:    :+:   */
/*                                                   lis        lis    lis     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  lis       lis        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The audio of the browser → the WAV the service wants.
 *
 * The decoding and the resampling are the platform's work: `decodeAudioData`
 * reads whatever the recorder produced (webm/opus, m4a, …), and an
 * `OfflineAudioContext` renders it again at 16 kHz mono. The service never
 * decodes anything: it only checks the bytes it is given.
 */

import { DICTATION_SAMPLE_RATE, floatToWav } from './wav';

/** The audio of the browser, resampled and written as a WAV. */
export async function decodeToWav(blob: Blob): Promise<Uint8Array> {
  const buffer = await blob.arrayBuffer();
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(buffer);
    const frames = Math.max(1, Math.round(decoded.duration * DICTATION_SAMPLE_RATE));
    const offline = new OfflineAudioContext(1, frames, DICTATION_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return floatToWav(rendered.getChannelData(0));
  } finally {
    await context.close().catch(() => undefined);
  }
}
