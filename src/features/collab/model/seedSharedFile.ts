/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   seedSharedFile.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 19:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 19:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Orchestrates seeding a file into a Shared space (AOC §4/§6) and ENFORCES the
 * ephemeral/durable split: the bytes are persisted durably FIRST (HTTP → bridge
 * → storage, the injected `upload` port), and only on success is a tiny
 * reference announced over the ephemeral transport — id + name + op, never
 * bytes. A failed upload therefore never produces a phantom file on peers, and
 * the realtime path never carries payload. `upload` is injected so this is unit-
 * testable; the real adapter is api/uploadSharedFile.
 */

import type { CollabEvent } from './realtimeTransport.port';

/** Structural file shape (a DOM File satisfies it) — keeps the model DOM-free. */
export interface UploadableFile { name: string; type: string; size: number; }
export interface SeededFileRef { fileId: string; name: string; }

export interface SeedFileDeps {
  selfId: string;
  upload: (spaceId: string, file: UploadableFile) => Promise<SeededFileRef>; // DURABLE
  broadcast: (event: CollabEvent) => void;                                    // EPHEMERAL (announce only)
}

export async function seedSharedFile(
  spaceId: string, file: UploadableFile, deps: SeedFileDeps,
): Promise<SeededFileRef> {
  const ref = await deps.upload(spaceId, file); // persist bytes FIRST — the durable path
  deps.broadcast({ t: 'file', actor: deps.selfId, fileId: ref.fileId, op: 'seeded', name: ref.name });
  return ref;
}
