/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useSummonInbox.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 18:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 18:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Bridges incoming directed summons from the channel to the consent UI (AOC §7).
 * It registers ONE request handler that resolves only when the user answers via
 * the SummonPrompt — so the requester's synthesized reply reflects real consent.
 * A TTL auto-declines an ignored prompt (matching the requester's own timeout).
 */

import { useEffect } from 'react';

import { useCollabStore } from '../store/useCollabStore';
import { useSummonStore } from '../store/useSummonStore';

const SUMMON_TTL_MS = 30_000; // mirror the adapter's request timeout

export function useSummonInbox(active: boolean): void {
  const onRequest = useCollabStore((state) => state.onRequest);

  useEffect(() => {
    if (!active) return undefined;
    return onRequest((from, req) => new Promise((resolve) => {
      const timer = setTimeout(() => useSummonStore.getState().resolvePending(from, false), SUMMON_TTL_MS);
      useSummonStore.getState().present({
        fromId: from,
        route: req.route,
        message: req.message,
        resolve: (accepted) => { clearTimeout(timer); resolve({ accepted }); },
      });
    }));
  }, [active, onRequest]);
}
