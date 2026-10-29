/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ideVigilant.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Pure half of vigilant mode: which account keys go to the sandbox, how `git log %G?` codes read,
// and when the badge shows. No imports, so the canvas suite loads it bare.
//
// Caveat: the signature code comes from git inside the sandbox and is only as good as the synced
// allowed_signers file. A box whose keys were never synced reports every signed commit as
// unverified (U), which over-warns; it never reports an unsigned commit as good.

export type SignatureState = "signed" | "unsigned" | "unverified";

export interface SignedCommit {
  hash: string;
  subject: string;
  state: SignatureState;
}

export interface SyncKey {
  type: string;
  blob: string;
}

/** The `git log` argv for the vigilant list; never used when the flag is off. */
export const VIGILANT_LOG_ARGV = ["git", "log", "--format=%G?%x09%h%x09%s", "-n", "10"] as const;

const SSH_LINE = /^(\S+)\s+([A-Za-z0-9+/=]+)(?:\s|$)/;

/** `vigilantMode` must be literally true; anything else, including absence, is off. */
export function vigilantOf(preferences: unknown): boolean {
  return typeof preferences === "object" && preferences !== null && (preferences as { vigilantMode?: unknown }).vigilantMode === true;
}

/** `{type, blob}` for every ssh key in the account keys reply; the server re-validates each pair. */
export function sshItemsOf(body: unknown): SyncKey[] {
  const rows = typeof body === "object" && body !== null && Array.isArray((body as { keys?: unknown }).keys) ? (body as { keys: unknown[] }).keys : [];
  const items: SyncKey[] = [];
  for (const row of rows) {
    const key = row as { kind?: unknown; publicKey?: unknown };
    if (key?.kind !== "ssh" || typeof key.publicKey !== "string") continue;
    const match = SSH_LINE.exec(key.publicKey.trim());
    if (match) items.push({ type: match[1], blob: match[2] });
  }
  return items;
}

/** N is unsigned, G is good, and every other code (U, E, B, X, Y, R) is a signature that does not check out. */
export function signatureState(code: string): SignatureState {
  if (code === "G") return "signed";
  return code === "N" ? "unsigned" : "unverified";
}

export function parseSignedLog(output: string): SignedCommit[] {
  return output.split("\n").flatMap((line) => {
    const [code, hash, ...subject] = line.replace(/\r$/, "").split("\t");
    if (!code || !hash) return [];
    return [{ hash, subject: subject.join("\t"), state: signatureState(code) }];
  });
}

/** Shown only for a connected sandbox, with the flag on, and at least one ssh key to check against. */
export function showVigilantBadge(vigilant: boolean, connected: boolean | null, keyCount: number): boolean {
  return vigilant && connected === true && keyCount > 0;
}
