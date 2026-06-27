/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   envTokenAdapter.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Connector, ConnectorTransport } from "../model/connectorPort";
import { assertTransition } from "../model/connectorMachine";
import type {
  ConnectionResult,
  ConnectionState,
  ConnectorDescriptor,
  ModelDescriptor,
} from "../model/connectorTypes";

/**
 * Generic ENV-TOKEN adapter (§6.3). The secret lives in the bridge (server/edge
 * broker), so there is nothing to enter client-side: `connect()` simply runs the
 * server-brokered `validate()` probe. The domain only ever sees an opaque
 * CredentialRef (`env:<VAR>`), never the token.
 */
export interface EnvTokenSpec {
  descriptor: ConnectorDescriptor;
  /** Curated static model list (descriptor.modelsAreStatic should be true). */
  models: ModelDescriptor[];
}

export function createEnvTokenConnector(spec: EnvTokenSpec, transport: ConnectorTransport): Connector {
  const { descriptor, models } = spec;
  let state: ConnectionState = "disconnected";
  let error: ConnectionResult["error"];
  let credentialRef: ConnectionResult["credentialRef"];

  const move = (to: ConnectionState): ConnectionState => (state = assertTransition(state, to));
  const snapshot = (): ConnectionResult => ({ state, error, credentialRef });

  const runValidate = async (): Promise<ConnectionResult> => {
    const result = await transport.validate(descriptor.providerKey);
    if (result.ok) {
      error = undefined;
      credentialRef = { handle: `env:${descriptor.envVars?.[0] ?? descriptor.providerKey}` };
      move("connected");
    } else {
      credentialRef = undefined;
      error = { code: result.code ?? "unknown", message: result.message ?? "Connection failed" };
      move("error");
    }
    return snapshot();
  };

  return {
    describe: () => descriptor,
    status: () => state,
    listModels: () => (state === "connected" ? models : []),
    connect: async () => {
      move("connecting");
      return runValidate();
    },
    validate: async () => {
      if (state === "disconnected") return snapshot();
      move("connecting");
      return runValidate();
    },
    disconnect: async () => {
      error = undefined;
      credentialRef = undefined;
      move("disconnected");
    },
  };
}
