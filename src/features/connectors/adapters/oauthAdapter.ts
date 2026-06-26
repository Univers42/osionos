/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   oauthAdapter.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Connector } from "../model/connectorPort";
import { assertTransition } from "../model/connectorMachine";
import type {
  ConnectionError,
  ConnectionResult,
  ConnectionState,
  ConnectorDescriptor,
  CredentialRef,
  ModelDescriptor,
} from "../model/connectorTypes";
import { challengeFromVerifier, createCodeVerifier, createState } from "./pkce";

/**
 * OAuth authorization-code + PKCE adapter (§6.3). The browser generates the PKCE
 * verifier/challenge and a random `state`, surfaces scopes, and runs the redirect
 * via the injected `OAuthBroker`. The TOKEN EXCHANGE and storage happen on the
 * bridge (the broker) — the access token never reaches this adapter; we only ever
 * hold an opaque `CredentialRef`. `state` is validated on callback; the verifier
 * is single-use and discarded after exchange.
 */
export interface AuthorizeOutcome {
  code?: string;
  /** The `state` echoed by the authorization server (must equal the one we sent). */
  state?: string;
  error?: ConnectionError;
}

export interface ExchangeOutcome {
  ok: boolean;
  credentialRef?: CredentialRef;
  error?: ConnectionError;
}

export interface OAuthBroker {
  /** Surface scopes, open the AS, and resolve with the callback (code + state). */
  authorize(input: { providerKey: string; scopes: string[]; state: string; codeChallenge: string }): Promise<AuthorizeOutcome>;
  /** Bridge swaps {code, verifier} for a token SERVER-SIDE and returns only a ref. */
  exchange(input: { providerKey: string; code: string; codeVerifier: string }): Promise<ExchangeOutcome>;
  /** Bridge confirms the stored credential is still live. */
  validate(providerKey: string, ref: CredentialRef): Promise<{ ok: boolean; code?: ConnectionError["code"]; message?: string }>;
  /** Bridge revokes/forgets the stored credential. */
  revoke(providerKey: string, ref: CredentialRef): Promise<void>;
}

export interface OAuthSpec {
  descriptor: ConnectorDescriptor;
  models: ModelDescriptor[];
}

export function createOAuthConnector(spec: OAuthSpec, broker: OAuthBroker): Connector {
  const { descriptor, models } = spec;
  let state: ConnectionState = "disconnected";
  let error: ConnectionError | undefined;
  let credentialRef: CredentialRef | undefined;

  const move = (to: ConnectionState): ConnectionState => (state = assertTransition(state, to));
  const fail = (code: ConnectionError["code"], message: string): ConnectionResult => {
    credentialRef = undefined;
    error = { code, message };
    move("error");
    return { state, error };
  };

  return {
    describe: () => descriptor,
    status: () => state,
    listModels: () => (state === "connected" ? models : []),
    connect: async () => {
      move("connecting");
      const verifier = createCodeVerifier();
      const sentState = createState();
      const codeChallenge = await challengeFromVerifier(verifier);
      const outcome = await broker.authorize({ providerKey: descriptor.providerKey, scopes: descriptor.scopes ?? [], state: sentState, codeChallenge });
      if (outcome.error) return fail(outcome.error.code, outcome.error.message);
      if (outcome.state !== sentState) return fail("oauth_state_mismatch", "Authorization state did not match — request rejected.");
      if (!outcome.code) return fail("cancelled", "Authorization was cancelled.");
      const exchanged = await broker.exchange({ providerKey: descriptor.providerKey, code: outcome.code, codeVerifier: verifier });
      if (!exchanged.ok || !exchanged.credentialRef) {
        return fail(exchanged.error?.code ?? "invalid_credential", exchanged.error?.message ?? "Token exchange failed.");
      }
      error = undefined;
      credentialRef = exchanged.credentialRef;
      move("connected");
      return { state, credentialRef };
    },
    validate: async () => {
      if (state === "disconnected" || !credentialRef) return { state, error, credentialRef };
      move("connecting");
      const result = await broker.validate(descriptor.providerKey, credentialRef);
      if (result.ok) {
        error = undefined;
        move("connected");
        return { state, credentialRef };
      }
      return fail(result.code ?? "invalid_credential", result.message ?? "Credential is no longer valid.");
    },
    disconnect: async () => {
      if (credentialRef) await broker.revoke(descriptor.providerKey, credentialRef);
      error = undefined;
      credentialRef = undefined;
      move("disconnected");
    },
  };
}
