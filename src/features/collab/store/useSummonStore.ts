/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useSummonStore.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 18:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 18:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The consent state machine for an INCOMING summon (AOC §7). A summon is only
 * ever a REQUEST: the summoned member must explicitly Accept or Decline — nothing
 * moves them without consent. This store holds the single pending request and
 * the resolver that answers the requester. A new summon supersedes a stale one
 * (auto-declined), and a TTL timer can resolve a pending request the user
 * ignored. Transport-free; the inbox hook bridges it to the channel.
 */

import { create } from 'zustand';

export interface IncomingSummon {
  fromId: string;
  route: string;
  message?: string;
  resolve: (accepted: boolean) => void; // answers the requester (synthesized reply)
}

interface SummonStore {
  incoming: IncomingSummon | null;
  present: (summon: IncomingSummon) => void;
  answer: (accepted: boolean) => void;
  resolvePending: (fromId: string, accepted: boolean) => void; // TTL/timeout path
}

export const useSummonStore = create<SummonStore>((set, get) => ({
  incoming: null,

  present: (summon) => {
    const prior = get().incoming;
    if (prior) prior.resolve(false); // superseded → auto-decline so the requester isn't left hanging
    set({ incoming: summon });
  },

  answer: (accepted) => {
    const current = get().incoming;
    if (!current) return;
    current.resolve(accepted);
    set({ incoming: null });
  },

  resolvePending: (fromId, accepted) => {
    const current = get().incoming;
    if (current && current.fromId === fromId) {
      current.resolve(accepted);
      set({ incoming: null });
    }
  },
}));
