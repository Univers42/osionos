/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mockAuthServer.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { challengeFromVerifier, randomString } from "./pkce";

/**
 * In-memory mock authorization server (§6.3) — exercises the full PKCE
 * authorization-code flow without a real provider. The token endpoint enforces
 * PKCE (S256): it recomputes the challenge from the verifier and rejects a
 * mismatch. Swapping this for a real AS is config-only (the adapter/broker
 * contract is unchanged).
 */
export interface MockAuthServer {
  /** Issue an auth code bound to the PKCE challenge + state (echoes state back). */
  authorize(input: { state: string; codeChallenge: string; scopes?: string[] }): Promise<{ code: string; state: string }>;
  /** Exchange code + verifier for tokens; rejects a bad/missing code or wrong verifier. */
  token(input: { code: string; codeVerifier: string }): Promise<
    { ok: true; accessToken: string; refreshToken: string } | { ok: false; error: string }
  >;
}

interface PendingCode {
  codeChallenge: string;
  state: string;
}

export function createMockAuthServer(): MockAuthServer {
  const pending = new Map<string, PendingCode>();

  return {
    async authorize({ state, codeChallenge }) {
      const code = randomString(18);
      pending.set(code, { codeChallenge, state });
      return { code, state };
    },
    async token({ code, codeVerifier }) {
      const record = pending.get(code);
      if (!record) return { ok: false, error: "invalid_grant" };
      pending.delete(code); // single-use code
      const expected = await challengeFromVerifier(codeVerifier);
      if (expected !== record.codeChallenge) return { ok: false, error: "invalid_grant" };
      return { ok: true, accessToken: `mock-access-${code}`, refreshToken: `mock-refresh-${code}` };
    },
  };
}
