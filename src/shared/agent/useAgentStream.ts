/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useAgentStream.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Reusable Claude/agent SSE stream loop. Extracted from
 * widgets/agent-conversation so any surface can drive a streaming agent run.
 * The hook owns the streaming lifecycle; callers receive parsed SSE events
 * through `onEvent` and append their own message records however they like.
 */

import { useCallback, useRef, useState } from 'react';

export type StreamPayload = Record<string, unknown> & {
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  toolUseId?: string;
  message?: string;
};

export type StreamEventHandler = (event: string, data: StreamPayload) => Promise<void> | void;

export interface AgentStreamMessage {
  id: string;
  role: 'user' | 'assistant';
  body: string;
  createdAt: string;
}

interface UseAgentStreamOptions {
  /** Bridge SSE endpoint. Default '/api/agent/chat'. */
  endpoint?: string;
  /** Override the bridge origins to try (first that responds wins). */
  bridgeUrls?: string[];
}

const DEFAULT_ENDPOINT = '/api/agent/chat';
const DEFAULT_BRIDGE = (
  (import.meta.env as Record<string, string>)['VITE_OSIONOS_BRIDGE_URL']
  ?? (import.meta.env as Record<string, string>)['VITE_API_URL']
  ?? ''
).trim().replace(/\/$/, '');

/** Parse one `event:`/`data:` SSE block into a typed payload. */
export function parseSseBlock(block: string): { event: string; data: StreamPayload } | null {
  const lines = block.split('\n');
  const eventLine = lines.find((line) => line.startsWith('event:'));
  const dataLines = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart());
  if (dataLines.length === 0) return null;
  try {
    return { event: eventLine?.slice(6).trim() || 'message', data: JSON.parse(dataLines.join('\n')) as StreamPayload };
  } catch {
    return null;
  }
}

function bridgeOrigins(override?: string[]): string[] {
  if (override?.length) return override;
  return DEFAULT_BRIDGE ? [DEFAULT_BRIDGE] : ['http://localhost:4000'];
}

async function openStream(origins: string[], endpoint: string, body: unknown): Promise<Response> {
  let lastError: Error | null = null;
  for (const origin of origins) {
    try {
      const response = await fetch(`${origin}${endpoint}`, {
        method: 'POST',
        headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok && response.body) return response;
      lastError = new Error(`Agent bridge ${origin} returned ${response.status}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(`Agent bridge ${origin} failed.`);
    }
  }
  throw lastError ?? new Error('Agent bridge is unavailable.');
}

async function pumpStream(response: Response, onEvent: StreamEventHandler): Promise<void> {
  const reader = response.body!.getReader();
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

/**
 * Drive a streaming agent run. `send(body, onEvent)` opens the SSE stream and
 * relays every parsed event to `onEvent`; `streaming` flips while in flight.
 * The optional `messages`/`setMessages` give callers a minimal thread surface.
 */
export function useAgentStream(options: UseAgentStreamOptions = {}) {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const origins = useRef(bridgeOrigins(options.bridgeUrls));
  const [messages, setMessages] = useState<AgentStreamMessage[]>([]);
  const [streaming, setStreaming] = useState(false);

  const send = useCallback(async (body: unknown, onEvent: StreamEventHandler): Promise<void> => {
    setStreaming(true);
    try {
      const response = await openStream(origins.current, endpoint, body);
      await pumpStream(response, onEvent);
    } finally {
      setStreaming(false);
    }
  }, [endpoint]);

  return { messages, setMessages, send, streaming };
}
