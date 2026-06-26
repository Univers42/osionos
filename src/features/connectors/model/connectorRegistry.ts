/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   connectorRegistry.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { ConnectorFactory } from "./connectorPort";
import type { ConnectorDescriptor, ModelDescriptor } from "./connectorTypes";
import { ANTHROPIC_DESCRIPTOR, ANTHROPIC_MODELS, createAnthropicConnector } from "../adapters/anthropicConnector";

/**
 * Registry of FUNCTIONAL connectors. ENV-TOKEN connectors map providerKey →
 * factory(transport); OAUTH connectors carry a spec the store builds with the
 * injected OAuth broker. Adding/swapping a provider touches only an adapter +
 * one entry here (hexagonal §4).
 */
export const CONNECTOR_FACTORIES: Record<string, ConnectorFactory> = {
  anthropic: createAnthropicConnector,
};

/** OAuth "Connect with Claude" — connect WITHOUT an API key (auth-code + PKCE). */
export const CLAUDE_OAUTH_DESCRIPTOR: ConnectorDescriptor = {
  providerKey: "claude",
  displayName: "Claude (sign in)",
  authStrategy: "oauth",
  scopes: ["profile", "models:read", "chat:write"],
  modelsAreStatic: true,
};

export interface OAuthSpec {
  descriptor: ConnectorDescriptor;
  models: ModelDescriptor[];
}

/** OAuth connector specs (built by the store with the OAuth broker). */
export const OAUTH_SPECS: Record<string, OAuthSpec> = {
  claude: { descriptor: CLAUDE_OAUTH_DESCRIPTOR, models: ANTHROPIC_MODELS },
};

/** Functional connector descriptors (have an adapter). OAuth Claude first (no key). */
export const FUNCTIONAL_CONNECTORS: ConnectorDescriptor[] = [CLAUDE_OAUTH_DESCRIPTOR, ANTHROPIC_DESCRIPTOR];

/**
 * Placeholder connectors shown in the UI as "available to connect" (design parity
 * with the mockup's app strip) — NO adapter this phase (§2). Data only.
 */
export const PLACEHOLDER_CONNECTORS: ConnectorDescriptor[] = [
  { providerKey: "slack", displayName: "Slack", authStrategy: "oauth", availableToConnect: true },
  { providerKey: "gmail", displayName: "Gmail", authStrategy: "oauth", availableToConnect: true },
  { providerKey: "gdrive", displayName: "Google Drive", authStrategy: "oauth", availableToConnect: true },
  { providerKey: "github", displayName: "GitHub", authStrategy: "oauth", availableToConnect: true },
  { providerKey: "linear", displayName: "Linear", authStrategy: "oauth", availableToConnect: true },
];

export function knownConnectorKeys(): string[] {
  return Object.keys(CONNECTOR_FACTORIES);
}
