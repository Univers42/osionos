/**
 * React binding for the SSE reader. Isolated from the root entry so `react`
 * stays an optional peer dependency and the root stays type-strippable.
 */

import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import type { FetchLike } from './client.ts';
import { openSseStream, pumpSseStream, type StreamEventHandler } from './sse.ts';

/** A minimal thread record, offered as a convenience for simple chat surfaces. */
export interface StreamMessage {
  id: string;
  role: 'user' | 'assistant';
  body: string;
  createdAt: string;
}

export interface UseSseStreamOptions {
  /** Path appended to each origin. */
  endpoint: string;
  /** Origins tried in order; the first that responds wins. */
  origins: readonly string[];
  /** Injectable `fetch`, for tests or a non-browser host. */
  fetchImpl?: FetchLike;
}

export interface SseStream {
  messages: StreamMessage[];
  setMessages: Dispatch<SetStateAction<StreamMessage[]>>;
  /** Open the stream for `body` and relay every parsed event to `onEvent`. */
  send: (body: unknown, onEvent: StreamEventHandler) => Promise<void>;
  /** True while a run is in flight. */
  streaming: boolean;
}

/**
 * Drive a streaming run. `streaming` flips for the duration; `messages` /
 * `setMessages` are an optional thread surface callers may ignore entirely.
 */
export function useSseStream(options: UseSseStreamOptions): SseStream {
  const { endpoint, origins, fetchImpl } = options;
  // Pinned on first render: swapping transports mid-stream would orphan the
  // in-flight reader.
  const pinnedOrigins = useRef(origins);
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [streaming, setStreaming] = useState(false);

  const send = useCallback(
    async (body: unknown, onEvent: StreamEventHandler): Promise<void> => {
      setStreaming(true);
      try {
        const response = await openSseStream(pinnedOrigins.current, endpoint, body, fetchImpl);
        await pumpSseStream(response, onEvent);
      } finally {
        setStreaming(false);
      }
    },
    [endpoint, fetchImpl],
  );

  return { messages, setMessages, send, streaming };
}
