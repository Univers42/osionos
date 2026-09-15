/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useAgentStream.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/15 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * App-side binding for the SSE reader in `@osionos/http-gate`.
 *
 * The stream mechanism (parse / open / pump, and the React lifecycle) lives in
 * the package. What stays here is osionos policy: which bridge origin to reach
 * and which endpoint answers an agent run.
 */

import { parseSseBlock } from '@osionos/http-gate';
import { useSseStream, type StreamMessage } from '@osionos/http-gate/react';

export { parseSseBlock };
export type { StreamEventHandler, StreamPayload } from '@osionos/http-gate';

/** Kept as the historical name for this app's minimal thread record. */
export type AgentStreamMessage = StreamMessage;

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

function bridgeOrigins(override?: string[]): string[] {
  if (override?.length) return override;
  return DEFAULT_BRIDGE ? [DEFAULT_BRIDGE] : ['http://localhost:4000'];
}

/**
 * Drive a streaming agent run. `send(body, onEvent)` opens the SSE stream and
 * relays every parsed event to `onEvent`; `streaming` flips while in flight.
 * The optional `messages`/`setMessages` give callers a minimal thread surface.
 */
export function useAgentStream(options: UseAgentStreamOptions = {}) {
  return useSseStream({
    endpoint: options.endpoint ?? DEFAULT_ENDPOINT,
    origins: bridgeOrigins(options.bridgeUrls),
  });
}
