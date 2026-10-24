/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   errorWords.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The service's error codes, in plain words.
 *
 * A code is a machine word; the pane speaks to a person. Every code the
 * contract knows has a sentence here, and an unknown one still reads as one.
 */

/** The codes of the wire contract, plus the ones the client produces itself. */
const WORDS: Record<string, string> = {
  unauthenticated: "Your session expired. Sign in again to keep talking.",
  not_found: "That conversation is gone.",
  invalid_request: "The request was rejected.",
  model_not_allowed: "That model is not available on this platform.",
  run_in_progress: "A run is already going on in this conversation.",
  budget_exhausted: "The daily budget is used up.",
  rate_limited: "Too many requests. Wait a moment and try again.",
  payload_too_large: "That message is too long.",
  upstream_error: "The model service failed. Try again.",
  cancelled: "The run was cancelled.",
  timeout: "The model took too long. Try again.",
  internal: "Something went wrong. Try again.",
  run_expired: "That answer expired and can no longer be resumed.",
  resume_failed: "The connection dropped and the run could not be resumed.",
  no_stream: "The service answered without a stream.",
  endpoint_not_allowed: "Our server refused that address. Use a public https://<host>/v1 URL.",
  provider_not_supported: "We do not support that provider yet. Try OpenRouter or another provider.",
  network_error: "We could not reach the server. Check your connection and try again.",
  oauth_failed: "The sign-in did not go through. Start it again.",
};

/** The sentence for a code — never the code alone. */
export function errorWords(code?: string): string {
  if (!code) return "Something went wrong. Try again.";
  return WORDS[code] ?? `The assistant failed (${code}). Try again.`;
}
