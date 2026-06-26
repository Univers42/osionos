/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   connectors-security.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { challengeFromVerifier, createCodeVerifier, createState, randomString } from "@/features/connectors/adapters/pkce";
import { createMockAuthServer } from "@/features/connectors/adapters/mockAuthServer";
import { createOAuthConnector, type OAuthBroker } from "@/features/connectors/adapters/oauthAdapter";
import type { ConnectorDescriptor } from "@/features/connectors/model/connectorTypes";

test("pkce: challenge differs from verifier and is deterministic", async () => {
  const verifier = createCodeVerifier();
  const challenge = await challengeFromVerifier(verifier);
  assert.notEqual(challenge, verifier);
  assert.equal(challenge, await challengeFromVerifier(verifier)); // S256 is deterministic
  assert.ok(!/[+/=]/.test(challenge)); // url-safe, unpadded
});

test("pkce: verifiers/states are unique (entropy)", () => {
  const samples = new Set<string>();
  for (let i = 0; i < 50; i += 1) {
    samples.add(createCodeVerifier());
    samples.add(createState());
  }
  assert.equal(samples.size, 100);
});

test("security: no access/refresh token reaches the connect result or snapshot", async () => {
  const as = createMockAuthServer();
  const held: string[] = [];
  const broker: OAuthBroker = {
    async authorize(input) { return as.authorize(input); },
    async exchange({ providerKey, code, codeVerifier }) {
      const t = await as.token({ code, codeVerifier });
      if (!t.ok) return { ok: false };
      held.push(t.accessToken, t.refreshToken); // tokens live ONLY here (server-side analog)
      return { ok: true, credentialRef: { handle: `oauth:${providerKey}:ref` } };
    },
    async validate() { return { ok: true }; },
    async revoke() {},
  };
  const descriptor: ConnectorDescriptor = { providerKey: "mockoauth", displayName: "Mock", authStrategy: "oauth", scopes: ["read"] };
  const c = createOAuthConnector({ descriptor, models: [{ id: "m", displayName: "M" }] }, broker);
  const result = await c.connect();

  const serialized = JSON.stringify(result);
  for (const token of held) {
    assert.ok(token.length > 0);
    assert.ok(!serialized.includes(token), "token must not appear in the connect result");
  }
  // The only credential surfaced to the domain is an opaque ref (no token material).
  assert.equal(result.credentialRef?.handle, "oauth:mockoauth:ref");
  assert.ok(!/access|refresh|mock-access|mock-refresh/.test(JSON.stringify(result.credentialRef)));
});

test("security: a random verifier never collides with a fixed challenge", async () => {
  const challenge = await challengeFromVerifier("a-known-verifier");
  const other = await challengeFromVerifier(randomString(48));
  assert.notEqual(challenge, other);
});
