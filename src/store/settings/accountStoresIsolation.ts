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

import { useAccountEmailsStore } from './useAccountEmailsStore';
import { useAccountSettingsStore } from './useAccountSettingsStore';

/**
 * Both stores persist to localStorage under one global key each, so a sign-out or a user
 * switch must empty them or the next user would see the previous one's address.
 * Caveat: only the active-user change triggers this; a second tab keeps its own copy in
 * memory until it reloads.
 */
export function resetAccountStores(): void {
  useAccountSettingsStore.setState({ data: null, loading: false, error: null });
  useAccountEmailsStore.setState({ data: [], loading: false, error: null });
  // zustand omits `persist` when no storage exists (SSR, node tests), so it is optional at runtime.
  (useAccountSettingsStore.persist as Partial<typeof useAccountSettingsStore.persist> | undefined)?.clearStorage?.();
  (useAccountEmailsStore.persist as Partial<typeof useAccountEmailsStore.persist> | undefined)?.clearStorage?.();
}
