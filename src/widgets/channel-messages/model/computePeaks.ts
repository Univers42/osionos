/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   computePeaks.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Decode a recorded audio blob and reduce it to ~40 max-abs peaks normalized to
 * [0,1] for the voice-message waveform. Degrades to a flat array on decode
 * failure (e.g. unsupported codec / no AudioContext in tests).
 */

const PEAK_COUNT = 40;

export async function computePeaks(blob: Blob): Promise<number[]> {
  try {
    const Ctx = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return new Array(PEAK_COUNT).fill(0);
    const ctx = new Ctx();
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    const data = audio.getChannelData(0);
    const block = Math.max(1, Math.floor(data.length / PEAK_COUNT));
    const peaks: number[] = [];
    for (let i = 0; i < PEAK_COUNT; i += 1) {
      let max = 0;
      const start = i * block;
      for (let j = 0; j < block && start + j < data.length; j += 1) {
        max = Math.max(max, Math.abs(data[start + j]));
      }
      peaks.push(max);
    }
    void ctx.close().catch(() => undefined);
    const ceiling = Math.max(...peaks, 0.0001);
    return peaks.map((p) => Number((p / ceiling).toFixed(3)));
  } catch {
    return new Array(PEAK_COUNT).fill(0);
  }
}
