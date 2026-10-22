/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useCommunity.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Community hooks: thin wrappers over communityApi that track a `busy` flag and
 * surface the last error in one place. `useCommunities` lists my communities;
 * `useCommunity(id)` loads one with its channels; both share the create/join
 * mutators so the modal, list and panel never re-implement the bridge calls.
 */

import { useCallback, useEffect, useState } from 'react';

import {
  createCommunity,
  getCommunity,
  joinCommunity,
  listCommunities,
  type Community,
} from '@/shared/social/communityApi';
import { warningFrom, type ModerationWarning } from '@/shared/moderation/moderationWarning';

function useBridgeOp() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<ModerationWarning | null>(null);
  const run = useCallback(async <T>(op: () => Promise<T>): Promise<T | null> => {
    setBusy(true);
    setError(null);
    setWarning(null);
    try {
      return await op();
    } catch (cause) {
      // L0's warning is not an error message: it is the author's question, and
      // the screen shows it as one.
      const asked = warningFrom(cause);
      if (asked) {
        setWarning(asked);
      } else {
        setError(cause instanceof Error ? cause.message : 'Something went wrong');
      }
      return null;
    } finally {
      setBusy(false);
    }
  }, []);
  const dismissWarning = useCallback(() => setWarning(null), []);
  return { busy, error, warning, dismissWarning, run };
}

/** List my communities (load on mount, expose a manual `reload`). */
export function useCommunities() {
  const { busy, error, run } = useBridgeOp();
  const [communities, setCommunities] = useState<Community[]>([]);
  const reload = useCallback(async () => {
    const next = await run(listCommunities);
    if (next) setCommunities(next);
  }, [run]);
  // Defer to a microtask so run()'s setBusy doesn't fire synchronously in the effect.
  useEffect(() => {
    queueMicrotask(() => { void reload(); });
  }, [reload]);
  return { communities, busy, error, reload };
}

/** Load one community (with channels[]) by id; null until loaded. */
export function useCommunity(id: string | null) {
  const { busy, error, run } = useBridgeOp();
  const [community, setCommunity] = useState<Community | null>(null);
  const reload = useCallback(async () => {
    if (!id) {
      setCommunity(null);
      return;
    }
    const next = await run(() => getCommunity(id));
    if (next) setCommunity(next);
  }, [id, run]);
  // Defer to a microtask so run()'s setBusy doesn't fire synchronously in the effect.
  useEffect(() => {
    queueMicrotask(() => { void reload(); });
  }, [reload]);
  const join = useCallback(async () => {
    if (!id) return false;
    // The bridge join returns { joined } (not the community) — reload to pull the
    // refreshed memberRole + channels.
    const ok = await run(() => joinCommunity(id));
    if (ok) await reload();
    return Boolean(ok);
  }, [id, run, reload]);
  return { community, busy, error, reload, join };
}

/**
 * Create-community mutator for the modal.
 *
 * `warning` is L0's question (the community was not written): the modal shows
 * it and the author creates it anyway with `{ acknowledgeWarning: true }`.
 */
export function useCreateCommunity() {
  const { busy, error, warning, dismissWarning, run } = useBridgeOp();
  const create = useCallback(
    (
      input: { name: string; description?: string; avatar?: string },
      { acknowledgeWarning }: { acknowledgeWarning?: boolean } = {},
    ): Promise<Community | null> =>
      run(() => createCommunity(input, { acknowledgeWarning })),
    [run],
  );
  return { busy, error, warning, dismissWarning, create };
}
