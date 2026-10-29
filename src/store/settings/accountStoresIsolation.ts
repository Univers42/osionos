/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   accountStoresIsolation.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { advanceAccountEpoch } from './accountEpoch';
import { useAccountEmailsStore } from './useAccountEmailsStore';
import { useAccountSettingsStore } from './useAccountSettingsStore';

/**
 * Both stores persist to localStorage under one global key each, so a sign-out or a user
 * switch must empty them or the next user would see the previous one's address.
 * Caveat: only the active-user change triggers this; a second tab keeps its own copy in
 * memory until it reloads.
 */
export function resetAccountStores(): void {
  advanceAccountEpoch();
  useAccountSettingsStore.setState({ data: null, loading: false, error: null });
  useAccountEmailsStore.setState({ data: [], loading: false, error: null });
  // zustand omits `persist` when no storage exists (SSR, node tests), so it is optional at runtime.
  (useAccountSettingsStore.persist as Partial<typeof useAccountSettingsStore.persist> | undefined)?.clearStorage?.();
  (useAccountEmailsStore.persist as Partial<typeof useAccountEmailsStore.persist> | undefined)?.clearStorage?.();
}

interface ActiveUserSource {
  getState: () => { activeUserId: string };
  subscribe: (listener: (state: { activeUserId: string }) => void) => unknown;
}

/**
 * Resets the account stores when the active user really changes. A change from '' is a cold
 * boot or a fresh sign-in: nothing of another user can be on screen, and `hydrate(userId)`
 * already discards persisted data of a different user.
 */
export function resetOnUserChange(source: ActiveUserSource): void {
  let previous = source.getState().activeUserId;
  source.subscribe(({ activeUserId }) => {
    if (activeUserId === previous) return;
    const wasSignedOut = previous === '';
    previous = activeUserId;
    if (wasSignedOut) advanceAccountEpoch();
    else resetAccountStores();
  });
}
