/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useConnectorStore.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";

import type { Connector, ConnectorTransport } from "./connectorPort";
import type { ConnectorSnapshot, ModelDescriptor } from "./connectorTypes";
import { CONNECTOR_FACTORIES, FUNCTIONAL_CONNECTORS, OAUTH_SPECS } from "./connectorRegistry";
import { createBridgeTransport } from "./bridgeTransport";
import { createOAuthBroker } from "./oauthBroker";
import { createOAuthConnector, type OAuthBroker } from "../adapters/oauthAdapter";

/**
 * The connector state the UI subscribes to (§6.2 — the single source of truth).
 * Holds only SNAPSHOTS (no secret); credential probing is brokered by the bridge
 * via the injected transport. `createConnectorStore(transport)` keeps it testable.
 */
export interface ConnectorStoreState {
  snapshots: Record<string, ConnectorSnapshot>;
  init: () => void;
  connect: (providerKey: string) => Promise<void>;
  validate: (providerKey: string) => Promise<void>;
  disconnect: (providerKey: string) => Promise<void>;
  /** Union of models across connected connectors (drives the picker). */
  connectedModels: () => Array<{ providerKey: string; model: ModelDescriptor }>;
}

function snapshotOf(connector: Connector): ConnectorSnapshot {
  const d = connector.describe();
  const status = connector.status();
  return {
    providerKey: d.providerKey,
    displayName: d.displayName,
    authStrategy: d.authStrategy,
    state: status,
    models: connector.listModels(),
  };
}

export function createConnectorStore(transport: ConnectorTransport, broker: OAuthBroker) {
  const connectors = new Map<string, Connector>();
  const ensure = (key: string): Connector | undefined => {
    if (!connectors.has(key)) {
      const factory = CONNECTOR_FACTORIES[key];
      const spec = OAUTH_SPECS[key];
      if (factory) connectors.set(key, factory(transport));
      else if (spec) connectors.set(key, createOAuthConnector(spec, broker));
    }
    return connectors.get(key);
  };
  const refresh = (
    set: (fn: (s: ConnectorStoreState) => Partial<ConnectorStoreState>) => void,
    key: string,
    result?: { error?: ConnectorSnapshot["error"]; credentialRef?: ConnectorSnapshot["credentialRef"] },
  ) => {
    const connector = connectors.get(key);
    if (!connector) return;
    const snap: ConnectorSnapshot = {
      ...snapshotOf(connector),
      error: result?.error,
      credentialRef: result?.credentialRef,
      lastValidatedAt: connector.status() === "connected" ? new Date().toISOString() : undefined,
    };
    set((s) => ({ snapshots: { ...s.snapshots, [key]: snap } }));
  };

  return create<ConnectorStoreState>((set, get) => ({
    snapshots: {},
    init: () => {
      for (const descriptor of FUNCTIONAL_CONNECTORS) {
        if (ensure(descriptor.providerKey)) refresh(set, descriptor.providerKey);
      }
    },
    connect: async (key) => {
      const connector = ensure(key);
      if (!connector) return;
      const result = await connector.connect();
      refresh(set, key, result);
    },
    validate: async (key) => {
      const connector = ensure(key);
      if (!connector) return;
      const result = await connector.validate();
      refresh(set, key, result);
    },
    disconnect: async (key) => {
      const connector = connectors.get(key);
      if (!connector) return;
      await connector.disconnect();
      refresh(set, key);
    },
    connectedModels: () =>
      Object.values(get().snapshots)
        .filter((snap) => snap.state === "connected")
        .flatMap((snap) => snap.models.map((model) => ({ providerKey: snap.providerKey, model }))),
  }));
}

/** App singleton — credential probes + OAuth exchange go through the bridge broker. */
export const useConnectorStore = createConnectorStore(createBridgeTransport(), createOAuthBroker());
