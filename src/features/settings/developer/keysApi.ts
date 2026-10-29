/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   keysApi.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The SSH and GPG keys client: one function per route of scripts/bridge-account-keys.mjs,
// through the same `api` client and page JWT as patApi, so the sudo seam applies. Only
// public keys are handled; the server is the authority on what a key is.
//
// Caveat: looksPrivate is a substring check for the common private-key headers, so a
// private key pasted without its header slips past it. The bridge refuses those by
// content, and its answer is shown as is.

import { api, getActivePageJwt } from "@/shared/api/client";

export type KeyKind = "ssh" | "gpg";

export interface AccountKey {
  id: string;
  kind: KeyKind;
  title: string;
  fingerprint: string;
  keyType: string | null;
  createdAt: string | null;
}

export interface AddKeyBody {
  kind: KeyKind;
  title: string;
  publicKey: string;
}

const KEYS_PATH = "/api/account/keys";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE_MARKERS = /PRIVATE KEY|openssh-key-v1/;
const NOT_CONFIRMED = "The key was added but the server did not confirm it. Reload the list.";

const ERROR_COPY: Record<string, string> = {
  key_invalid: "That does not look like a public key. Paste one line from your .pub file, or a PGP public key block.",
  key_weak: "That RSA key is too short. Use an Ed25519 key, or an RSA key of at least 3072 bits.",
  key_unsupported: "That key type is not supported. Use Ed25519, ECDSA or RSA for SSH, or a version 4 PGP key.",
  private_key_refused: "That is a private key. Paste the public key instead; a private key never leaves your machine.",
  key_exists: "You already saved this key.",
  key_limit: "You have reached the limit of 50 keys. Delete one you no longer use, then try again.",
  key_not_found: "That key is already gone. Reload the list.",
  invalid_key_body: "Check the title and the key, then try again.",
  sudo_required: "Confirm it is you first, then try again.",
  rate_limited: "Too many attempts. Wait a while, then try again.",
  account_plane_unavailable: "Keys are unavailable right now. Try again in a moment.",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The friendly copy for a bridge error code; an unknown code keeps the bridge's own message. */
export function keyErrorMessage(code: string | undefined, fallback: string): string {
  if (code && ERROR_COPY[code]) return ERROR_COPY[code];
  return fallback.trim() || "That did not go through. Try again.";
}

export function failureOf(error: unknown): string {
  const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : undefined;
  return keyErrorMessage(code, error instanceof Error ? error.message : "");
}

export function looksPrivate(text: string): boolean {
  return PRIVATE_MARKERS.test(text);
}

/** The request body, or null while the form is not ready to send (including a private paste). */
export function addKeyBody(kind: KeyKind, title: string, publicKey: string): AddKeyBody | null {
  const trimmedTitle = title.trim();
  const trimmedKey = publicKey.trim();
  if (trimmedTitle === "" || trimmedKey === "" || looksPrivate(trimmedKey)) return null;
  return { kind, title: trimmedTitle, publicKey: trimmedKey };
}

/** One key entry, or null when it has no uuid or kind. Only the contract fields are kept. */
function parseKey(value: unknown): AccountKey | null {
  if (!isRecord(value) || typeof value.id !== "string" || !UUID.test(value.id)) return null;
  if (value.kind !== "ssh" && value.kind !== "gpg") return null;
  const text = (field: unknown) => (typeof field === "string" ? field : null);
  return {
    id: value.id, kind: value.kind, title: text(value.title) ?? "", fingerprint: text(value.fingerprint) ?? "",
    keyType: text(value.keyType), createdAt: text(value.createdAt),
  };
}

export function parseKeyList(body: unknown): AccountKey[] {
  const rows = isRecord(body) && Array.isArray(body.keys) ? body.keys : [];
  return rows.map(parseKey).filter((key): key is AccountKey => key !== null);
}

export function parseKeyCreated(body: unknown): AccountKey {
  const key = isRecord(body) ? parseKey(body.key) : null;
  if (!key) throw new Error(NOT_CONFIRMED);
  return key;
}

const jwt = (): string | undefined => getActivePageJwt() ?? undefined;

export async function listKeys(): Promise<AccountKey[]> {
  return parseKeyList(await api.get<unknown>(KEYS_PATH, jwt()));
}

export async function addKey(body: AddKeyBody): Promise<AccountKey> {
  return parseKeyCreated(await api.post<unknown>(KEYS_PATH, body, jwt()));
}

export async function deleteKey(id: string): Promise<void> {
  await api.delete<unknown>(`${KEYS_PATH}/${encodeURIComponent(id)}`, jwt());
}
