/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   crypto.ts                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * End-to-end DM crypto, WebCrypto only (no deps). P-256 ECDH → HKDF-SHA256 →
 * AES-256-GCM. Both peers derive the SAME conversation key from their private
 * key + the other's public key + a shared salt (the sorted dm key), so the
 * server never sees plaintext or any key. Messages are wrapped in an
 * `osio-e2e:1:<base64(iv|ciphertext)>` envelope stored as the message content.
 * The `alg` is pinned to 1 so X25519 can slot in later without breaking old rows.
 */

const ENVELOPE_PREFIX = 'osio-e2e:1:';
const HKDF_INFO = new TextEncoder().encode('osio-dm-v1');

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
}

export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  return toBase64(new Uint8Array(await crypto.subtle.exportKey('spki', publicKey)));
}

async function importPublicKey(base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('spki', fromBase64(base64), { name: 'ECDH', namedCurve: 'P-256' }, true, []);
}

/** Symmetric: ECDH(myPriv, peerPub) → HKDF(salt) → AES-GCM key. Both peers match. */
export async function deriveConversationKey(myPrivate: CryptoKey, peerPublicBase64: string, salt: string): Promise<CryptoKey> {
  const peerPublic = await importPublicKey(peerPublicBase64);
  const sharedBits = await crypto.subtle.deriveBits({ name: 'ECDH', public: peerPublic }, myPrivate, 256);
  const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode(salt), info: HKDF_INFO },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function isEncrypted(content: string | null | undefined): boolean {
  return typeof content === 'string' && content.startsWith(ENVELOPE_PREFIX);
}

export async function encryptMessage(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)));
  const packed = new Uint8Array(iv.length + ciphertext.length);
  packed.set(iv, 0);
  packed.set(ciphertext, iv.length);
  return ENVELOPE_PREFIX + toBase64(packed);
}

export async function decryptMessage(key: CryptoKey, envelope: string): Promise<string> {
  const packed = fromBase64(envelope.slice(ENVELOPE_PREFIX.length));
  const iv = packed.slice(0, 12);
  const ciphertext = packed.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

/** Stable shared salt for a DM: both members sort the two ids the same way. */
export function dmSalt(userA: string, userB: string): string {
  return [userA, userB].sort((a, b) => a.localeCompare(b)).join(':');
}
