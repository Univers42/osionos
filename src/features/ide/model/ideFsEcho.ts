/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ideFsEcho.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The pure core of the fs writeback: content hashing, echo suppression, and
// event parsing. Deliberately free of any `@/…` value import so it unit-tests
// under the node canvas runner (which resolves relative paths only).

// Echo suppression: every editor→container / materialize write records the
// content hash here; the fs-agent later re-emits that write, and the writeback
// consumer skips it when the hash is still recorded. Hash = sha256(UTF-8 bytes)
// first 16 hex — byte-identical to the fs-agent's hash of the same file.
const ECHO_TTL_MS = 15_000;
const recentEditorHashes = new Map<string, number>(); // hash -> expiry ms

/** sha256(content) first 16 hex — matches osio-fs-agent.hashContent exactly. */
export async function sha16(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

export function recordEditorHash(hash: string, now: number = Date.now()): void {
  recentEditorHashes.set(hash, now + ECHO_TTL_MS);
  if (recentEditorHashes.size > 256) {
    for (const [h, exp] of recentEditorHashes) if (exp < now) recentEditorHashes.delete(h);
  }
}

/** True when `hash` was recorded by a recent local write (its echo). */
export function isEchoHash(hash: string, now: number = Date.now()): boolean {
  const exp = recentEditorHashes.get(hash);
  if (exp == null) return false;
  if (exp < now) { recentEditorHashes.delete(hash); return false; }
  return true;
}

export interface FsEvent {
  event: string; // "ready" | "write" | "delete"
  path: string;
  hash?: string;
  content?: string; // base64 (write events only)
  root?: string;
}

/** Parse one fs-agent stdout line into a typed event, tolerating the CR the PTY
 *  adds and any non-JSON noise. Returns null on anything unparseable. */
export function parseFsEvent(line: string): FsEvent | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed[0] !== "{") return null;
  try {
    const obj = JSON.parse(trimmed) as Partial<FsEvent>;
    if (typeof obj.event !== "string" || typeof obj.path !== "string") return null;
    return obj as FsEvent;
  } catch {
    return null;
  }
}
