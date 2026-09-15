/**
 * Server-Sent Events: parse, open, pump. No framework, no ambient config —
 * the React binding lives in `./react` so this module stays loadable by
 * runtimes that only strip types (no JSX, no DOM globals beyond fetch).
 */

import type { FetchLike } from './client.ts';

/** Arbitrary JSON payload, with the fields SSE agents conventionally send. */
export type StreamPayload = Record<string, unknown> & {
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  toolUseId?: string;
  message?: string;
};

/** Receives every decoded event. May be async — the pump awaits it in order. */
export type StreamEventHandler = (event: string, data: StreamPayload) => Promise<void> | void;

/**
 * Parse one `event:` / `data:` block. Returns `null` when the block carries no
 * data or the payload is not JSON — a partial flush is normal mid-stream, so a
 * malformed block is skipped rather than thrown.
 */
export function parseSseBlock(block: string): { event: string; data: StreamPayload } | null {
  const lines = block.split('\n');
  const eventLine = lines.find((line) => line.startsWith('event:'));
  const dataLines = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart());
  if (dataLines.length === 0) return null;
  try {
    return {
      event: eventLine?.slice(6).trim() || 'message',
      data: JSON.parse(dataLines.join('\n')) as StreamPayload,
    };
  } catch {
    return null;
  }
}

/**
 * POST to each origin in turn and return the first streaming response. Throws
 * the last failure when every origin is exhausted.
 */
export async function openSseStream(
  origins: readonly string[],
  endpoint: string,
  body: unknown,
  fetchImpl?: FetchLike,
): Promise<Response> {
  const doFetch: FetchLike = fetchImpl ?? ((input, init) => fetch(input, init));
  let lastError: Error | null = null;

  for (const origin of origins) {
    try {
      const response = await doFetch(`${origin}${endpoint}`, {
        method: 'POST',
        headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok && response.body) return response;
      lastError = new Error(`SSE endpoint ${origin} returned ${response.status}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(`SSE endpoint ${origin} failed.`);
    }
  }
  throw lastError ?? new Error('No SSE origin is available.');
}

/**
 * Drain `response.body`, splitting on the blank-line block separator and
 * relaying each parsed block to `onEvent`. The trailing buffer is flushed once
 * the stream ends, so a final block without a terminator is not lost.
 */
export async function pumpSseStream(response: Response, onEvent: StreamEventHandler): Promise<void> {
  const body = response.body;
  if (!body) throw new Error('SSE response has no body to read.');

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      const parsed = parseSseBlock(block);
      if (parsed) await onEvent(parsed.event, parsed.data);
    }
  }

  const parsed = parseSseBlock(buffer);
  if (parsed) await onEvent(parsed.event, parsed.data);
}
