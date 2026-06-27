/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   connectorTypes.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Domain types for the Universal Connector subsystem. These are the contract
 * spine (the repo has no IDL) — provider SDK shapes never appear here.
 * SECURITY: a `CredentialRef` is an opaque handle; the raw secret lives only in
 * the bridge/adapter boundary and never in these domain types.
 */

export type AuthStrategy = "oauth" | "env_token";

export type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

export type ConnectionErrorCode =
  | "invalid_credential"
  | "unreachable"
  | "oauth_state_mismatch"
  | "cancelled"
  | "unknown";

export interface ConnectionError {
  code: ConnectionErrorCode;
  message: string;
}

/** A model exposed to the picker. */
export interface ModelDescriptor {
  id: string;
  displayName: string;
  contextWindow?: number;
}

/** Reserve room for tools/resources (future remote-MCP adapter) — not implemented. */
export interface ConnectorCapability {
  models: ModelDescriptor[];
}

/** Opaque reference to a credential held in the secure store — NEVER the secret. */
export interface CredentialRef {
  handle: string;
}

/** Static metadata for a connector (from `describe()`). */
export interface ConnectorDescriptor {
  providerKey: string;
  displayName: string;
  authStrategy: AuthStrategy;
  /** OAuth: scopes shown to the user before redirect. */
  scopes?: string[];
  /** env_token: required env var NAMES (never values). */
  envVars?: string[];
  /** `true` when `listModels()` returns a curated static list rather than a live fetch. */
  modelsAreStatic?: boolean;
  /** Placeholder connectors are shown as "available to connect" but have no adapter yet. */
  availableToConnect?: boolean;
}

export interface ConnectionResult {
  state: ConnectionState;
  error?: ConnectionError;
  credentialRef?: CredentialRef;
}

/** The snapshot the UI subscribes to (no secret). */
export interface ConnectorSnapshot {
  providerKey: string;
  displayName: string;
  authStrategy: AuthStrategy;
  state: ConnectionState;
  error?: ConnectionError;
  models: ModelDescriptor[];
  credentialRef?: CredentialRef;
  lastValidatedAt?: string;
}
