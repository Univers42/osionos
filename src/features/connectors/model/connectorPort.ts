/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   connectorPort.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type {
  ConnectionErrorCode,
  ConnectionResult,
  ConnectionState,
  ConnectorDescriptor,
  ModelDescriptor,
} from "./connectorTypes";

/**
 * The `Connector` PORT (§6.1). The rest of the system depends only on this —
 * never on a provider SDK. Adapters live behind it. The transport is INJECTED
 * (so tests supply a fake and no network is touched).
 */

/** Result of a server-brokered credential probe (NOT a chat completion). */
export interface ValidateResult {
  ok: boolean;
  code?: ConnectionErrorCode;
  message?: string;
}

/** Transport-agnostic boundary: an adapter calls this to validate a credential. */
export interface ConnectorTransport {
  /** Cheapest authenticated probe that proves the credential is live. */
  validate(providerKey: string): Promise<ValidateResult>;
}

export interface Connector {
  /** Static metadata: providerKey, displayName, authStrategy, scopes/envVars. */
  describe(): ConnectorDescriptor;
  /** Runs the strategy's connection routine; moves the state machine. */
  connect(): Promise<ConnectionResult>;
  /** Cheap authenticated probe (not a completion); refreshes state. */
  validate(): Promise<ConnectionResult>;
  /** Models exposed to the picker — empty unless connected. */
  listModels(): ModelDescriptor[];
  /** Current connection state. */
  status(): ConnectionState;
  /** Revokes/forgets the credential ref and resets to disconnected. */
  disconnect(): Promise<void>;
}

/** A connector is built from an injected transport (keeps adapters testable). */
export type ConnectorFactory = (transport: ConnectorTransport) => Connector;
