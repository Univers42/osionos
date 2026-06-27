/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   anthropicConnector.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { ConnectorFactory } from "../model/connectorPort";
import type { ConnectorDescriptor, ModelDescriptor } from "../model/connectorTypes";
import { createEnvTokenConnector } from "./envTokenAdapter";

/**
 * Anthropic (Claude) — the first FUNCTIONAL connector (§2). Env-token strategy:
 * the key lives in the bridge as ANTHROPIC_API_KEY; `validate()` is brokered by
 * the bridge against GET /v1/models (authenticated, non-completion). Models are a
 * curated STATIC list (marked so) — we do not need a live list endpoint here.
 */
export const ANTHROPIC_DESCRIPTOR: ConnectorDescriptor = {
  providerKey: "anthropic",
  displayName: "Claude (Anthropic)",
  authStrategy: "env_token",
  envVars: ["ANTHROPIC_API_KEY"],
  modelsAreStatic: true,
};

export const ANTHROPIC_MODELS: ModelDescriptor[] = [
  { id: "claude-opus-4-8", displayName: "Claude Opus 4.8", contextWindow: 200_000 },
  { id: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6", contextWindow: 200_000 },
  { id: "claude-haiku-4-5-20251001", displayName: "Claude Haiku 4.5", contextWindow: 200_000 },
];

export const createAnthropicConnector: ConnectorFactory = (transport) =>
  createEnvTokenConnector({ descriptor: ANTHROPIC_DESCRIPTOR, models: ANTHROPIC_MODELS }, transport);
