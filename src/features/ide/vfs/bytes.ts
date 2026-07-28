/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bytes.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Collect a write payload into one buffer (providers that store whole files). */
export async function collectBytes(data: ReadableStream<Uint8Array> | Uint8Array): Promise<Uint8Array> {
  if (data instanceof Uint8Array) return data;
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = data.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Wrap (a range of) a buffer as a one-chunk stream — the read() shape. */
export function bytesToStream(data: Uint8Array, offset = 0, length?: number): ReadableStream<Uint8Array> {
  const end = length === undefined ? data.length : Math.min(data.length, offset + length);
  const slice = data.subarray(Math.min(offset, data.length), Math.max(end, Math.min(offset, data.length)));
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (slice.length > 0) controller.enqueue(slice.slice());
      controller.close();
    },
  });
}

export function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function bytesToText(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}
