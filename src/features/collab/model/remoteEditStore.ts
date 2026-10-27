/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   remoteEditStore.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Holds what other people's edits just did to this page: the flash list the overlay
 * draws and the typing stamps the roster reads. useLiveBlockSync writes it through
 * recordAppliedEdits at the one place a remote op lands in the page store, so it
 * knows nothing about the editor and the editor never subscribes to it. Not
 * persisted: a reload starts with nothing flashing and nobody typing.
 */

import { create } from 'zustand';

import { memberIdOf } from './collabActor';
import type { BlockRegisterTable } from './blockSync';
import type { BlockOp } from './realtimeTransport.port';
import { appliedOps, liveFlashes, recordFlash, type EditFlash } from './remoteEditFlash';
import { noteEdit, type EditedAt } from './typingActivity';

interface RemoteEditState {
  flashes: readonly EditFlash[];
  editedAt: EditedAt;
  /** Stamp the ops of one applied remote batch. Puts flash; every op counts as typing. */
  record: (ops: readonly BlockOp[], actor: string, now: number) => void;
  /** Drop expired flashes. A no-op, with no notification, while all are live. */
  prune: (now: number) => void;
}

export const useRemoteEditStore = create<RemoteEditState>((set, get) => ({
  flashes: [],
  editedAt: {},
  record: (ops, actor, now) => {
    if (ops.length === 0) return;
    let flashes = get().flashes;
    for (const op of ops) {
      if (op.k === 'put') flashes = recordFlash(flashes, { blockId: op.id, actor, at: now });
    }
    set({ flashes, editedAt: noteEdit(get().editedAt, memberIdOf(actor), now) });
  },
  prune: (now) => {
    const flashes = liveFlashes(get().flashes, now);
    if (flashes !== get().flashes) set({ flashes });
  },
}));

/** Record the ops of a remote batch that really landed (won last-writer-wins). */
export function recordAppliedEdits(
  ops: readonly BlockOp[],
  actor: string,
  registers: BlockRegisterTable,
  now = Date.now(),
): void {
  useRemoteEditStore.getState().record(appliedOps(ops, actor, registers), actor, now);
}
