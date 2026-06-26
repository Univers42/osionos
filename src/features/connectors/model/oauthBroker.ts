/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   oauthBroker.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { api, getActivePageJwt } from "@/shared/api/client";
import { createMockAuthServer } from "../adapters/mockAuthServer";
import { randomString } from "../adapters/pkce";
import type { OAuthBroker } from "../adapters/oauthAdapter";

/**
 * OAuth broker for "connect without an API key".
 *  • ONLINE (a bridge is configured): the auth-code + PKCE handshake and the token
 *    EXCHANGE are brokered by the bridge — the token stays server-side and the
 *    client only receives an opaque CredentialRef (§6.4).
 *  • OFFLINE/dev (no bridge, e.g. the test harness): the same PKCE flow runs against
 *    an in-client mock AS; the mock token is DISCARDED (never stored/exposed) and
 *    only a CredentialRef is kept, so no real secret ever lives client-side.
 */
interface AuthorizeResponse { code?: string; state?: string }
interface ExchangeResponse { ok?: boolean; credentialRef?: { handle: string }; code?: string; message?: string }

function createBridgeBroker(): OAuthBroker {
  const jwt = () => getActivePageJwt() ?? undefined;
  return {
    async authorize({ state, codeChallenge, scopes }) {
      const query = new URLSearchParams({ state, code_challenge: codeChallenge, scope: scopes.join(" ") }).toString();
      try {
        const r = await api.get<AuthorizeResponse>(`/api/connector/oauth/mock/authorize?${query}`, jwt());
        return { code: r?.code, state: r?.state };
      } catch {
        return { error: { code: "unreachable", message: "Authorization server is unreachable." } };
      }
    },
    async exchange({ providerKey, code, codeVerifier }) {
      try {
        const r = await api.post<ExchangeResponse>("/api/connector/oauth/exchange", { providerKey, code, codeVerifier }, jwt());
        if (r?.ok && r.credentialRef) return { ok: true, credentialRef: r.credentialRef };
        return { ok: false, error: { code: (r?.code as never) ?? "invalid_credential", message: r?.message ?? "Token exchange failed." } };
      } catch {
        return { ok: false, error: { code: "unreachable", message: "Token exchange is unreachable." } };
      }
    },
    async validate(providerKey, ref) {
      try {
        const r = await api.post<{ ok?: boolean }>("/api/connector/oauth/validate", { providerKey, credentialRef: ref }, jwt());
        return { ok: r?.ok === true };
      } catch {
        return { ok: false, code: "unreachable", message: "Validation is unreachable." };
      }
    },
    async revoke(providerKey, ref) {
      try {
        await api.post("/api/connector/oauth/disconnect", { providerKey, credentialRef: ref }, jwt());
      } catch {
        /* best-effort: local state still resets */
      }
    },
  };
}

function createClientMockBroker(): OAuthBroker {
  const as = createMockAuthServer();
  const connected = new Set<string>();
  return {
    authorize: (input) => as.authorize(input),
    async exchange({ providerKey, code, codeVerifier }) {
      const token = await as.token({ code, codeVerifier });
      if (!token.ok) return { ok: false, error: { code: "invalid_credential", message: "Authorization failed." } };
      // DEV/offline: the mock token is DISCARDED here — only an opaque ref is kept.
      const handle = `oauth:${providerKey}:offline-${randomString(8)}`;
      connected.add(handle);
      return { ok: true, credentialRef: { handle } };
    },
    async validate(_providerKey, ref) { return { ok: connected.has(ref.handle) }; },
    async revoke(_providerKey, ref) { connected.delete(ref.handle); },
  };
}

export function createOAuthBroker(): OAuthBroker {
  const base = ((import.meta.env as Record<string, string>)?.VITE_API_URL ?? "").trim();
  return base ? createBridgeBroker() : createClientMockBroker();
}
