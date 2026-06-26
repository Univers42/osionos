/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inferencePort.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * THE INFERENCE BOUNDARY (§6.5). The Chat Shell's "send" path terminates here.
 * Phase 1 ships ONLY a stub that returns a visibly-fake assistant message echoing
 * the resolved {connector, model}. NO provider completion/streaming API is imported
 * (the inference fence test asserts this). Phase 2 = swap in a real adapter behind
 * this single port — e.g. the existing agent streaming / bridge-agent path.
 */

export interface InferenceMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface InferenceRequest {
  connectorId: string;
  model: string;
  messages: InferenceMessage[];
}

export interface InferenceResult {
  content: string;
}

export interface InferencePort {
  complete(request: InferenceRequest): Promise<InferenceResult>;
}

/** Phase-1 stub: a fixed, obviously-fake assistant turn. Crosses no inference fence. */
export const stubInferencePort: InferencePort = {
  async complete({ connectorId, model }) {
    return { content: `[stub] connector=${connectorId} model=${model} — inference not wired in Phase 1` };
  },
};
