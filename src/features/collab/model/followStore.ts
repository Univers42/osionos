/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   followStore.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Follow mode state: which remote collaborator the local editor is tracking, or
 * nobody. State only; the scroll loop that acts on it lives in
 * ui/useFollowCollaborator.ts so this stays importable (and testable) without a
 * DOM. Follow is per tab and never persisted: reopening the app starts free.
 */

import { create } from 'zustand';

import { useCollabStore } from '../store/useCollabStore';
import { memberIdOf } from './collabActor';
import { seekCaret } from './presenceDom';
import type { RemoteCursor } from './remoteCursors';

interface FollowState {
  following: string | null;
  follow: (actor: string) => void;
  stop: () => void;
  /** Stop when the followed actor has no cursor left or its member left the space. */
  releaseIfGone: (cursors: ReadonlyMap<string, RemoteCursor>, presentMemberIds: ReadonlySet<string>) => void;
}

export const useFollowStore = create<FollowState>((set, get) => ({
  following: null,
  follow: (actor) => set({ following: actor }),
  stop: () => { if (get().following !== null) set({ following: null }); },
  releaseIfGone: (cursors, presentMemberIds) => {
    const { following } = get();
    if (following !== null && (!cursors.has(following) || !presentMemberIds.has(memberIdOf(following)))) {
      set({ following: null });
    }
  },
}));

/** Scroll the editor to a collaborator's caret once, without moving focus.
 *  Safe to call for an actor that has since left: it finds no caret and stops. */
export function jumpToActor(actor: string): void {
  seekCaret(() => useCollabStore.getState().cursors.get(actor));
}
