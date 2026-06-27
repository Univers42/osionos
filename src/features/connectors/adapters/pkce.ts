/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pkce.ts                                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * PKCE + state primitives for the OAuth authorization-code flow (§6.3), built on
 * Web Crypto — NO new dependency (the lockfile's stray `pkce-challenge` is unused).
 * The `code_verifier` and `state` are single-use and ephemeral; the access token
 * never lives here (it is held by the bridge — §6.4).
 */

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** Cryptographically-random URL-safe string of `byteLength` bytes. */
export function randomString(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return base64url(bytes);
}

/** A high-entropy PKCE code verifier (43–128 chars per RFC 7636). */
export function createCodeVerifier(): string {
  return randomString(48);
}

/** A cryptographically-random anti-CSRF `state` value validated on callback. */
export function createState(): string {
  return randomString(24);
}

/** S256 challenge: base64url(SHA-256(verifier)). */
export async function challengeFromVerifier(verifier: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}
