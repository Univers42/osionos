/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   connectors-oauth.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { createMockAuthServer } from "@/features/connectors/adapters/mockAuthServer";
import { createOAuthConnector, type OAuthBroker } from "@/features/connectors/adapters/oauthAdapter";
import { randomString } from "@/features/connectors/adapters/pkce";
import type { ConnectorDescriptor, ModelDescriptor } from "@/features/connectors/model/connectorTypes";

const DESCRIPTOR: ConnectorDescriptor = {
  providerKey: "mockoauth",
  displayName: "Mock OAuth",
  authStrategy: "oauth",
  scopes: ["read", "write"],
};
const MODELS: ModelDescriptor[] = [{ id: "mock-1", displayName: "Mock Model" }];

/** Broker over the mock AS that keeps the token SERVER-SIDE (returns only a ref). */
function brokerOver(opts: { tamperState?: boolean; noCode?: boolean } = {}): OAuthBroker & {
  tokens: Map<string, { accessToken: string; refreshToken: string }>;
} {
  const as = createMockAuthServer();
  const tokens = new Map<string, { accessToken: string; refreshToken: string }>();
  return {
    tokens,
    async authorize(input) {
      const out = await as.authorize(input);
      if (opts.noCode) return { state: out.state };
      return { code: out.code, state: opts.tamperState ? `${out.state}TAMPER` : out.state };
    },
    async exchange({ providerKey, code, codeVerifier }) {
      const t = await as.token({ code, codeVerifier });
      if (!t.ok) return { ok: false, error: { code: "invalid_credential", message: "exchange failed" } };
      const handle = `oauth:${providerKey}:${randomString(8)}`;
      tokens.set(handle, { accessToken: t.accessToken, refreshToken: t.refreshToken });
      return { ok: true, credentialRef: { handle } };
    },
    async validate(_provider, ref) {
      return { ok: tokens.has(ref.handle) };
    },
    async revoke(_provider, ref) {
      tokens.delete(ref.handle);
    },
  };
}

test("oauth/pkce: full flow completes against the mock AS → connected", async () => {
  const broker = brokerOver();
  const c = createOAuthConnector({ descriptor: DESCRIPTOR, models: MODELS }, broker);
  const result = await c.connect();
  assert.equal(result.state, "connected");
  assert.equal(c.status(), "connected");
  assert.equal(c.listModels().length, MODELS.length);
  assert.ok(result.credentialRef?.handle.startsWith("oauth:mockoauth:"));
  assert.equal(broker.tokens.size, 1); // token minted + held server-side
});

test("oauth/pkce: tampered/mismatched state is rejected", async () => {
  const c = createOAuthConnector({ descriptor: DESCRIPTOR, models: MODELS }, brokerOver({ tamperState: true }));
  const result = await c.connect();
  assert.equal(result.state, "error");
  assert.equal(result.error?.code, "oauth_state_mismatch");
  assert.equal(c.listModels().length, 0);
});

test("oauth/pkce: cancelled authorization (no code) → error", async () => {
  const c = createOAuthConnector({ descriptor: DESCRIPTOR, models: MODELS }, brokerOver({ noCode: true }));
  const result = await c.connect();
  assert.equal(result.state, "error");
  assert.equal(result.error?.code, "cancelled");
});

test("oauth/pkce: token endpoint enforces PKCE (wrong verifier rejected)", async () => {
  const as = createMockAuthServer();
  const { code } = await as.authorize({ state: "s", codeChallenge: "challenge-for-a-different-verifier" });
  const bad = await as.token({ code, codeVerifier: "totally-wrong-verifier" });
  assert.equal(bad.ok, false);
});

test("oauth/pkce: disconnect revokes the credential and drops models", async () => {
  const broker = brokerOver();
  const c = createOAuthConnector({ descriptor: DESCRIPTOR, models: MODELS }, broker);
  await c.connect();
  assert.equal(broker.tokens.size, 1);
  await c.disconnect();
  assert.equal(c.status(), "disconnected");
  assert.deepEqual(c.listModels(), []);
  assert.equal(broker.tokens.size, 0); // server-side token forgotten
});

test("oauth/pkce: re-validate confirms a live credential", async () => {
  const broker = brokerOver();
  const c = createOAuthConnector({ descriptor: DESCRIPTOR, models: MODELS }, broker);
  await c.connect();
  const result = await c.validate();
  assert.equal(result.state, "connected");
});
